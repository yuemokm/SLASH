// No cloud request by default. Audit model metadata with read-only SQLite.
// --prepare creates a fresh, selective profile and verified source copies.
// --run --allow-cloud is an explicit operator gate; never imports main.ts.
import fs from 'node:fs/promises';
import {constants} from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {spawn} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
import electronPath from 'electron';
import {resolveModelLimits} from '../dist/main/model-limits.js';
import {thinkingFingerprint} from '../dist/main/model-thinking.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const args=process.argv.slice(2);
const arg=(name,fallback)=>{const i=args.indexOf(name);if(i<0)return fallback;const value=args[i+1];if(!value||value.startsWith('--'))throw Error('ARGUMENT_MISSING');return value;};
const sourceProfile=path.resolve(arg('--source-profile',path.join(process.env.APPDATA,'slash')));
const corpus=path.resolve(arg('--corpus',path.join(root,'.test-data','office-corpus-2026-10-04T22-57-25-731Z')));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const digest=async file=>sha(await fs.readFile(file));
const inside=(base,target)=>{const r=path.relative(base,target);return r!==''&&!path.isAbsolute(r)&&r!=='..'&&!r.startsWith('..'+path.sep);};
const selectedNames=['新增终端流程v2.0.docx','门店运营管理制度-V4.docx','05 网点主数据.xlsx'];

function readModel(){
 const db=new DatabaseSync(path.join(sourceProfile,'slash.sqlite'),{readOnly:true});
 try{
  const get=(key,fallback)=>{const row=db.prepare('SELECT value FROM kv WHERE key=?').get(key);return row?JSON.parse(String(row.value)):fallback;};
  const state=get('state',{}),models=state.models??[];
  const name=arg('--model-name',undefined);
  const model=name?models.find(item=>item.name===name):models.find(item=>item.id===state.defaultModelId)??models[0];
  if(!model)throw Error('MODEL_ENTRY_NOT_FOUND');
  const encrypted=get('model-secret:'+model.id,'')||(model.id===state.defaultModelId?get('key',''):'');
  const input={entryId:model.id,baseUrl:model.baseUrl,id:model.modelId,protocol:model.protocol,contextWindow:model.contextWindow,maxTokens:model.maxTokens};
  const fingerprint=thinkingFingerprint(input),cache=get('model-thinking:v1:'+fingerprint,undefined);
  const limits=resolveModelLimits(input,fingerprint,cache?.resolution?.metadataLimits);
  const metadata={provider:model.provider,name:model.name,protocol:model.protocol,hasKey:Boolean(encrypted),limits:{contextWindow:limits.contextWindow,maxTokens:limits.maxTokens,status:limits.status,contextWindowSource:limits.contextWindowSource,maxTokensSource:limits.maxTokensSource}};
  return{model,encrypted,fingerprint,cache,metadata};
 }finally{db.close();}
}

