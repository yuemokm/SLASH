// Offline preparation: node scripts/pm-business-real-resume.mjs --prepare
// Exactly one authorized continuation: add --allow-cloud instead of --prepare.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {spawn} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
import electronPath from 'electron';

// Serialized into an independent Electron main module. No normal app entry.
async function resumeHarness(app,safeStorage,cfg){
 app.setPath('userData',cfg.manifest.profile);app.setPath('sessionData',cfg.manifest.profile);
 app.on('window-all-closed',()=>{});
 const fs=await import('node:fs/promises'),path=await import('node:path'),{createHash}=await import('node:crypto');
 const m=cfg.manifest;
 let service,store,settings,resumedId;
 const result={status:'starting',previousRunId:cfg.previousRunId,resumeAttempts:0,runs:[],changes:[],artifacts:[],versions:[],sourceChecks:[],businessReview:'pending_human_review'};
 const sha=async filename=>createHash('sha256').update(await fs.readFile(filename)).digest('hex');
 const save=async()=>fs.writeFile(path.join(cfg.output,'resume-result.json'),settings?settings.redact(JSON.stringify(result,null,2)):JSON.stringify(result,null,2));
 const stage=async value=>fs.writeFile(path.join(cfg.output,'harness-progress.json'),JSON.stringify({stage:value,updatedAt:new Date().toISOString()}));
 const settle=async()=>{const end=Date.now()+30000;while((service.active.size||service.starting.size)&&Date.now()<end)await new Promise(resolve=>setTimeout(resolve,250));return !service.active.size&&!service.starting.size;};
 try{
  await stage('waiting_electron_ready');await app.whenReady();
  const {Store}=await import(cfg.modules.store),{Service}=await import(cfg.modules.service),{ModelSettings}=await import(cfg.modules.settings);
  store=new Store(m.profile);
  service=new Service(store,()=>settings?.defaultCredential()??'',()=>{},undefined,{redact:value=>settings?.redact(value)??value},id=>settings?.credential(id));
  if(service.state.root!==m.workspace)throw Error('PROFILE_WORKSPACE_CHANGED');
  const previous=service.state.runs.find(item=>item.id===cfg.previousRunId);
  if(previous?.status!=='interrupted'||!previous.resumable)throw Error('RUN_NOT_RESUMABLE');
  const permissions=JSON.stringify(service.state.permissions),limits=JSON.stringify(service.state.models.map(({id,contextWindow,maxTokens})=>({id,contextWindow,maxTokens})));
  settings=new ModelSettings(store,safeStorage,{get:()=>service.state,save:()=>service.save()});settings.initialize();
  if(!settings.defaultCredential())throw Error('LOCAL_CREDENTIAL_DECRYPT_FAILED');
  if(JSON.stringify(service.state.permissions)!==permissions||JSON.stringify(service.state.models.map(({id,contextWindow,maxTokens})=>({id,contextWindow,maxTokens})))!==limits)throw Error('RESUME_SETTINGS_CHANGED');
  // Read the persisted tree without workspace()/initializeDefaultProject().
  const tree=await service.projectTreeGet(),node=tree.appliedNodes.find(item=>item.role==='output');
  const output=service.state.mounts.find(item=>node?.path&&path.resolve(item.path).toLowerCase()===path.resolve(service.state.root,node.path).toLowerCase());
  if(!output?.enabled||!output.write)throw Error('OUTPUT_MOUNT_UNAVAILABLE');
  await stage('resume_running');result.resumeAttempts=1;
  resumedId=await service.resumeRun(cfg.previousRunId);result.resumedRunId=resumedId;await save();
  const end=Date.now()+11*60*1000;let terminal=false;
  while(Date.now()<end){
   if(['succeeded','failed','interrupted','cancelled','awaiting_plan'].includes(service.state.runs.find(item=>item.id===resumedId)?.status)){terminal=true;break;}
   await new Promise(resolve=>setTimeout(resolve,1000));
  }
  if(!terminal){result.timeout=true;service.cancel(resumedId);}
  if(!await settle())throw Error('RUNTIME_DID_NOT_SETTLE');
  const ids=[cfg.previousRunId,resumedId],changes=service.state.changes.filter(item=>ids.includes(item.runId));
  const canonical=value=>{const normalized=path.posix.normalize(value.replaceAll('\\','/'));return process.platform==='win32'?normalized.toLowerCase():normalized;};
  // Verify every destination before applying any inherited/new pending draft.
  for(const change of changes)if(change.mountId!==output.id||!canonical(change.path).startsWith('机会门店新建/'))throw Error('CHANGE_OUTSIDE_SCOPE');
  const seen=new Set();
  for(const change of changes.filter(item=>item.status==='pending')){
   const key=change.mountId+'\0'+canonical(change.path);
   if(seen.has(key)){result.changes.push({id:change.id,runId:change.runId,path:change.path,status:'superseded_not_applied',originalStatus:'pending'});continue;}
   seen.add(key);await service.apply(change.id);result.changes.push({...change});
  }
  for(const change of changes.filter(item=>item.status==='applied'&&!result.changes.some(value=>value.id===item.id)))result.changes.push({...change});
  for(const relative of ['机会门店新建/PRD.md','机会门店新建/index.html','机会门店新建/约束对照.md']){
   try{
    const bytes=await fs.readFile(await service.files.resolve(output.id,relative));
    result.artifacts.push({mountId:output.id,path:relative,status:bytes.length&&bytes.toString('utf8').trim()?'present_nonempty':'empty',bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});
    result.versions.push({path:relative,versions:await service.listVersions(output.id,relative)});
   }catch(error){if(error.code!=='ENOENT')throw error;result.artifacts.push({mountId:output.id,path:relative,status:'missing'});}
  }
  const resumed=service.state.runs.find(item=>item.id===resumedId);
  result.resumeTerminalStatus=resumed.status;result.resumeInterruptionReason=resumed.interruptionReason;
  result.status=resumed.status==='succeeded'&&result.artifacts.every(item=>item.status==='present_nonempty')?'completed_pending_business_review':'resume_incomplete';
  await stage(result.status);
 }catch(error){result.status='failed';result.error=settings?settings.redact(error instanceof Error?error.message:String(error)):'RESUME_SETUP_FAILED';process.exitCode=1;}
 finally{
  let settled=true;
  if(service){
   for(const run of service.state.runs)if(['queued','running','waiting_user','cancelling'].includes(run.status))service.cancel(run.id);
   settled=await settle();
   for(const id of [cfg.previousRunId,resumedId].filter(Boolean)){
    const run=service.state.runs.find(item=>item.id===id);
    result.runs.push({run,operations:store.operationsForRun(id),messages:service.state.conversations.find(item=>item.id===run.conversationId).messages.filter(item=>item.runId===id),contextManifest:store.get('context-manifest:'+id,null)});
   }
   result.remainingDrafts=service.state.changes.filter(item=>[cfg.previousRunId,resumedId].includes(item.runId)&&item.status==='pending').map(({id,runId,mountId,path,content,status})=>({id,runId,mountId,path,status,characters:content.length}));
  }
  for(const source of m.sources)try{
   const after=await sha(source.originalSourcePath);
   result.sourceChecks.push({name:source.name,before:source.sourceSha256Before,after,unchanged:after===source.sourceSha256Before,copyUnchanged:await sha(source.originalCopyPath)===source.copySha256,textUnchanged:await sha(source.textPath)===source.textSha256,inputUnchanged:await sha(source.inputPath)===source.inputSha256});
  }catch{result.sourceChecks.push({name:source.name,unchanged:false,error:'SOURCE_CHECK_FAILED'});}
  result.originalResultUnchanged=await sha(cfg.originalResultPath)===cfg.originalResultHash;
  result.manifestUnchanged=await sha(path.join(m.output,'manifest.json'))===cfg.manifestHash;
  if(!settled){result.status='failed';result.error='RUNTIME_DID_NOT_SETTLE';process.exitCode=1;}
  if(!result.originalResultUnchanged||!result.manifestUnchanged||result.sourceChecks.some(item=>!item.unchanged||!item.copyUnchanged||!item.textUnchanged||!item.inputUnchanged)){result.status='failed';result.error='SOURCE_OR_ORIGINAL_RESULT_CHANGED';process.exitCode=1;}
  if(service){service.dispose();await Promise.allSettled([...service.agentIndex.queues.values()]);}
  await save();if(settled)store?.close();app.exit(process.exitCode??0);
 }
}

