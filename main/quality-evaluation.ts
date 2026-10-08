import fs from 'node:fs/promises';
import {constants, createReadStream} from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {extractOfficeText} from './office-extraction.js';
import {BUSINESS_BENCHMARK_CASES, evaluateBenchmark, type BenchmarkObservation} from '../shared/quality-evaluation.js';
import {requestSchema} from '../shared/types.js';

export async function evaluationHash(file: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const bytes of createReadStream(file)) hash.update(bytes);
  return hash.digest('hex');
}
export function insideEvaluationRoot(root: string, file: string): boolean {
  const relative = path.relative(path.resolve(root), path.resolve(file));
  return Boolean(relative) && !path.isAbsolute(relative) && relative !== '..' && !relative.startsWith('..'+path.sep);
}
/** Resolve every component to reject junction/symlink escapes before reading or writing. */
export async function requireEvaluationPath(root: string, file: string): Promise<string> {
  const base = path.resolve(root), target = path.resolve(file);
  if (!insideEvaluationRoot(base, target)) throw Error('EVALUATION_PATH_OUTSIDE_ROOT');
  let current = base;
  if ((await fs.lstat(base)).isSymbolicLink()) throw Error('EVALUATION_SYMLINK_FORBIDDEN');
  for (const part of path.relative(base,target).split(path.sep)) {
    current = path.join(current,part);
    if ((await fs.lstat(current)).isSymbolicLink()) throw Error('EVALUATION_SYMLINK_FORBIDDEN');
  }
  const real = await fs.realpath(target);
  if (!insideEvaluationRoot(await fs.realpath(base),real)) throw Error('EVALUATION_REALPATH_OUTSIDE_ROOT');
  return real;
}
/** SQL projects metadata fields; it never fetches credential values or source history. */
export function auditEvaluationModels(database: string) {
  const db = new DatabaseSync(database,{readOnly:true});
  try {
    return db.prepare(`SELECT json_extract(m.value,'$.id') AS id,json_extract(m.value,'$.name') AS name,
      json_extract(m.value,'$.provider') AS provider,json_extract(m.value,'$.modelId') AS modelId,
      json_extract(m.value,'$.protocol') AS protocol,json_extract(m.value,'$.contextWindow') AS contextWindow,
      json_extract(m.value,'$.maxTokens') AS maxTokens,
      CASE WHEN json_extract(kv.value,'$.defaultModelId')=json_extract(m.value,'$.id') THEN 1 ELSE 0 END AS isDefault,
      EXISTS(SELECT 1 FROM kv secret WHERE secret.value!='""' AND
        (secret.key='model-secret:'||json_extract(m.value,'$.id') OR
        (secret.key='key' AND json_extract(kv.value,'$.defaultModelId')=json_extract(m.value,'$.id')))) AS storedCredentialEntry
      FROM kv,json_each(json_extract(kv.value,'$.models')) m WHERE kv.key='state'`).all();
  } finally {db.close();}
}
const sourceSpecs = [
  {id:'flow', relativePath:'新增终端流程v2.0.docx'},
  {id:'policy', relativePath:'门店运营管理制度-V4.docx'},
  {id:'fields', relativePath:path.join('字段梳理','05 网点主数据.xlsx')},
];
const shaText = (text:string) => createHash('sha256').update(text).digest('hex');
export const EVALUATION_RUNTIME_FILES = ['main/main.js','main/service.js','main/agent.js','main/settings.js','main/system-prompt.js','main/skills.js','main/model-runtime.js','main/model-limits.js','main/run-limits.js','shared/types.js','renderer/index.html'];
export async function snapshotEvaluationSourceVersions(repo: string): Promise<Record<string,string>> {
  const versions:Record<string,string>={};
  const visit=async(folder:string):Promise<void>=>{
    for(const item of (await fs.readdir(folder,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){
      const file=path.join(folder,item.name);if(item.isSymbolicLink())throw Error('EVALUATION_SOURCE_CODE_SYMLINK_FORBIDDEN');
      if(item.isDirectory())await visit(file);
      else if(item.isFile())versions[path.relative(repo,file).replaceAll('\\','/')]=await evaluationHash(file);
    }
  };
  for(const folder of ['main','shared','src','scripts','tests','public'])await visit(path.join(repo,folder));
  for(const item of await fs.readdir(repo,{withFileTypes:true}))if(item.isFile()&&/^(?:package(?:-lock)?\.json|tsconfig.*\.json|vite\.config\..*|index\.html)$/.test(item.name))versions[item.name]=await evaluationHash(path.join(repo,item.name));
  return Object.fromEntries(Object.entries(versions).sort(([a],[b])=>a.localeCompare(b)));
}
export async function prepareBusinessBenchmark(repo: string, sourceRoot: string, modelDatabase?: string) {
  repo = path.resolve(repo); sourceRoot = await fs.realpath(sourceRoot);
  const testRoot = path.join(repo,'.test-data'); await fs.mkdir(testRoot,{recursive:true});
  if ((await fs.lstat(testRoot)).isSymbolicLink()) throw Error('EVALUATION_SYMLINK_FORBIDDEN');
  const output = await fs.mkdtemp(path.join(testRoot,'quality-evaluation-'));
  const originals = path.join(output,'original-copies'), texts = path.join(output,'source-text');
  await fs.mkdir(originals);await fs.mkdir(texts);await fs.mkdir(path.join(output,'cases'));
  const sources: Array<{id:string;name:string;sourcePath:string;copyPath:string;textPath:string;sourceSha256Before:string;sourceSha256After:string;copySha256:string;textSha256:string;unchanged:boolean}> = [];
  const protectedSources: Array<{sourcePath:string;before:string;copyPath:string;copied:boolean}> = [];
  try {
    for (const spec of sourceSpecs) {
      const sourcePath = await requireEvaluationPath(sourceRoot,path.join(sourceRoot,spec.relativePath));
      const name = path.basename(sourcePath), sourceSha256Before = await evaluationHash(sourcePath);
      const copyPath = path.join(originals,name), textPath = path.join(texts,name+'.txt');
      const protection={sourcePath,before:sourceSha256Before,copyPath,copied:false};protectedSources.push(protection);
      await fs.copyFile(sourcePath,copyPath,constants.COPYFILE_EXCL);
      protection.copied=true;
      const copySha256 = await evaluationHash(copyPath);
      if (copySha256 !== sourceSha256Before) throw Error('EVALUATION_SOURCE_COPY_CHANGED');
      // Converter accepts only bytes from the isolated copy, never original bytes.
      const text = await extractOfficeText(await fs.readFile(copyPath),name);
      await fs.writeFile(textPath,text,{flag:'wx'});
      const sourceSha256After = await evaluationHash(sourcePath);
      sources.push({id:spec.id,name,sourcePath,copyPath,textPath,sourceSha256Before,sourceSha256After,copySha256,textSha256:shaText(text),unchanged:sourceSha256Before===sourceSha256After});
      if (sourceSha256Before !== sourceSha256After) throw Error('EVALUATION_ORIGINAL_CHANGED');
    }
    const textsById = Object.fromEntries(await Promise.all(sources.map(async source => [source.id,await fs.readFile(source.textPath,'utf8')])));
    const fields = String(textsById.fields), start = fields.indexOf('工作表: "03 机会门店主数据"'), next = fields.indexOf('工作表: ',start+1);
    if (start < 0) throw Error('EVALUATION_OPPORTUNITY_SHEET_MISSING');
    const opportunity = fields.slice(start,next < 0 ? undefined : next);
    const factChecks = [
      {id:'opportunity_code',sourceId:'fields',locator:'03 机会门店主数据 D2/F2/I2/K2/O2/P2',passed:/D2: "文本: 网点编码"/.test(opportunity)&&/F2: "文本: 自动计算"/.test(opportunity)&&/I2: "文本: 是"/.test(opportunity)&&/\{JHWD\}\{10位顺序码\}/.test(opportunity)&&/O2: "文本: 是"/.test(opportunity)&&/P2: "文本: 否"/.test(opportunity)},
      {id:'opportunity_name',sourceId:'fields',locator:'03 机会门店主数据 D3/F3/G3/K3/O3/P3',passed:/D3: "文本: 网点名称"/.test(opportunity)&&/F3: "文本: 手动录入"/.test(opportunity)&&/G3: "文本: 50"/.test(opportunity)&&/连锁网点/.test(opportunity)&&/个体经营网点/.test(opportunity)&&/O3: "文本: 是"/.test(opportunity)&&/P3: "文本: 否"/.test(opportunity)},
      {id:'field_dimensions',sourceId:'fields',locator:'03 机会门店主数据 A1–R1',passed:/H1: "文本: 必填"/.test(opportunity)&&/A1: "文本: 是否仅用于正式落库"/.test(opportunity)&&/P1: "文本: 是否允许前端发起变更修改"/.test(opportunity)},
      {id:'object_separation',sourceId:'fields',locator:'01终端网点主数据 D4/K4/O4 vs 03机会门店 D2/K2/O2',passed:/工作表: "01终端网点主数据"/.test(fields)&&/ZDWD/.test(fields)&&/JHWD/.test(opportunity)},
      {id:'stage_definitions',sourceId:'policy',locator:'制度1.2',passed:/未完成正式建档必录字段/.test(String(textsById.policy))&&/进入系统，完成正式建档必录字段/.test(String(textsById.policy))},
      {id:'import_conflict',sourceId:'policy+flow',locator:'制度行332；新增机会门店步骤20',passed:/仅上线初期批量导入/.test(String(textsById.policy))&&/后台导入/.test(String(textsById.flow))},
      {id:'duplicate_flow',sourceId:'flow',locator:'新增机会门店步骤50/60/70',passed:/业务员提交信息/.test(String(textsById.flow))&&/系统和AI校验终端信息是否和库里重复/.test(String(textsById.flow))&&/MDM\+外部系统/.test(String(textsById.flow))},
    ];
    const versions: Record<string,string|'unknown'> = {};
    for (const file of ['shared/quality-evaluation.ts','main/quality-evaluation.ts','main/office-extraction.ts','main/system-prompt.ts','main/agent.ts','main/pm-workflows.ts','package-lock.json','scripts/quality-evaluation-run.mjs']) {
      versions[file] = await evaluationHash(path.join(repo,file)).catch(()=>'unknown');
    }
    const runtimeVersions: Record<string,string|'unknown'> = {};
    for(const file of EVALUATION_RUNTIME_FILES)runtimeVersions[file]=await evaluationHash(path.join(repo,'dist',file)).catch(()=>'unknown');
    const sourceVersions=await snapshotEvaluationSourceVersions(repo);
    const skillVersions: Array<{path:string;sha256:string}> = [];
    const skillFiles: Array<{path:string;relativePath:string;sha256:string}> = [];
    const skillRoot = path.resolve(sourceRoot,'..','skills');
    try {
      for (const item of await fs.readdir(skillRoot,{withFileTypes:true})) if(item.isDirectory()&&!item.isSymbolicLink()) {
        const skill = path.join(skillRoot,item.name,'SKILL.md');
        try {
          await requireEvaluationPath(skillRoot,skill);skillVersions.push({path:skill,sha256:await evaluationHash(skill)});
          const visit=async(folder:string):Promise<void>=>{
            for(const entry of await fs.readdir(folder,{withFileTypes:true})){
              const file=path.join(folder,entry.name);if(entry.isSymbolicLink())throw Error('EVALUATION_SKILL_SYMLINK_FORBIDDEN');
              if(entry.isDirectory())await visit(file);
              else if(entry.isFile()){if(skillFiles.length>=2000)throw Error('EVALUATION_SKILL_FILE_LIMIT');skillFiles.push({path:file,relativePath:path.relative(skillRoot,file),sha256:await evaluationHash(file)});}
            }
          };await visit(path.dirname(skill));
        } catch(error) {if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
      }
    } catch(error) {if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
    const cases = BUSINESS_BENCHMARK_CASES.map(testCase=>({...testCase,promptSha256:testCase.prompts.map(shaText),expectationSha256:shaText(JSON.stringify(testCase.checks))}));
    const dummy='00000000-0000-4000-8000-000000000000';
    const ipcExamples=[{type:'state'},{type:'workspace',path:path.join(output,'workspace')},{type:'mount',path:texts,write:false},{type:'conversation',title:'质量基准'},
      {type:'send',id:dummy,text:'离线schema样例，不执行',mode:'build',permissionMode:'full_access',modelEntryId:'sample-model',taskType:'research',workflow:{kind:'research',sources:sources.map(source=>({mountId:dummy,path:path.basename(source.textPath),contentHash:source.textSha256,locator:source.name}))}},
      {type:'pendingApprovals',conversationId:dummy},{type:'cancel',id:dummy},{type:'apply',id:dummy},{type:'versions',mountId:dummy,path:'QE05/PRD.md'}];
    ipcExamples.forEach(example=>requestSchema.parse(example));
    const manifest = {schemaVersion:1,createdAt:new Date().toISOString(),output,originals,texts,sourceRoot,sources,factChecks,
      preflight:factChecks.every(check=>check.passed)?'passed':'failed_source_expectation_mismatch',cloudExecuted:false,
      sourceCategory:'real_user_reference_documents',cases,versions,sourceVersions,runtimeVersions,skillVersions,skillFiles,
      ipcSchemaPreflight:{passed:true,types:ipcExamples.map(example=>example.type),executed:false},
      modelMetadata:modelDatabase?auditEvaluationModels(modelDatabase):'unknown',modelRuntimeParameters:'unknown',
      notice:'Source checks mean documents record these facts, not that policy is officially effective. Browser/error cases and review requests are explicitly simulated test requirements. No model run or quality verdict has occurred. Parser omits pictures/OCR/layout. Skill hashes identify available packages, not proof they were loaded.'};
    for(const file of skillFiles)if(await evaluationHash(file.path)!==file.sha256)throw Error('EVALUATION_SKILL_CHANGED_DURING_PREPARATION');
    for (const testCase of cases) {
      const dir = path.join(output,'cases',testCase.id);await fs.mkdir(dir);
      await fs.writeFile(path.join(dir,'case.json'),JSON.stringify(testCase,null,2),{flag:'wx'});
      await fs.writeFile(path.join(dir,'result.json'),JSON.stringify(evaluateBenchmark(testCase),null,2),{flag:'wx'});
      await fs.writeFile(path.join(dir,'observations.json'),'[]\n',{flag:'wx'});
    }
    await fs.writeFile(path.join(output,'manifest.json'),JSON.stringify(manifest,null,2),{flag:'wx'});
    return manifest;
  } finally {
    const protection = await Promise.all(protectedSources.map(async source=>({sourcePath:source.sourcePath,before:source.before,after:await evaluationHash(source.sourcePath).catch(()=>null),copyUnchanged:source.copied?await evaluationHash(source.copyPath).catch(()=>null)===source.before:'unknown'})));
    await fs.writeFile(path.join(output,'source-protection.json'),JSON.stringify(protection,null,2),{flag:'wx'});
    if(protection.some(source=>source.before!==source.after||source.copyUnchanged===false)) throw Error('EVALUATION_SOURCE_PROTECTION_FAILED');
  }
}

export async function recordBenchmarkReview(testDir: string, caseId: string, observations: BenchmarkObservation[], artifacts: Array<{path:string;sha256:string}>) {
  const testCase = BUSINESS_BENCHMARK_CASES.find(item=>item.id===caseId);if(!testCase)throw Error('EVALUATION_CASE_UNKNOWN');
  for(const artifact of artifacts) {
    const actual = await requireEvaluationPath(testDir,artifact.path);
    if(await evaluationHash(actual)!==artifact.sha256)throw Error('EVALUATION_ARTIFACT_CHANGED');
  }
  const boundObservations=[];
  for (const observation of observations) {
    if(!artifacts.some(artifact=>artifact.sha256===observation.artifactSha256))throw Error('EVALUATION_OBSERVATION_ARTIFACT_MISMATCH');
    const evidence=await requireEvaluationPath(testDir,observation.evidencePath);
    boundObservations.push({...observation,evidenceSha256:await evaluationHash(evidence)});
  }
  return evaluateBenchmark(testCase,boundObservations,'generated');
}