async function prepare(selected){
 const testRoot=await fs.realpath(path.join(root,'.test-data'));
 const output=path.resolve(arg('--output-dir',path.join(testRoot,'pm-business-real-'+new Date().toISOString().replace(/[:.]/g,'-'))));
 if(!inside(testRoot,output)||path.dirname(output)!==testRoot)throw Error('OUTPUT_MUST_BE_NEW_DIRECT_TEST_CHILD');
 const sourceReal=await fs.realpath(sourceProfile);
 if(inside(sourceReal,output)||inside(output,sourceReal)||sourceReal===output)throw Error('PROFILE_OVERLAP');
 // mkdir is deliberately exclusive. No recursive deletion or reuse of runs.
 await fs.mkdir(output);
 const profile=path.join(output,'profile'),workspace=path.join(output,'workspace');
 await fs.mkdir(profile);await fs.mkdir(workspace);
 const originalCopies=path.join(output,'evidence-originals'),textCopies=path.join(output,'evidence-text');
 await fs.mkdir(originalCopies);await fs.mkdir(textCopies);
 const report=JSON.parse(await fs.readFile(path.join(corpus,'report.json'),'utf8'));
 const sources=[];
 for(const name of selectedNames){
  const record=report.records.find(item=>path.basename(item.relativePath)===name);
  if(!record||record.status!=='passed'||!record.originalUnchanged)throw Error('CORPUS_SOURCE_UNVERIFIED');
  const originalHash=await digest(record.sourcePath);
  if(originalHash!==record.sourceSha256Before||originalHash!==record.copySha256)throw Error('ORIGINAL_SOURCE_CHANGED');
  const original=path.join(originalCopies,name),text=path.join(textCopies,name+'.txt');
  await fs.copyFile(record.copyPath,original,constants.COPYFILE_EXCL);
  await fs.copyFile(record.outputPath,text,constants.COPYFILE_EXCL);
  const copiedHash=await digest(original),textHash=await digest(text);
  if(copiedHash!==originalHash||textHash!==await digest(record.outputPath))throw Error('EVIDENCE_COPY_CHANGED');
  const fullText=await fs.readFile(text,'utf8');
  let inputPath=text,inputLocator='Office提取全文',inputExcerpt=false;
  if(/\.xlsx$/i.test(name)){
   const lines=fullText.split(/\r?\n/),start=lines.findIndex(line=>line==='工作表: "03 机会门店主数据"');
   if(start<0)throw Error('OPPORTUNITY_SHEET_NOT_FOUND');
   let end=lines.findIndex((line,i)=>i>start&&line.startsWith('工作表: '));if(end<0)end=lines.length;
   inputPath=path.join(textCopies,name+'.03机会门店.txt');
   await fs.writeFile(inputPath,lines.slice(start,end).join('\n'),{flag:'wx'});
   inputLocator='03 机会门店主数据；完整工作表，原提取文本行 '+(start+1)+'–'+end;
   inputExcerpt=true;
  }
  sources.push({name,originalSourcePath:record.sourcePath,originalCopyPath:original,sourceSha256Before:originalHash,copySha256:copiedHash,textPath:text,textSha256:textHash,textCharacters:fullText.length,inputPath,inputSha256:await digest(inputPath),inputLocator,inputExcerpt,parserReport:path.join(corpus,'report.json')});
 }
 // Transfer only the selected encrypted credential and model capability cache.
 // No workspace, project registry, conversation, Run, or session is copied.
 const db=new DatabaseSync(path.join(profile,'slash.sqlite'));
 try{
  db.exec('CREATE TABLE kv (key TEXT PRIMARY KEY,value TEXT NOT NULL)');
  const put=(k,v)=>db.prepare('INSERT INTO kv VALUES(?,?)').run(k,JSON.stringify(v));
  put('state',{root:'',mounts:[],conversations:[],changes:[],runs:[],connections:[],models:[selected.model],defaultModelId:selected.model.id,model:{baseUrl:selected.model.baseUrl,id:selected.model.modelId,hasKey:Boolean(selected.encrypted)}});
  if(selected.encrypted)put('model-secret:'+selected.model.id,selected.encrypted);
  if(selected.cache)put('model-thinking:v1:'+selected.fingerprint,selected.cache);
 }finally{db.close();}
 try{await fs.copyFile(path.join(sourceProfile,'Local State'),path.join(profile,'Local State'),constants.COPYFILE_EXCL);}catch(error){if(error.code!=='ENOENT')throw error;}
 const moduleHashes={};
 for(const name of ['service.js','agent.js','settings.js','files.js','pm-workflows.js','model-runtime.js','model-thinking.js','model-limits.js'])moduleHashes[name]=await digest(path.join(root,'dist','main',name));
 const manifest={schemaVersion:1,cloudExecution:'not_executed',cloudReason:selected.metadata.hasKey?'awaiting_operator_gate':'missing_configured_credential',status:'prepared_no_cloud_request',output,profile,workspace,originalCopies,textCopies,model:selected.metadata,sources,moduleRoot:path.join(root,'dist','main'),moduleHashes,createdAt:new Date().toISOString(),limitations:['Uses existing built modules; module hashes identify the runtime actually tested.','Three parser-verified sources are copied. Workflow receipts expose any source truncation; the model can request remaining text through read_file.','hasKey initially means a stored encrypted credential exists; local safeStorage decryption is checked by the standalone harness.','No claim of business correctness until a person reviews generated artifacts and runs actual prototype interactions.']};
 await fs.writeFile(path.join(output,'manifest.json'),JSON.stringify(manifest,null,2),{flag:'wx'});
 await fs.writeFile(path.join(output,'manual-business-review.md'),`# 人工业务验收（尚未执行）\n\n模型声明不作为通过依据。逐项填写满足/违背/未知、资料位置、PRD章节、HTML实际操作与证据。所有字段坐标必须绑定工作表“03 机会门店主数据”，不能引用“01终端网点主数据”的ZDWD规则。\n\n| 断言 | 资料定位 | PRD位置 | 原型操作/观察 | 人工结论 |\n| --- | --- | --- | --- | --- |\n| 机会门店阶段与正式落库必填维度分开，缺失规则列待确认 | 制度1.2；机会表A1/H1 | 待核对 | 待操作 | 未审核 |\n| 网点编码自动计算、唯一、JHWD+10位顺序码，新增展示但不能手填，分配时机待确认，不允许前端变更 | 机会表D2/F2/I2/K2/O2/P2 | 待核对 | 待操作 | 未审核 |\n| 网点名称新增手动录入，后续不允许前端变更，长度50与命名说明有依据 | 机会表D3/F3/G3/K3/O3/P3 | 待核对 | 待操作 | 未审核 |\n| 手工与导入范围的阶段/版本冲突明确待确认 | 制度提取行332；流程步骤20/提取行42 | 待核对 | 待操作 | 未审核 |\n| 提交、重复校验有依据；判重字段/接口/失败处理未明确，不冒充已确认 | 流程步骤50/60 | 待核对 | 待操作 | 未审核 |\n| 成功、重复、失败明确模拟；未伪装MDM真实分配 | 流程步骤70与模型成果 | 待核对 | 待操作 | 未审核 |\n| 变更编码可编辑时区分旧资料、新要求与影响；按明确新要求修改须标明覆盖该场景，范围不明再提问，原件不变 | 机会表F2/P2；后续变更Run | 待核对 | 待操作 | 未审核 |\n\n原件哈希、Run完成、ChangeSet应用和版本列表由result.json记录；单独检查可恢复性。\n`,{flag:'wx'});
 return manifest;
}