const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const runDir=path.join(repo,'.test-data','pm-business-real-2026-10-05T06-28-41-722Z');
const previousRunId='d19698a3-1ccd-4216-b871-82998ed389ab';
const args=process.argv.slice(2),allowCloud=args.includes('--allow-cloud');
const sha=async filename=>createHash('sha256').update(await fs.readFile(filename)).digest('hex');
const inside=(root,target)=>{const r=path.relative(root,target);return r!==''&&!path.isAbsolute(r)&&r!=='..'&&!r.startsWith('..'+path.sep);};
let output;
try{
 if(!allowCloud&&!args.includes('--prepare'))throw Error('CLOUD_REQUEST_REQUIRES_ALLOW_CLOUD');
 if(await fs.realpath(runDir)!==runDir||path.dirname(runDir)!==await fs.realpath(path.join(repo,'.test-data')))throw Error('VERIFIED_RUN_DIRECTORY_REQUIRED');
 const manifestPath=path.join(runDir,'manifest.json'),originalResultPath=path.join(runDir,'result.json');
 const manifest=JSON.parse(await fs.readFile(manifestPath,'utf8')),original=JSON.parse(await fs.readFile(originalResultPath,'utf8'));
 for(const [key,suffix] of [['output',''],['profile','profile'],['workspace','workspace'],['originalCopies','evidence-originals'],['textCopies','evidence-text']]){
  const expected=suffix?path.join(runDir,suffix):runDir;
  if(path.resolve(manifest[key])!==expected||await fs.realpath(expected)!==expected)throw Error('VERIFIED_MANIFEST_PATH_MISMATCH');
 }
 const prior=original.runs?.find(item=>item.run?.id===previousRunId)?.run;
 if(prior?.status!=='interrupted'||prior.interruptionReason!=='model_output_limit'||manifest.sources?.length!==3)throw Error('VERIFIED_INTERRUPTED_RUN_REQUIRED');
 if(original.sourceChecks?.length!==3||original.sourceChecks.some(item=>!item.unchanged||!item.copyUnchanged||!item.textUnchanged))throw Error('BASELINE_SOURCE_CHECK_FAILED');
 for(const source of manifest.sources){
  if(!inside(path.resolve('E:\\code\\slash test'),path.resolve(source.originalSourcePath))||!inside(runDir,path.resolve(source.originalCopyPath))||!inside(runDir,path.resolve(source.textPath))||!inside(runDir,path.resolve(source.inputPath)))throw Error('SOURCE_SCOPE_INVALID');
  if(await sha(source.originalSourcePath)!==source.sourceSha256Before||await sha(source.originalCopyPath)!==source.copySha256||await sha(source.textPath)!==source.textSha256||await sha(source.inputPath)!==source.inputSha256)throw Error('SOURCE_VERSION_CHANGED');
 }
 const db=new DatabaseSync(path.join(manifest.profile,'slash.sqlite'),{readOnly:true});
 try{
  const state=JSON.parse(String(db.prepare("SELECT value FROM kv WHERE key='state'").get().value)),run=state.runs.find(item=>item.id===previousRunId);
  if(state.root!==manifest.workspace||run?.status!=='interrupted'||!run.resumable||state.connections.length||state.runs.some(item=>item.resumedFromRunId===previousRunId))throw Error('PROFILE_RESUME_STATE_INVALID');
 }finally{db.close();}
 if(allowCloud)await fs.writeFile(path.join(runDir,'resume-attempt.json'),JSON.stringify({previousRunId,requestedAt:new Date().toISOString(),automaticRetries:0}),{flag:'wx'}).catch(()=>{throw Error('RESUME_ALREADY_ATTEMPTED_OR_MARKER_FAILED');});
 output=await fs.mkdtemp(path.join(runDir,allowCloud?'resume-once-':'resume-prepared-'));
 const modules=Object.fromEntries(['store','service','settings'].map(name=>[name,pathToFileURL(path.join(repo,'dist','main',name+'.js')).href]));
 const cfg={manifest,modules,previousRunId,originalResultPath,originalResultHash:await sha(originalResultPath),manifestHash:await sha(manifestPath),output};
 const harness=path.join(output,'resume-harness.mjs');
 await fs.writeFile(harness,"import {app,safeStorage} from 'electron';\nvoid ("+resumeHarness.toString()+")(app,safeStorage,"+JSON.stringify(cfg)+");\n",{flag:'wx'});
 if(!allowCloud){console.log(JSON.stringify({status:'prepared_no_cloud_request',output,harness,previousRunId}));}
 else{
  const env={...process.env,PM_SLASH_DATA_DIR:manifest.profile};delete env.ELECTRON_RUN_AS_NODE;
  let timedOut=false;
  const code=await new Promise((resolve,reject)=>{
   const child=spawn(electronPath,[harness],{cwd:repo,env,windowsHide:true,stdio:'ignore'}),start=Date.now();let started=false,checking=false;
   const watchdog=setInterval(async()=>{
    if(checking)return;checking=true;
    try{const p=JSON.parse(await fs.readFile(path.join(output,'harness-progress.json'),'utf8'));if(['resume_running','resume_incomplete','completed_pending_business_review'].includes(p.stage))started=true;}catch{}
    checking=false;if((!started&&Date.now()-start>60000)||Date.now()-start>15*60*1000){timedOut=true;child.kill();}
   },1000);
   child.once('error',()=>{clearInterval(watchdog);reject(Error('ELECTRON_HARNESS_START_FAILED'));});
   child.once('exit',value=>{clearInterval(watchdog);resolve(value);});
  });
  const resultFile=path.join(output,'resume-result.json');
  if(timedOut){let old={};try{old=JSON.parse(await fs.readFile(resultFile,'utf8'));}catch{}await fs.writeFile(resultFile,JSON.stringify({...old,status:'failed',error:'HARNESS_PARENT_TIMEOUT'}));throw Error('HARNESS_PARENT_TIMEOUT');}
  const result=JSON.parse(await fs.readFile(resultFile,'utf8'));
  console.log(JSON.stringify({status:result.status,output,resultFile,previousRunId,resumedRunId:result.resumedRunId,resumeTerminalStatus:result.resumeTerminalStatus,businessReview:result.businessReview}));
  if(code!==0||result.status!=='completed_pending_business_review')process.exitCode=1;
 }
}catch(error){console.error(JSON.stringify({status:'failed',reason:String(error.message).match(/^[A-Z][A-Z0-9_]+$/)?.[0]??'RESUME_LOCAL_SETUP_FAILED',output}));process.exitCode=1;}
