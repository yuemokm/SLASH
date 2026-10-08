// Explicit single-case execution; reuses the official Electron/preload IPC path.
// No cloud request, profile credential read, or app launch without both gates.
import fs from 'node:fs/promises';
import {constants} from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {fileURLToPath} from 'node:url';
import {_electron as electron} from 'playwright';
import {requestSchema} from '../shared/types.ts';
import {BUSINESS_BENCHMARK_CASES,evaluateBenchmark} from '../shared/quality-evaluation.ts';
import {evaluationHash,requireEvaluationPath,EVALUATION_RUNTIME_FILES,snapshotEvaluationSourceVersions} from '../main/quality-evaluation.ts';
import {DEFAULT_RUN_LIMITS} from '../main/run-limits.ts';
import {loadObservationPolicy} from './pm-run-observation-policy.mjs';
import {prototypeRuntimeHashes,assertPrototypeRuntime,installQualityGlobalSkill,assertQualityGlobalSkillLoaded,assertQualityGlobalSkillSource,qualityInteractionRequirements,runQualityPrototypeRound} from './quality-prototype-checks.mjs';

const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),testRoot=path.join(repo,'.test-data');
const args=process.argv.slice(2),value=name=>{const i=args.indexOf(name);if(i<0||!args[i+1]||args[i+1].startsWith('--'))throw Error('EVALUATION_ARGUMENT_REQUIRED');return args[i+1];};
const sha=text=>createHash('sha256').update(text).digest('hex');
const safeReason=error=>/^[A-Z][A-Z0-9_]+$/.test(error.message)?error.message:'EVALUATION_RUN_FAILED';
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const runtimeFiles=EVALUATION_RUNTIME_FILES;
const targets=['PRD.md','index.html','约束对照.md'];
const terminal=new Set(['succeeded','failed','interrupted','cancelled','awaiting_plan']);
let app,page,runId,call,save,receipt,caseDir,manifest,prototypeHashes,globalInstallation;
try {
 const flags=new Set(['--run','--allow-cloud','--test-dir','--case','--source-profile','--model-id','--global-skill','--prototype-checks']);
 for(let i=0;i<args.length;i++){if(!flags.has(args[i]))throw Error('EVALUATION_ARGUMENT_UNKNOWN');if(!['--run','--allow-cloud','--prototype-checks'].includes(args[i]))i++;}
 if(!args.includes('--run')||!args.includes('--allow-cloud'))throw Error('EVALUATION_EXPLICIT_CLOUD_GATE_REQUIRED');
 const dir=await requireEvaluationPath(testRoot,path.resolve(value('--test-dir'))),caseId=value('--case');
 manifest=JSON.parse(await fs.readFile(await requireEvaluationPath(dir,path.join(dir,'manifest.json')),'utf8'));
 const testCase=BUSINESS_BENCHMARK_CASES.find(item=>item.id===caseId),prepared=manifest.cases.find(item=>item.id===caseId);
 if(!testCase||!prepared||manifest.output!==dir||manifest.preflight!=='passed'||JSON.stringify(testCase.prompts)!==JSON.stringify(prepared.prompts)||sha(JSON.stringify(testCase.checks))!==prepared.expectationSha256)throw Error('EVALUATION_MANIFEST_INVALID');
 for(const [file,hash] of Object.entries(manifest.versions))if(hash==='unknown'||await evaluationHash(path.join(repo,file))!==hash)throw Error('EVALUATION_SOURCE_CODE_CHANGED_REPREPARE');
 if(JSON.stringify(await snapshotEvaluationSourceVersions(repo))!==JSON.stringify(manifest.sourceVersions))throw Error('EVALUATION_SOURCE_TREE_CHANGED_REPREPARE');
 for(const source of manifest.sources){
  await requireEvaluationPath(dir,source.copyPath);await requireEvaluationPath(dir,source.textPath);
  if(await evaluationHash(source.sourcePath)!==source.sourceSha256Before||await evaluationHash(source.copyPath)!==source.copySha256||await evaluationHash(source.textPath)!==source.textSha256)throw Error('EVALUATION_SOURCE_CHANGED');
 }
 for(const skill of manifest.skillFiles)if(await evaluationHash(skill.path)!==skill.sha256)throw Error('EVALUATION_SKILL_CHANGED_REPREPARE');
 const observation=await loadObservationPolicy(repo),runtimeHashes={};
 if(JSON.stringify(observation.hostLimits)!==JSON.stringify({durationMs:DEFAULT_RUN_LIMITS.durationMs,maxToolCalls:DEFAULT_RUN_LIMITS.maxToolCalls}))throw Error('EVALUATION_BUILT_BUDGET_STALE_REBUILD');
 for(const file of runtimeFiles){runtimeHashes[file]=await evaluationHash(path.join(repo,'dist',file));if(runtimeHashes[file]!==manifest.runtimeVersions?.[file])throw Error('EVALUATION_RUNTIME_CHANGED_REPREPARE');}
 if(!(await fs.readFile(path.join(repo,'dist','main','main.js'),'utf8')).includes('PM_SLASH_TEST_HIDDEN'))throw Error('EVALUATION_HIDDEN_RUNTIME_STALE_REBUILD');
 caseDir=await requireEvaluationPath(dir,path.join(dir,'cases',caseId));
 const lock=await fs.open(path.join(caseDir,'run-once.lock'),'wx').catch(()=>{throw Error('EVALUATION_CASE_ALREADY_ATTEMPTED');});await lock.close();
 const profile=path.join(caseDir,'profile'),workspace=path.join(caseDir,'workspace'),snapshotRoot=path.join(caseDir,'snapshots');
 for(const folder of [profile,workspace,snapshotRoot])await fs.mkdir(folder);
 receipt={schemaVersion:1,caseId,status:'preparing',startedAt:new Date().toISOString(),cloudExecuted:false,realSendCalls:0,
  elapsedMs:'unknown',manualModificationCount:'unknown',runtimeHashes,runtimePolicy:observation,modelRuntimeParameters:'unknown',
  sourceManifestSha256:await evaluationHash(path.join(dir,'manifest.json')),promptSha256:prepared.promptSha256,expectationSha256:prepared.expectationSha256,
  steps:[],artifacts:[],sourceChecks:[],notice:'Generated files are actual model output saved through official IPC; all business/browser judgments remain unknown until independent evidence is recorded. No protocol fallback or automatic resume.'};
 save=()=>fs.writeFile(path.join(caseDir,'execution.json'),JSON.stringify(receipt,null,2));await save();
 if(args.includes('--prototype-checks')||args.includes('--global-skill')){prototypeHashes=await prototypeRuntimeHashes(repo);receipt.prototypeRuntimeHashes=prototypeHashes;receipt.prototypeChecksRequested=args.includes('--prototype-checks');await save();}
 const sourceProfile=await fs.realpath(path.resolve(value('--source-profile'))),sourceDatabase=path.join(sourceProfile,'slash.sqlite'),modelId=value('--model-id');
 const db=new DatabaseSync(sourceDatabase,{readOnly:true});let model,encrypted,capabilityRows;
 try {
  // The only credential read in this workflow occurs after explicit run gates.
  const row=db.prepare("SELECT m.value FROM kv,json_each(json_extract(kv.value,'$.models')) m WHERE kv.key='state' AND json_extract(m.value,'$.id')=?").get(modelId);
  if(!row)throw Error('EVALUATION_MODEL_NOT_FOUND');model=JSON.parse(row.value);
  const expectedModel=Array.isArray(manifest.modelMetadata)?manifest.modelMetadata.find(item=>item.id===modelId):undefined;
  if(expectedModel&&(expectedModel.modelId!==model.modelId||expectedModel.protocol!==model.protocol||expectedModel.provider!==model.provider))throw Error('EVALUATION_MODEL_CONFIG_CHANGED_REPREPARE');
  const legacyAllowed=db.prepare("SELECT json_extract(value,'$.defaultModelId') AS id FROM kv WHERE key='state'").get()?.id===modelId;
  const secret=db.prepare('SELECT value FROM kv WHERE key=?').get('model-secret:'+modelId)??(legacyAllowed?db.prepare("SELECT value FROM kv WHERE key='key'").get():undefined);
  encrypted=secret?JSON.parse(secret.value):undefined;if(!encrypted||typeof encrypted!=='string')throw Error('EVALUATION_STORED_CREDENTIAL_MISSING');
  capabilityRows=db.prepare("SELECT key,value FROM kv WHERE key LIKE 'model-thinking:v1:%'").all();
 }finally{db.close();}
 const modelKeys=['id','provider','name','baseUrl','modelId','protocol','hasKey','supportsVision','contextWindow','maxTokens','createdAt','updatedAt'];
 model=Object.fromEntries(modelKeys.filter(key=>model[key]!==undefined).map(key=>[key,model[key]]));model.hasKey=true;
 receipt.model=Object.fromEntries(['id','provider','name','modelId','protocol','contextWindow','maxTokens'].filter(key=>model[key]!==undefined).map(key=>[key,model[key]]));
 const isolated=new DatabaseSync(path.join(profile,'slash.sqlite'));
 try {
  isolated.exec('CREATE TABLE kv(key TEXT PRIMARY KEY,value TEXT NOT NULL)');const put=isolated.prepare('INSERT INTO kv VALUES (?,?)');
  put.run('state',JSON.stringify({root:'',mounts:[],conversations:[],changes:[],runs:[],connections:[],models:[model],defaultModelId:model.id,model:{baseUrl:model.baseUrl,id:model.modelId,protocol:model.protocol,hasKey:true},permissions:{workspace_read:'allow',artifact_write:'allow',process_execute:'deny',web_read:'deny',connection_config:'deny',external_action:'deny'}}));
  put.run('model-secret:'+model.id,JSON.stringify(encrypted));
  for(const row of capabilityRows)put.run(row.key,row.value);
 }finally{isolated.close();encrypted=undefined;}
 await fs.copyFile(path.join(sourceProfile,'Local State'),path.join(profile,'Local State'),constants.COPYFILE_EXCL);
 // Copy only available project skills; nothing modifies the user's project.
 const skillSource=path.resolve(manifest.sourceRoot,'..','skills');
 if(manifest.skillVersions.length){
  const destination=path.join(workspace,'资源','skills');await fs.mkdir(destination,{recursive:true});
  const copyRegular=async(source,target)=>{
   const info=await fs.lstat(source);if(info.isSymbolicLink())throw Error('EVALUATION_SKILL_SYMLINK_FORBIDDEN');
   if(info.isDirectory()){await fs.mkdir(target);for(const item of await fs.readdir(source))await copyRegular(path.join(source,item),path.join(target,item));}
   else if(info.isFile()){
    const expected=manifest.skillFiles.find(item=>item.path===source)?.sha256;
    if(!expected||await evaluationHash(source)!==expected)throw Error('EVALUATION_SKILL_FILE_CHANGED');
    await fs.copyFile(source,target,constants.COPYFILE_EXCL);
    if(await evaluationHash(target)!==expected)throw Error('EVALUATION_SKILL_COPY_CHANGED');
   }
   else throw Error('EVALUATION_SKILL_NONFILE_FORBIDDEN');
  };
  for(const skill of manifest.skillVersions){const folder=path.dirname(skill.path);await requireEvaluationPath(skillSource,folder);await copyRegular(folder,path.join(destination,path.basename(folder)));}
 }
 const env={...process.env,PM_SLASH_DATA_DIR:profile,PM_SLASH_TEST_HIDDEN:'1'};delete env.ELECTRON_RUN_AS_NODE;delete env.VITE_DEV_SERVER_URL;delete env.PM_SLASH_DEV_SERVER_URL;
 app=await electron.launch({cwd:repo,args:['.'],env,timeout:60000});page=await app.firstWindow();page.setDefaultTimeout(20000);
 if(await app.evaluate(({app})=>app.getPath('userData'))!==profile)throw Error('EVALUATION_PROFILE_MISMATCH');
 await page.locator('.brand').waitFor();
 call=async input=>{const parsed=requestSchema.parse(input),response=await page.evaluate(value=>window.pm.request(value),parsed);if(!response.ok)throw Error('EVALUATION_OFFICIAL_IPC_FAILED');return response.data;};
 const setupDeadline=Date.now()+45000;let workspaceReady=false;
 while(Date.now()<setupDeadline){try{await call({type:'workspace',path:workspace});workspaceReady=true;break;}catch{await sleep(1000);}}
 if(!workspaceReady)throw Error('EVALUATION_WORKSPACE_STARTUP_TIMEOUT');
 await call({type:'mount',path:manifest.texts,write:false});await call({type:'mount',path:manifest.originals,write:false});
 let state=await call({type:'state'}),sourceMount=state.mounts.find(mount=>mount.path===manifest.texts),outputMount=state.mounts.find(mount=>mount.name==='成果');
 if(!sourceMount||sourceMount.write||!outputMount?.write||state.runs.length||state.changes.length||state.connections.length||state.models.length!==1||state.defaultModelId!==model.id||state.permissions.process_execute!=='deny'||state.permissions.external_action!=='deny'||state.permissions.web_read!=='deny')throw Error('EVALUATION_ISOLATION_CONFIG_INVALID');
 const liveModel=state.models.find(item=>item.id===model.id);if(!liveModel?.hasKey||liveModel.protocol!==model.protocol)throw Error('EVALUATION_LIVE_MODEL_MISMATCH');
 if(args.includes('--global-skill')){globalInstallation=await installQualityGlobalSkill({app,call,sourcePath:path.resolve(value('--global-skill'))});receipt.globalSkillInstallation=globalInstallation;await save();}
 const conversationId=await call({type:'conversation',title:'真实资料质量基准 '+caseId});
 const neededSources=new Set(testCase.checks.flatMap(check=>check.sourceIds));
 const selectedSources=manifest.sources.filter(source=>neededSources.has(source.id));
 const outputPaths=targets.map(name=>`${caseId}/${name}`),readSnapshots=async()=>{
  const result=[];for(const relative of outputPaths){const target=path.join(outputMount.path,...relative.split('/'));try{result.push({path:target,relative,sha256:await evaluationHash(target),versions:await call({type:'versions',mountId:outputMount.id,path:relative})});}catch(error){if(error.code!=='ENOENT')throw error;}}
  return result;
 };
 for(let index=0;index<testCase.prompts.length;index++){
  const before=await readSnapshots();
  const prompt=testCase.prompts[index]+`\n资料位于只读mountId=${sourceMount.id}，请保留工作表及具体坐标。成果保存范围mountId=${outputMount.id}，仅允许${outputPaths.join('、')}。按该轮任务需要保存成果，评审分析明确要求不修改时仅回复。`+(globalInstallation?'\n设计要求：先使用discover_skills发现技能，再使用load_skill实际加载全局frontend-design正文，并依照正文完成本轮原型设计。项目同名技能不能冒充此次安装的全局版本；若存在同名遮蔽请明确报告。':'')+(args.includes('--prototype-checks')?'\n独立浏览器验收将核对真实资料的编码只读与名称50字符规则，以及明确标为模拟的成功/重复/服务失败路径、失败保留输入、390×844/1280×800/1440×900视口。请提供可定位且能操作的控件；禁止调用实际业务网络。后续修改须保留上一轮已确认的原型基线，不得弱化断言。':'');
  await fs.writeFile(path.join(caseDir,`prompt-${index+1}.txt`),prompt,{flag:'wx'});
  receipt.promptVariants??=[];receipt.promptVariants.push({step:index+1,path:path.join(caseDir,`prompt-${index+1}.txt`),sha256:sha(prompt),basePromptSha256:sha(testCase.prompts[index]),globalSkillRequired:Boolean(globalInstallation),prototypeChecksRequested:args.includes('--prototype-checks')});await save();
  receipt.status='running';receipt.cloudExecuted=true;receipt.realSendCalls++;await save();
  const research=caseId==='QE05';
  runId=await call({type:'send',id:conversationId,text:prompt,mode:'build',permissionMode:'full_access',modelEntryId:model.id,taskType:research?'research':'writing',workflow:{kind:research?'research':'prd',sources:selectedSources.map(source=>({mountId:sourceMount.id,path:path.basename(source.textPath),contentHash:source.textSha256,locator:`${source.name} 完整提取；原件SHA-256=${source.sourceSha256Before}`}))}});
  // Observation begins after send has returned, so it never precedes the
  // host's own budget. Add the same 15-second grace as existing IPC scripts.
  const deadline=Date.now()+observation.totalObservationMs;let run;
  while(Date.now()<deadline){state=await call({type:'state'});run=state.runs.find(item=>item.id===runId);if(terminal.has(run?.status))break;const approvals=await call({type:'pendingApprovals',conversationId});if(approvals.some(item=>item.runId===runId&&item.status==='pending'))throw Error('EVALUATION_UNEXPECTED_APPROVAL');await sleep(1000);}
  if(!terminal.has(run?.status))throw Error('EVALUATION_REAL_TASK_TIMEOUT');
  const step={index:index+1,runId,status:run.status,before,systemPromptHash:run.systemPromptHash??'unknown',reasoning:run.reasoning??'unknown',modelRoute:run.modelRoute??'unknown',skillDiscovery:run.skillDiscovery??'unknown',skillLoads:run.skillLoads??'unknown',acceptance:run.acceptance??'unknown',inputs:run.inputs??'unknown',generationDurationMs:run.generationDurationMs??'unknown',after:[],appliedChangeIds:[]};
  receipt.steps.push(step);await save();
  if(run.status!=='succeeded')throw Error('EVALUATION_REAL_TASK_NOT_SUCCEEDED');
  if(globalInstallation){step.requiredGlobalSkillLoad=assertQualityGlobalSkillLoaded(run,globalInstallation);await assertQualityGlobalSkillSource(globalInstallation);await save();}
  const drafts=state.changes.filter(item=>item.runId===runId&&item.status==='pending'),latest=new Set();
  for(const draft of drafts){if(draft.mountId!==outputMount.id||!outputPaths.includes(draft.path.replaceAll('\\','/')))throw Error('EVALUATION_DRAFT_OUTSIDE_SCOPE');}
  for(const draft of drafts){if(latest.has(draft.path))continue;latest.add(draft.path);await call({type:'apply',id:draft.id});step.appliedChangeIds.push(draft.id);}
  step.after=await readSnapshots();
  step.changedPaths=step.after.filter(item=>before.find(prior=>prior.relative===item.relative)?.sha256!==item.sha256).map(item=>item.relative);
  step.disposition=step.changedPaths.length?'saved_artifacts_changed':'reply_only_artifacts_unchanged';
  if(!step.after.length&&testCase.requiresSavedArtifact)throw Error('EVALUATION_NO_SAVED_ARTIFACT');
  for(const artifact of step.after){const snapshot=path.join(snapshotRoot,`${index+1}-${path.basename(artifact.path)}`);await fs.copyFile(artifact.path,snapshot,constants.COPYFILE_EXCL);receipt.artifacts.push({path:snapshot,sha256:artifact.sha256,step:index+1,origin:'saved_artifact',versions:artifact.versions});}
  const replies=state.conversations.find(item=>item.id===conversationId)?.messages.filter(item=>item.role==='assistant'&&item.runId===runId&&item.text?.trim()).map(item=>item.text).join('\n\n');
  if(replies){const snapshot=path.join(snapshotRoot,`${index+1}-assistant-reply.md`);await fs.writeFile(snapshot,replies,{flag:'wx'});receipt.artifacts.push({path:snapshot,sha256:sha(replies),step:index+1,origin:'assistant_reply',versions:[]});}
  if(!step.after.length&&!replies)throw Error('EVALUATION_NO_OUTPUT');
  const localDb=new DatabaseSync(path.join(profile,'slash.sqlite'),{readOnly:true});try{const row=localDb.prepare('SELECT value FROM kv WHERE key=?').get('context-manifest:'+runId);const context=row?JSON.parse(row.value):{};step.sourceReadEvidence=(context.sourceRefs??[]).map(item=>({mountId:item.mountId,path:item.path,contentHash:item.contentHash,locator:item.locator}));}finally{localDb.close();}
  if(args.includes('--prototype-checks')){
   const html=step.after.find(item=>item.relative===outputPaths[1]);
   if(html){const prototype=await runQualityPrototypeRound({repo,page,call,target:{mountId:outputMount.id,path:html.relative},artifactPath:html.path,artifactHash:html.sha256,caseDir,round:index+1,caseId,sourceRefs:selectedSources.map(source=>({mountId:sourceMount.id,path:path.basename(source.textPath),contentHash:source.textSha256,locator:testCase.checks.filter(check=>check.sourceIds.includes(source.id)).map(check=>check.locator).join('；').slice(0,1000)||source.name})),runtimeHashes:prototypeHashes,interactionRequirements:qualityInteractionRequirements(testCase.prompts.slice(0,index+1)),onState:async progress=>{receipt.status=progress.status;step.prototypeProgress=progress;await save();if(progress.status==='awaiting_bindings')console.log(JSON.stringify({status:progress.status,caseId,step:index+1,artifactHash:progress.artifactHash,bindingsPath:progress.bindingsPath,inspection:progress.inspection}));}});step.prototype={status:prototype.status,versionState:prototype.report.versionState,artifactHash:prototype.artifactHash,specHash:prototype.specHash,frozenBaseline:prototype.frozenBaseline,confirmedForNextRound:prototype.confirmedForNextRound,reportPath:path.join(caseDir,'prototype',String(index+1),'report.json'),screenshots:prototype.screenshots.map(s=>({path:s.path,sha256:s.sha256,caseId:s.caseId,capture:s.capture}))};}
   else step.prototype={status:'unknown',reason:'Model did not save an HTML artifact in the authorized case output path; browser checks were not executed.'};
   receipt.status='running';await save();
  }
  await save();runId=undefined;
 }
 receipt.status='generated_pending_independent_review';
 const result=evaluateBenchmark(testCase,[],'generated');result.elapsedMs=Date.now()-Date.parse(receipt.startedAt);
 await fs.writeFile(path.join(caseDir,'result.json'),JSON.stringify(result,null,2));
}catch(error){if(receipt){receipt.status='failed';receipt.reason=safeReason(error);}else console.error(JSON.stringify({status:'failed',reason:safeReason(error),cloudExecuted:false}));process.exitCode=1;}
finally {
 if(app){if(runId&&call)await call({type:'cancel',id:runId}).catch(()=>{});await app.close().catch(()=>{});}
 if(receipt){
  receipt.finishedAt=new Date().toISOString();receipt.elapsedMs=Date.parse(receipt.finishedAt)-Date.parse(receipt.startedAt);
  for(const source of manifest.sources){const after=await evaluationHash(source.sourcePath).catch(()=>null),copy=await evaluationHash(source.copyPath).catch(()=>null),text=await evaluationHash(source.textPath).catch(()=>null);receipt.sourceChecks.push({name:source.name,before:source.sourceSha256Before,after,unchanged:after===source.sourceSha256Before,copyUnchanged:copy===source.copySha256,textUnchanged:text===source.textSha256});}
  receipt.skillSourceChecks=[];
  for(const file of manifest.skillFiles){const after=await evaluationHash(file.path).catch(()=>null);receipt.skillSourceChecks.push({path:file.path,before:file.sha256,after,unchanged:after===file.sha256});}
  if(receipt.skillSourceChecks.some(item=>!item.unchanged)){receipt.status='failed';receipt.reason='EVALUATION_SKILL_SOURCE_CHANGED';process.exitCode=1;}
  try{receipt.sourceTreeChangedDuringExecution=JSON.stringify(await snapshotEvaluationSourceVersions(repo))!==JSON.stringify(manifest.sourceVersions);}catch(error){receipt.sourceTreeChangedDuringExecution='unknown';receipt.sourceTreeSnapshotError=safeReason(error);}
  receipt.runtimeHashChecks=[];
  for(const [file,before] of Object.entries(receipt.runtimeHashes)){const after=await evaluationHash(path.join(repo,'dist',file)).catch(()=>null);receipt.runtimeHashChecks.push({file,before,after,unchanged:before===after});}
  if(receipt.runtimeHashChecks.some(item=>!item.unchanged)){receipt.status='verification_invalid';receipt.reason='EVALUATION_COMPILED_RUNTIME_CHANGED';process.exitCode=1;}
  if(prototypeHashes)try{await assertPrototypeRuntime(repo,prototypeHashes);receipt.prototypeRuntimeUnchanged=true;}catch{receipt.prototypeRuntimeUnchanged=false;receipt.status='verification_invalid';receipt.reason='EVALUATION_PROTOTYPE_RUNTIME_CHANGED';process.exitCode=1;}
  if(globalInstallation)try{await assertQualityGlobalSkillSource(globalInstallation);receipt.globalSkillSourceUnchanged=true;}catch{receipt.globalSkillSourceUnchanged=false;receipt.status='verification_invalid';receipt.reason='EVALUATION_GLOBAL_SKILL_SOURCE_CHANGED';process.exitCode=1;}
  if(receipt.sourceChecks.some(item=>!item.unchanged||!item.copyUnchanged||!item.textUnchanged)){receipt.status='verification_invalid';receipt.reason='EVALUATION_SOURCE_PROTECTION_FAILED';process.exitCode=1;}
  if(receipt.skillSourceChecks.some(item=>!item.unchanged)){receipt.status='verification_invalid';receipt.reason='EVALUATION_SKILL_SOURCE_CHANGED';process.exitCode=1;}
  if(receipt.status==='failed'||receipt.status==='verification_invalid'){
   const testCase=BUSINESS_BENCHMARK_CASES.find(item=>item.id===receipt.caseId);
   const failed=evaluateBenchmark(testCase,[],receipt.status);failed.elapsedMs=receipt.elapsedMs;
   await fs.writeFile(path.join(caseDir,'result.json'),JSON.stringify(failed,null,2));
  }
  await save();console.log(JSON.stringify({status:receipt.status,reason:receipt.reason,caseId:receipt.caseId,receipt:path.join(caseDir,'execution.json'),cloudExecuted:receipt.cloudExecuted,realSendCalls:receipt.realSendCalls}));
 }
}