async function run(manifest){
 if(!args.includes('--allow-cloud'))throw Error('CLOUD_REQUEST_NOT_AUTHORIZED_BY_OPERATOR');
 if(!manifest.model.hasKey)throw Error('MODEL_CREDENTIAL_MISSING');
 const configPath=path.join(manifest.output,'run-config.json');
 const prompt=arg('--prompt-file',undefined);
 const input=prompt?await fs.readFile(path.resolve(prompt),'utf8'):'请基于已提供的三份真实业务资料，设计“机会门店新建”这个模块。交付一份聚焦该模块的中文PRD、一份自包含可交互HTML原型，以及约束对照记录（来源位置、适用阶段、PRD位置、原型行为、未确认问题）。说明不同来源、填写、提交、重复校验和异常流程；事实须可定位，来源没有明确的规则保留待确认，演示数据和后端模拟须清楚标明。请通过write_draft保存本地成果，不只在回复中粘贴代码。';
 await fs.writeFile(configPath,JSON.stringify({manifest,input,followup:args.includes('--with-conflict')}),{flag:'wx'});
 const harness=path.join(manifest.output,'harness.mjs');
 const serviceURL=pathToFileURL(path.join(root,'dist/main/service.js')).href;
 const storeURL=pathToFileURL(path.join(root,'dist/main/store.js')).href;
 const settingsURL=pathToFileURL(path.join(root,'dist/main/settings.js')).href;
 await fs.writeFile(harness,`
import {app,safeStorage} from 'electron';
import fs from 'node:fs/promises';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
const {manifest:m,input,followup}=JSON.parse(readFileSync(${JSON.stringify(configPath)},'utf8'));
app.setPath('userData',m.profile);
app.setPath('sessionData',m.profile);
app.on('window-all-closed',()=>{});
let store,service,settings;
const result={status:'running',model:m.model,runs:[],changes:[],versions:[],artifacts:[],deliveryReceipts:[],sourceChecks:[],limitations:m.limitations,businessReview:'pending_human_review'};
const redact=value=>settings?settings.redact(String(value)):String(value);
const save=async()=>fs.writeFile(path.join(m.output,'result.json'),redact(JSON.stringify(result,null,2)));
const stage=async value=>fs.writeFile(path.join(m.output,'harness-progress.json'),JSON.stringify({stage:value,updatedAt:new Date().toISOString()}));
const hash=async p=>createHash('sha256').update(await fs.readFile(p)).digest('hex');
// Let Electron finish evaluating its main ESM module before waiting for ready.
async function executeBenchmark(){
try{
 await stage('waiting_electron_ready');
 await app.whenReady();
 await stage('electron_ready');
 const {Store}=await import(${JSON.stringify(storeURL)});
 const {Service}=await import(${JSON.stringify(serviceURL)});
 const {ModelSettings}=await import(${JSON.stringify(settingsURL)});
 store=new Store(m.profile);
 service=new Service(store,()=>settings?.defaultCredential()??'',()=>{},undefined,{redact:value=>settings?.redact(value)??value},id=>settings?.credential(id));
 if(service.state.root||service.state.runs.length||service.state.conversations.length||service.state.connections.length)throw Error('ISOLATION_SEED_INVALID');
 settings=new ModelSettings(store,safeStorage,{get:()=>service.state,save:()=>service.save()});settings.initialize();
 if(!settings.defaultCredential())throw Error('CREDENTIAL_LOCAL_DECRYPT_FAILED');
 await stage('local_credential_verified');
 await service.workspace(m.workspace);
 for(const [capability,decision] of Object.entries({workspace_read:'allow',artifact_write:'allow',web_read:'deny',process_execute:'deny',connection_config:'deny',external_action:'deny'}))service.setPermission(capability,decision);
 const sourceMount=await service.mount(m.textCopies,false);await service.mount(m.originalCopies,false);
 const outputMount=service.state.mounts.find(item=>item.write&&item.name==='成果')??service.state.mounts.find(item=>item.write&&!/资源|过程|知识/.test(item.name));
 if(!outputMount)throw Error('OUTPUT_MOUNT_MISSING');
 const id=service.conversation(undefined,'真实业务基线：机会门店新建');
 const sources=m.sources.map(item=>({mountId:sourceMount.id,path:path.basename(item.inputPath),contentHash:item.inputSha256,locator:item.inputLocator+'；原件与提取哈希映射见manifest.json'}));
 const settle=async()=>{const until=Date.now()+30000;while((service.active.size||service.starting.size)&&Date.now()<until)await new Promise(resolve=>setTimeout(resolve,250));return !service.active.size&&!service.starting.size;};
 const wait=async runId=>{const until=Date.now()+11*60*1000;while(Date.now()<until){const r=service.state.runs.find(item=>item.id===runId);if(['succeeded','failed','interrupted','cancelled','awaiting_plan'].includes(r?.status)){if(!await settle())throw Error('RUNTIME_DID_NOT_SETTLE');return r;}await new Promise(resolve=>setTimeout(resolve,1000));}service.cancel(runId);await settle();throw Error('BENCHMARK_TIMEOUT');};
 const execute=async(text,label)=>{
  const requiredPaths=['机会门店新建/PRD.md','机会门店新建/index.html','机会门店新建/约束对照.md'];
  const beforeArtifacts=[];
  for(const relative of requiredPaths){
   try{const bytes=await fs.readFile(await service.files.resolve(outputMount.id,relative));beforeArtifacts.push({path:relative,sha256:createHash('sha256').update(bytes).digest('hex'),versionCount:(await service.listVersions(outputMount.id,relative)).length});}
   catch(error){if(error.code!=='ENOENT')throw error;beforeArtifacts.push({path:relative,sha256:null,versionCount:0});}
  }
  await stage(label+'_running');
  const runId=await service.send(id,text+'\\n保存范围：mountId='+outputMount.id+'；PRD=机会门店新建/PRD.md，HTML=机会门店新建/index.html，约束对照=机会门店新建/约束对照.md。','build','standard',service.state.defaultModelId,undefined,undefined,'writing',undefined,{kind:'prd',sources});
  const r=await wait(runId);result.runs.push({label,run:r,operations:store.operationsForRun(runId),messages:service.state.conversations.find(c=>c.id===id).messages.filter(message=>message.runId===runId),contextManifest:store.get('context-manifest:'+runId,null)});
  await save();
  if(r.status!=='succeeded')throw Error('RUN_NOT_SUCCEEDED: '+r.status+' '+(r.error??''));
  const runChanges=service.state.changes.filter(item=>item.runId===runId);
  const canonical=value=>{const normalized=path.posix.normalize(value.replaceAll('\\\\','/'));return process.platform==='win32'?normalized.toLowerCase():normalized;};
  // Validate every destination before applying any draft.
  for(const change of runChanges)if(change.mountId!==outputMount.id||!canonical(change.path).startsWith('机会门店新建/'))throw Error('CHANGE_OUTSIDE_SCOPE');
  const changes=[],latest=new Set();
  // Service unshifts drafts: only the newest pending version of each path can
  // be applied. Keep earlier drafts in product history and report them below.
  for(const change of runChanges.filter(item=>item.status==='pending')){
   const key=change.mountId+'\\0'+canonical(change.path);
   if(latest.has(key)){result.changes.push({id:change.id,mountId:change.mountId,path:change.path,label,status:'superseded_not_applied',originalStatus:change.status});continue;}
   latest.add(key);changes.push(change);
  }
  for(const change of changes){await service.apply(change.id);result.changes.push({...change,label});}
  for(const change of runChanges.filter(item=>item.status==='applied'&&!changes.some(selected=>selected.id===item.id)))result.changes.push({...change,label});
  const afterArtifacts=[];
  for(const relative of requiredPaths){
   const filename=await service.files.resolve(outputMount.id,relative),bytes=await fs.readFile(filename);
   if(!bytes.length||!bytes.toString('utf8').trim())throw Error('REQUIRED_ARTIFACT_EMPTY');
   const versions=await service.listVersions(outputMount.id,relative);
   result.artifacts.push({label,mountId:outputMount.id,path:relative,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});
   result.versions.push({label,path:relative,versions});
   afterArtifacts.push({path:relative,sha256:createHash('sha256').update(bytes).digest('hex'),versionCount:versions.length});
  }
  const changedPaths=afterArtifacts.filter(item=>beforeArtifacts.find(prior=>prior.path===item.path)?.sha256!==item.sha256).map(item=>item.path);
  const disposition=changedPaths.length?'required_artifacts_updated':changes.length?'changes_applied_required_artifacts_unchanged':'reply_only_no_artifact_change';
  result.deliveryReceipts.push({label,runId,disposition,appliedChangeIds:changes.map(item=>item.id),changedPaths,beforeArtifacts,afterArtifacts,businessReview:'pending_human_review'});
  if(label==='conflict_request')result.followupOutcome=disposition;
  await save();
  await stage(label+'_finished');
  return changes;
 };
 await execute(input,'baseline');
 if(followup)await execute('请把网点编码改成销售人员新建时可以手填、后续也可以修改。','conflict_request');
 result.status='completed_pending_business_review';
 await stage('completed_pending_business_review');
}catch(error){result.status='failed';result.error=redact(error instanceof Error?error.message:String(error));process.exitCode=1;}
finally{
 for(const source of m.sources)try{const current=await hash(source.originalSourcePath);result.sourceChecks.push({name:source.name,before:source.sourceSha256Before,after:current,unchanged:current===source.sourceSha256Before,copyUnchanged:await hash(source.originalCopyPath)===source.copySha256,textUnchanged:await hash(source.textPath)===source.textSha256});}catch{result.sourceChecks.push({name:source.name,error:'SOURCE_CHECK_FAILED'});}
 if(result.sourceChecks.some(item=>!item.unchanged||!item.copyUnchanged||!item.textUnchanged)){result.status='failed';result.error='SOURCE_CHANGED';process.exitCode=1;}
 let settled=true;
 if(service){for(const run of service.state.runs)if(['queued','running','waiting_user','cancelling'].includes(run.status))service.cancel(run.id);const deadline=Date.now()+30000;while((service.active.size||service.starting.size)&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,250));settled=!service.active.size&&!service.starting.size;}
 if(!settled){result.status='failed';result.error='RUNTIME_DID_NOT_SETTLE';process.exitCode=1;}
 await save();if(settled)store?.close();app.exit(process.exitCode??0);
}
}
void executeBenchmark();
`,{flag:'wx'});
 const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;env.PM_SLASH_DATA_DIR=manifest.profile;
 // Chromium/runtime logging is intentionally discarded: result.json has host
 // redaction and selected evidence. Never print raw child errors/HTTP headers.
 let parentTimedOut=false;
 const code=await new Promise((resolve,reject)=>{
  const child=spawn(electronPath,[harness],{cwd:root,env,windowsHide:true,stdio:'ignore'}),startedAt=Date.now();
  const totalBudget=(args.includes('--with-conflict')?27:15)*60*1000;
  let setupComplete=false,checking=false;
  // A ready-lifecycle failure must not leave the operator waiting for a cloud
  // run that never started. Progress contains stage names only, no prompts.
  const watchdog=setInterval(async()=>{
   if(checking)return;checking=true;
   try{const progress=JSON.parse(await fs.readFile(path.join(manifest.output,'harness-progress.json'),'utf8'));if(progress.stage==='baseline_running'||progress.stage==='baseline_finished'||progress.stage.startsWith('conflict_request_')||progress.stage==='completed_pending_business_review')setupComplete=true;}catch{}
   checking=false;
   if((!setupComplete&&Date.now()-startedAt>60000)||Date.now()-startedAt>totalBudget){parentTimedOut=true;child.kill();}
  },1000);
  child.once('error',()=>{clearInterval(watchdog);reject(Error('ELECTRON_HARNESS_FAILED_TO_START'));});
  child.once('exit',value=>{clearInterval(watchdog);resolve(value);});
 });
 if(parentTimedOut){
  let previous={};try{previous=JSON.parse(await fs.readFile(path.join(manifest.output,'result.json'),'utf8'));}catch{}
  await fs.writeFile(path.join(manifest.output,'result.json'),JSON.stringify({...previous,status:'failed',error:'HARNESS_PARENT_TIMEOUT'}));
  throw Error('HARNESS_PARENT_TIMEOUT');
 }
 const result=JSON.parse(await fs.readFile(path.join(manifest.output,'result.json'),'utf8'));
 console.log(JSON.stringify({status:result.status,output:manifest.output,runs:result.runs.map(item=>({label:item.label,id:item.run.id,status:item.run.status})),businessReview:result.businessReview}));
 if(code!==0)process.exitCode=1;
}

try{
 const selected=readModel();
 console.log(JSON.stringify(selected.metadata));
 if(args.includes('--prepare')||args.includes('--run')){
  const manifest=await prepare(selected);
  console.log(JSON.stringify({status:manifest.status,output:manifest.output,sourceCopies:manifest.sources.length}));
  if(args.includes('--run'))await run(manifest);
 }
}catch(error){
 // Only our stable error codes are public; provider URLs and secrets never are.
 console.error(String(error.message).match(/^[A-Z][A-Z0-9_]+/)?.[0]??'BASELINE_LOCAL_SETUP_FAILED');
 process.exitCode=1;
}
