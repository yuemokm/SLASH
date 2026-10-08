// One explicit official resume; --verify is offline and never launches Electron.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {fileURLToPath} from 'node:url';
import {_electron as electron} from 'playwright';
import {requestSchema} from '../dist/shared/types.js';
import {syntheticOperationsData} from './pm-operations-synthetic-scenario.mjs';
import {loadObservationPolicy} from './pm-run-observation-policy.mjs';

const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const approved=path.join(repo,'.test-data','pm-operations-real-2026-10-06T15-02-09.188Z-0W1tPJ');
const args=process.argv.slice(2),value=name=>args[args.indexOf(name)+1];
const sha=bytes=>createHash('sha256').update(bytes).digest('hex'),hash=async file=>sha(await fs.readFile(file));
const exists=async file=>fs.stat(file).then(()=>true,error=>{if(error.code==='ENOENT')return false;throw error;});
const terminal=new Set(['succeeded','failed','interrupted','cancelled','awaiting_plan']);
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const canon=value=>String(value).replaceAll('\\','/').split('/').filter(part=>part&&part!=='.').join('/').toLowerCase();
const within=(parent,target)=>{const rel=path.relative(parent,target);return rel&&!path.isAbsolute(rel)&&rel!=='..'&&!rel.startsWith('..'+path.sep);};
const code=error=>String(error?.message??'').match(/^[A-Z][A-Z0-9_]+(?=:|$)/)?.[0]??'CONTINUE_HARNESS_FAILED';
function kv(db,key){const row=db.prepare('SELECT value FROM kv WHERE key=?').get(key);return row?JSON.parse(row.value):undefined;}
async function direct(folder){if(await fs.realpath(folder)!==folder)throw Error('ISOLATION_SYMLINK_FORBIDDEN');}
async function runtime(){
 const result={};
 async function scan(dir){for(const entry of await fs.readdir(dir,{withFileTypes:true})){const file=path.join(dir,entry.name);if(entry.isSymbolicLink())throw Error('RUNTIME_SYMLINK_FORBIDDEN');if(entry.isDirectory())await scan(file);else if(entry.isFile())result[path.relative(path.join(repo,'dist'),file).replaceAll('\\','/')]=await hash(file);}}
 await scan(path.join(repo,'dist'));return result;
}
function readProfile(profile){const db=new DatabaseSync(path.join(profile,'slash.sqlite'),{readOnly:true});try{return kv(db,'state');}finally{db.close();}}
function complete(content){
 const checks={doctype:/<!doctype html>/i.test(content),htmlEnd:/<\/html>\s*$/i.test(content),hasScript:/<script\b[\s\S]*<\/script>/i.test(content),offlineMapLabel:content.includes('离线示意地图'),allStores:syntheticOperationsData.stores.every(row=>content.includes(row.name)),allReps:syntheticOperationsData.reps.every(row=>content.includes(row.name)),allTaskIds:syntheticOperationsData.tasks.every(row=>content.includes(row.id)),noFillMarkers:!/(?:<!--\s*(?:SLASH_SECTION_|TODO_|PLACEHOLDER_)|\b(?:CHUNK_[A-Z]+|REPLACE_ME)\b)/.test(content)};
 return{checks,passed:Object.values(checks).every(Boolean),notice:'Host completeness only; visual quality and interaction/business correctness require independent review.'};
}
function summarize(run){return{...Object.fromEntries(['id','conversationId','sourcePlanRunId','resumedFromRunId','attempt','status','phase','resumable','startedAt','finishedAt','generationStartedAt','generationFinishedAt','generationDurationMs','interruptionReason','modelStopReason','modelRoute','reasoning','contextRecovery'].map(key=>[key,run[key]])),error:run.error?.slice(0,1200)};}

async function load(){
 if(!args.includes('--test-dir')||!args.includes('--expected-run')||!args.includes('--protocol'))throw Error('EXPLICIT_CASE_RUN_PROTOCOL_REQUIRED');
 const output=await fs.realpath(path.resolve(value('--test-dir')));if(output!==approved)throw Error('TEST_CASE_NOT_APPROVED');
 const label=value('--protocol');if(!['completions','responses'].includes(label))throw Error('EXPLICIT_PROTOCOL_REQUIRED');
 const expected=value('--expected-run');if(!/^[0-9a-f-]{36}$/.test(expected))throw Error('EXPECTED_RUN_INVALID');
 const manifestFile=path.join(output,'manifest.json'),m=JSON.parse(await fs.readFile(manifestFile,'utf8')),c=m.cases?.[label];
 if(m.output!==output||m.sources!==path.join(output,'synthetic-sources')||m.htmlPath!=='门店作战中心/index.html'||c?.folder!==path.join(output,'protocols',label)||c.profile!==path.join(c.folder,'profile')||c.workspace!==path.join(c.folder,'workspace')||c.result!==path.join(c.folder,'result.json')||c.model?.protocol!==`openai-${label}`)throw Error('ISOLATION_MANIFEST_INVALID');
 for(const folder of [output,m.sources,c.folder,c.profile,c.workspace])await direct(folder);
 if(!Array.isArray(m.sourceFiles)||m.sourceFiles.length!==2||!['operations-brief.md','operations-data.json'].every(name=>m.sourceFiles.some(file=>file.name===name)))throw Error('SOURCE_MANIFEST_INVALID');
 for(const file of m.sourceFiles){if(file.path!==path.join(m.sources,file.name)||await hash(file.path)!==file.sha256)throw Error('SYNTHETIC_SOURCE_CHANGED');}
 const original=JSON.parse(await fs.readFile(c.result,'utf8'));
 if(original.profile!==c.profile||original.workspace!==c.workspace||original.configuredProtocol!==c.model.protocol||original.realSendCalls!==1)throw Error('EXPECTED_ORIGINAL_RUN_MISMATCH');
 let parent,parentFile;
 if(args.includes('--parent-receipt')){
  parentFile=await fs.realpath(path.resolve(value('--parent-receipt')));
  if(parentFile!==path.join(c.folder,'continuation-'+original.runId,'resume-receipt.json')||parentFile!==path.resolve(value('--parent-receipt')))throw Error('PARENT_RECEIPT_SCOPE_INVALID');
  await direct(path.dirname(parentFile));parent=JSON.parse(await fs.readFile(parentFile,'utf8'));
  if(parent.originalRunId!==original.runId||parent.resumedRunId!==expected||parent.run?.id!==expected||parent.status!=='failed'||!['failed','interrupted'].includes(parent.run.status)||parent.run.resumable!==true||parent.finalArtifact||parent.profile!==c.profile||parent.workspace!==c.workspace||parent.conversationId!==original.conversationId||parent.configuredModel?.id!==c.model.id||parent.configuredModel?.protocol!==c.model.protocol||parent.resumeCalls!==1||parent.sendCalls!==0||!parent.protectedEvidenceUnchanged||!parent.readonlySeedUnchanged)throw Error('PARENT_RECEIPT_CHAIN_INVALID');
  if([manifestFile,c.result,path.join(c.folder,'run-once.lock'),path.join(c.folder,'task-prompt.txt')].some(file=>typeof parent.originalProtectedHashes?.[file]!=='string'))throw Error('PARENT_PROTECTED_HASHES_MISSING');
  for(const [file,expectedHash]of Object.entries(parent.originalProtectedHashes??{}))if(!within(output,file)||await hash(file)!==expectedHash)throw Error('PARENT_PROTECTED_EVIDENCE_CHANGED');
 }else if(original.runId!==expected)throw Error('SECOND_RESUME_REQUIRES_PARENT_RECEIPT');
 const observation=await loadObservationPolicy(repo,args.includes('--observe-seconds')?value('--observe-seconds'):undefined),observeSeconds=observation.observeSeconds;
 const protectedFiles=[manifestFile,c.result,path.join(c.folder,'run-once.lock'),path.join(c.folder,'task-prompt.txt')];
 if(parent){protectedFiles.push(parentFile,path.join(c.folder,'resume-once.lock'));for(const draft of parent.drafts??[]){if(draft.snapshot){if(!within(path.dirname(parentFile),draft.snapshot)||await hash(draft.snapshot)!==draft.sha256)throw Error('PARENT_DIAGNOSTIC_SNAPSHOT_CHANGED');protectedFiles.push(draft.snapshot);}}}
 const protectedHashes=Object.fromEntries(await Promise.all(protectedFiles.map(async file=>[file,await hash(file)])));
 const current=await runtime(),diff=Object.entries(m.runtime).filter(([file,old])=>current[file]!==old).map(([file,old])=>({file,originalHash:old,currentHash:current[file]??null}));
 const parentDiff=parent?[...new Set([...Object.keys(parent.runtime),...Object.keys(current)])].filter(file=>parent.runtime[file]!==current[file]).map(file=>({file,parentHash:parent.runtime[file]??null,currentHash:current[file]??null})):[];
 if((diff.length||parentDiff.length)&&!args.includes('--allow-runtime-update'))throw Error('RUNTIME_UPDATE_REQUIRES_EXPLICIT_FLAG');
 const seed=path.join(repo,'.test-data','pm-synthetic-real-2026-10-05T14-23-01.348Z-QhpnRm','profile');
 const seedHashes={database:await hash(path.join(seed,'slash.sqlite')),localState:await hash(path.join(seed,'Local State'))};
 if(Object.entries(seedHashes).some(([key,actual])=>actual!==m.sourceProfileHashes?.after?.[key]))throw Error('READONLY_SEED_PROFILE_CHANGED');
 const s=readProfile(c.profile),checked=await checkState(s,{m,c,expected,original,parent});
 for(const input of [{type:'state'},{type:'resume',id:expected},{type:'operations',limit:200},{type:'pendingApprovals',conversationId:checked.old.conversationId},{type:'apply',id:expected},{type:'versions',mountId:checked.outputMount.id,path:m.htmlPath}])requestSchema.parse(input);
 return{output,m,c,label,expected,original,parent,parentFile,observation,observeSeconds,protectedHashes,runtime:current,runtimeDiff:diff,runtimeDiffFromParent:parentDiff,seed,seedHashes,...checked};
}
async function checkState(s,{m,c,expected,original,parent}){
 const old=s?.runs?.find(run=>run.id===expected),selected=s.models?.find(model=>model.id===s.defaultModelId);
 if(!old||!['failed','interrupted'].includes(old.status)||old.resumable!==true)throw Error('ORIGINAL_RUN_NOT_RESUMABLE');
 if(old.conversationId!==original.conversationId||!s.conversations?.some(row=>row.id===old.conversationId)||old.modelEntryId!==c.model.id||old.modelRoute?.modelId!==c.model.modelId)throw Error('ORIGINAL_RUN_IDENTITY_CHANGED');
 if(s.root!==c.workspace||s.models?.length!==1||selected?.id!==c.model.id||selected.modelId!==c.model.modelId||selected.provider!==c.model.provider||selected.protocol!==c.model.protocol||!selected.hasKey||s.connections?.length||['web_read','process_execute','external_action','connection_config'].some(key=>s.permissions?.[key]!=='deny')||['workspace_read','artifact_write'].some(key=>s.permissions?.[key]!=='allow'))throw Error('ISOLATED_EXECUTION_CONFIG_INVALID');
 const sourceMount=s.mounts.find(mount=>mount.path===m.sources),outputMount=s.mounts.find(mount=>mount.name==='成果');
 if(!sourceMount?.enabled||sourceMount.write!==false||!outputMount?.enabled||!outputMount.write||!within(c.workspace,outputMount.path)||s.mounts.some(mount=>mount.path!==m.sources&&!within(c.workspace,mount.path)))throw Error('ISOLATED_MOUNTS_INVALID');
 if(s.runs.some(run=>!terminal.has(run.status)))throw Error('ANOTHER_TASK_ACTIVE');
 const priorRunIds=parent?[original.runId,expected]:[expected];
 if(s.runs.filter(run=>run.conversationId===old.conversationId).length!==priorRunIds.length||s.runs.some(run=>run.conversationId===old.conversationId&&!priorRunIds.includes(run.id))||parent&&old.resumedFromRunId!==original.runId)throw Error('UNEXPECTED_CONVERSATION_RUN');
 await direct(outputMount.path);
 const target=path.join(outputMount.path,...m.htmlPath.split('/')),targetHash=await exists(target)?await hash(target):null;
 if(await exists(target)){if(await fs.realpath(target)!==target)throw Error('TARGET_SYMLINK_FORBIDDEN');}
 const pending=s.changes.filter(row=>row.status==='pending');
 if(pending.length>1||pending.some(row=>row.runId!==expected||row.mountId!==outputMount.id||canon(row.path)!==canon(m.htmlPath)||row.before!==targetHash))throw Error('ORIGINAL_PENDING_SCOPE_INVALID');
 if(parent){const recorded=(parent.drafts??[]).filter(row=>row.status==='pending');if(recorded.length!==1||pending.length!==1||pending[0].id!==recorded[0].id||sha(Buffer.from(pending[0].content))!==recorded[0].sha256||pending[0].mountId!==recorded[0].mountId||canon(pending[0].path)!==canon(recorded[0].path)||targetHash!==parent.originalTargetHash||targetHash!==null)throw Error('PARENT_PENDING_HASH_OR_BASE_CHANGED');}
 if(s.changes.some(row=>row.runId===expected&&row.status!=='pending'))throw Error('ORIGINAL_CHANGE_STATE_INVALID');
 return{old:summarize(old),priorRunIds,conversationId:old.conversationId,sourceMount:{id:sourceMount.id,path:sourceMount.path,write:false},outputMount:{id:outputMount.id,path:outputMount.path},target,targetHash,originalPending:pending.map(row=>({id:row.id,runId:row.runId,originRunId:row.originRunId??row.runId,before:row.before,sha256:sha(Buffer.from(row.content)),bytes:Buffer.byteLength(row.content)}))};
}

async function execute(ctx){
 if(!args.includes('--allow-cloud'))throw Error('EXPLICIT_CLOUD_GATE_REQUIRED');
 const lockFile=path.join(ctx.c.folder,ctx.parent?'resume-'+ctx.expected+'.lock':'resume-once.lock'),activePath=path.join(ctx.output,'active-desktop.lock');
 if(await exists(lockFile))throw Error('RESUME_ALREADY_ATTEMPTED');
 const active=await fs.open(activePath,'wx').catch(()=>{throw Error('ANOTHER_DESKTOP_ACTIVE');});await active.close();
 let app,page,newId,resumeAt,serviceGraceDeadline,receiptDir;
 const receipt={schemaVersion:1,status:'preparing_resume',startedAt:new Date().toISOString(),originalRunId:ctx.expected,rootOriginalRunId:ctx.original.runId,parentReceipt:ctx.parentFile,originalRun:ctx.old,priorRunIds:ctx.priorRunIds,hostRunLimits:ctx.observation.hostLimits,observationBudgetSeconds:ctx.observeSeconds,serviceGraceSeconds:ctx.observation.graceSeconds,conversationId:ctx.conversationId,profile:ctx.c.profile,workspace:ctx.c.workspace,configuredModel:ctx.c.model,runtime:ctx.runtime,runtimeDiffFromOriginalManifest:ctx.runtimeDiff,runtimeDiffFromParentReceipt:ctx.runtimeDiffFromParent,runtimeUpdateExplicitlyAllowed:args.includes('--allow-runtime-update'),originalProtectedHashes:ctx.protectedHashes,sourceProfileHashes:ctx.seedHashes,originalPending:ctx.originalPending,originalTargetHash:ctx.targetHash,cloudExecuted:false,resumeCalls:0,sendCalls:0,toolObservations:[],drafts:[],businessReview:'not_run',visualReview:'not_run',viewports:ctx.m.viewports,pageErrors:[]};
 const save=()=>fs.writeFile(path.join(receiptDir,'resume-receipt.json'),JSON.stringify(receipt,null,2));
 const call=async input=>{const parsed=requestSchema.parse(input),response=await page.evaluate(value=>window.pm.request(value),parsed);if(!response.ok){const error=Error(response.error??'IPC_FAILED');error.ipcType=parsed.type;throw error;}return response.data;};
 async function observe(){
  const s=await call({type:'state'}),run=s.runs.find(row=>row.id===newId);if(run){receipt.run=summarize(run);serviceGraceDeadline??=Date.parse(run.startedAt)+ctx.observation.totalObservationMs;}
  const operations=await call({type:'operations',limit:200});if(!Array.isArray(operations))throw Error('OPERATIONS_RESPONSE_NOT_ARRAY');
  const now=new Date().toISOString();
  for(const op of operations.filter(row=>[...ctx.priorRunIds,newId].includes(row.runId))){let item=receipt.toolObservations.find(row=>row.id===op.id);if(!item){item={id:op.id,runId:op.runId,tool:op.tool,createdAt:op.createdAt,firstObservedAt:now};receipt.toolObservations.push(item);}item.state=op.state;item.lastObservedAt=now;if(['succeeded','failed','cancelled','outcome_unknown'].includes(op.state)&&!item.terminalStateObservedAt)item.terminalStateObservedAt=now;}
  receipt.toolCounts=Object.fromEntries(['read_file','read_draft','write_draft','edit_draft'].map(tool=>[tool,receipt.toolObservations.filter(row=>row.tool===tool&&row.runId===newId).length]));
  await save();return s;
 }
 async function session(){
  const db=new DatabaseSync(path.join(ctx.c.profile,'slash.sqlite'),{readOnly:true});let sessionFile;receipt.sourceReadEvidence=[];
  try{sessionFile=kv(db,'session:'+ctx.conversationId);for(const id of [...ctx.priorRunIds,newId].filter(Boolean)){for(const read of kv(db,'context-manifest:'+id)?.sourceRefs??[])if(read.mountId===ctx.sourceMount.id)receipt.sourceReadEvidence.push({runId:id,name:read.path,contentHash:read.contentHash,readAt:read.readAt,locator:read.locator});}}finally{db.close();}
  receipt.sourceReadVerified=ctx.m.sourceFiles.every(file=>receipt.sourceReadEvidence.some(read=>canon(read.name)===canon(file.name)&&read.contentHash===file.sha256));
  if(!sessionFile)return;
  const file=await fs.realpath(sessionFile);if(!within(ctx.c.profile,file)||(await fs.stat(file)).size>32*1024*1024)throw Error('SESSION_EVIDENCE_SCOPE_INVALID');
  receipt.assistantSpans=[];receipt.nativeToolResults=[];receipt.pendingReadEvidence=[];const pendingReadCalls=new Set();
  for(const line of (await fs.readFile(file,'utf8')).split(/\r?\n/).filter(Boolean)){const row=JSON.parse(line),message=row.type==='message'?row.message:undefined;if(!message||Date.parse(row.timestamp)<Date.parse(ctx.old.startedAt))continue;const runId=resumeAt&&Date.parse(row.timestamp)>=resumeAt?newId:ctx.expected;
   if(message.role==='assistant'){const content=Array.isArray(message.content)?message.content:[],started=Number(message.timestamp),ended=Date.parse(row.timestamp),usage={};for(const key of ['input','output','cacheRead','cacheWrite','totalTokens'])if(Number.isFinite(message.usage?.[key]))usage[key]=message.usage[key];receipt.assistantSpans.push({runId,persistedAt:row.timestamp,spanMs:Number.isFinite(started)&&ended>=started?ended-started:undefined,api:message.api,provider:message.provider,model:message.model,stopReason:message.stopReason,usage,textChars:typeof message.content==='string'?message.content.length:content.filter(block=>block.type==='text').reduce((sum,block)=>sum+(block.text?.length??0),0),thinkingChars:content.filter(block=>block.type==='thinking').reduce((sum,block)=>sum+(block.thinking?.length??0),0),toolCalls:content.filter(block=>block.type==='toolCall').map(block=>({id:block.id,name:block.name,argumentChars:JSON.stringify(block.arguments??{}).length}))});if(runId===newId)for(const block of content)if(block.type==='toolCall'&&block.name==='read_draft'&&block.arguments?.mountId===ctx.outputMount.id&&canon(block.arguments.path)===canon(ctx.m.htmlPath))pendingReadCalls.add(block.id);}
   if(message.role==='toolResult'){receipt.nativeToolResults.push({runId,id:message.toolCallId,name:message.toolName,persistedAt:row.timestamp,isError:message.isError});if(runId===newId&&!message.isError&&pendingReadCalls.has(message.toolCallId)){try{const body=typeof message.content==='string'?message.content:(message.content??[]).filter(block=>block.type==='text').map(block=>block.text).join('\n'),read=JSON.parse(body);receipt.pendingReadEvidence.push({id:message.toolCallId,changeId:read.changeId,contentHash:read.contentHash,mountId:read.mountId,path:read.path,offset:read.offset,total:read.total,truncated:read.truncated,readAt:row.timestamp});}catch{}}}
  }
  const apis=[...new Set(receipt.assistantSpans.filter(row=>row.runId===newId).map(row=>row.api).filter(Boolean))];receipt.actualResumeApis=apis;receipt.actualProtocolVerified=apis.length>0&&apis.every(api=>api===ctx.c.model.protocol);
 }
 async function drafts(s,final=false){
  const relevant=s.changes.filter(row=>[ctx.expected,newId].includes(row.runId)||ctx.originalPending.some(old=>old.id===row.id));receipt.drafts=[];
  for(const row of relevant){const entry={id:row.id,runId:row.runId,originRunId:row.originRunId,resumptionHistory:row.resumptionHistory,status:row.status,mountId:row.mountId,path:row.path,sha256:sha(Buffer.from(row.content)),bytes:Buffer.byteLength(row.content),purpose:'unapplied_diagnostic_candidate',appliedByHarness:false};if(row.status==='pending'&&row.mountId===ctx.outputMount.id&&canon(row.path)===canon(ctx.m.htmlPath)){entry.snapshot=path.join(receiptDir,final?'candidate-final.html':`diagnostic-${row.id}.html`);if(!await exists(entry.snapshot))await fs.writeFile(entry.snapshot,row.content,{flag:'wx'});}receipt.drafts.push(entry);}
  await save();return relevant;
 }
 try{
  const once=await fs.open(lockFile,'wx');await once.close();
  receiptDir=path.join(ctx.c.folder,'continuation-'+ctx.expected);await fs.mkdir(receiptDir);await save();
  const env={...process.env,PM_SLASH_DATA_DIR:ctx.c.profile};delete env.ELECTRON_RUN_AS_NODE;delete env.VITE_DEV_SERVER_URL;
  app=await electron.launch({cwd:repo,args:['.'],env,timeout:60000});page=await app.firstWindow();page.setDefaultTimeout(20000);page.on('pageerror',()=>receipt.pageErrors.push('RENDERER_PAGE_ERROR'));await page.locator('.brand').waitFor();
  if(await app.evaluate(({app})=>app.getPath('userData'))!==ctx.c.profile)throw Error('USER_DATA_ISOLATION_MISMATCH');
  const before=await call({type:'state'}),live=await checkState(before,ctx);
  if(JSON.stringify(live.originalPending)!==JSON.stringify(ctx.originalPending)||live.targetHash!==ctx.targetHash||JSON.stringify(await runtime())!==JSON.stringify(ctx.runtime))throw Error('RESUME_PREFLIGHT_CHANGED');
  const approvals=await call({type:'pendingApprovals',conversationId:ctx.conversationId});if(!Array.isArray(approvals)||approvals.some(row=>row.status==='pending'))throw Error('UNEXPECTED_PENDING_APPROVAL');
  receipt.status='resuming_original_task';receipt.resumeCalls=1;receipt.cloudExecuted=true;resumeAt=Date.now();await save();
  newId=await call({type:'resume',id:ctx.expected});receipt.resumedRunId=newId;await save();
  let s=await observe();
  if(!serviceGraceDeadline)throw Error('RESUMED_RUN_NOT_OBSERVABLE');
  while(Date.now()<serviceGraceDeadline){if(terminal.has(receipt.run?.status))break;await sleep(1500);s=await observe();}
  if(!terminal.has(receipt.run?.status))throw Error('SERVICE_TIMEOUT_DID_NOT_TERMINATE_AFTER_GRACE');
  await session();if(receipt.run.status!=='succeeded'){await drafts(s);throw Error('RESUMED_TASK_NOT_SUCCEEDED');}
  if(receipt.run.conversationId!==ctx.conversationId||receipt.run.resumedFromRunId!==ctx.expected||s.runs.filter(row=>row.conversationId===ctx.conversationId).length!==ctx.priorRunIds.length+1||!ctx.priorRunIds.every(id=>s.runs.some(row=>row.id===id)))throw Error('RESUME_LINK_INVALID');
  const changes=await drafts(s,true),pending=s.changes.filter(row=>row.status==='pending');
  if(changes.length!==1||pending.length!==1||pending[0].mountId!==ctx.outputMount.id||canon(pending[0].path)!==canon(ctx.m.htmlPath)||pending[0].before!==ctx.targetHash)throw Error('FINAL_PENDING_SCOPE_INVALID');
  const draft=pending[0];
  const unchanged=ctx.originalPending.length===1&&draft.id===ctx.originalPending[0].id&&draft.runId===ctx.expected&&sha(Buffer.from(draft.content))===ctx.originalPending[0].sha256;
  if(unchanged){if(!receipt.pendingReadEvidence.some(read=>read.changeId===draft.id&&read.contentHash===ctx.originalPending[0].sha256&&read.mountId===ctx.outputMount.id&&canon(read.path)===canon(ctx.m.htmlPath)))throw Error('EXISTING_PENDING_NOT_READ_BY_VALIDATION_RUN');receipt.pendingDisposition='validated_existing_pending_without_edit';receipt.validationRunId=newId;receipt.pendingOwnerRunId=draft.runId;}
  else{if(draft.runId!==newId)throw Error('FINAL_PENDING_OWNER_INVALID');if(ctx.originalPending.length&&(draft.id!==ctx.originalPending[0].id||draft.originRunId!==ctx.originalPending[0].originRunId||!draft.resumptionHistory?.some(row=>row.fromRunId===ctx.expected&&row.toRunId===newId)))throw Error('PENDING_RESUMPTION_HISTORY_INVALID');receipt.pendingDisposition=ctx.originalPending.length?'edited_existing_pending_with_real_history':'new_pending';}
  if(!receipt.sourceReadVerified)throw Error('SYNTHETIC_SOURCES_NOT_ACTUALLY_READ');if(!receipt.actualProtocolVerified)throw Error('ACTUAL_RESUME_PROTOCOL_MISMATCH');
  receipt.completeness=complete(draft.content);if(!receipt.completeness.passed)throw Error('FINAL_DRAFT_INCOMPLETE');
  if((await exists(ctx.target)?await hash(ctx.target):null)!==ctx.targetHash)throw Error('TARGET_CHANGED_BEFORE_APPLY');
  for(const file of ctx.m.sourceFiles)if(await hash(file.path)!==file.sha256)throw Error('SYNTHETIC_SOURCE_CHANGED_BEFORE_APPLY');
  const finalHash=sha(Buffer.from(draft.content));await call({type:'apply',id:draft.id});
  const applied=await call({type:'state'});if(applied.changes.find(row=>row.id===draft.id)?.status!=='applied'||await hash(ctx.target)!==finalHash)throw Error('APPLIED_CONTENT_HASH_MISMATCH');
  const versions=await call({type:'versions',mountId:ctx.outputMount.id,path:ctx.m.htmlPath});if(!versions.length)throw Error('APPLIED_VERSION_MISSING');
  const snapshot=path.join(receiptDir,'final-html.html');await fs.copyFile(ctx.target,snapshot,fs.constants.COPYFILE_EXCL);
  receipt.drafts[0].appliedByHarness=true;receipt.drafts[0].purpose='applied_final_candidate';receipt.finalArtifact={path:ctx.target,snapshot,sha256:finalHash,changeId:draft.id,versions};receipt.status='resumed_applied_pending_independent_review';
 }catch(error){receipt.status='failed';receipt.reason=code(error);receipt.ipcType=error.ipcType;process.exitCode=1;}
 finally{
  if(app){if(newId){try{let s=await observe();while(!terminal.has(receipt.run?.status)&&Date.now()<(serviceGraceDeadline??resumeAt+ctx.observation.totalObservationMs)){await sleep(1000);s=await observe();}if(!terminal.has(receipt.run?.status)){receipt.cleanupCancelAfterServiceGrace=true;await call({type:'cancel',id:newId});}if(!receipt.finalArtifact)await drafts(s);await session();}catch(error){receipt.cleanupDiagnostic=code(error);}}await app.close().catch(()=>{});}
  receipt.sourceChecks=await Promise.all(ctx.m.sourceFiles.map(async file=>({name:file.name,expectedHash:file.sha256,actualHash:await hash(file.path).catch(()=>null)})));
  receipt.protectedEvidenceUnchanged=(await Promise.all(Object.entries(ctx.protectedHashes).map(async([file,expected])=>await hash(file)===expected))).every(Boolean);
  receipt.readonlySeedUnchanged=await hash(path.join(ctx.seed,'slash.sqlite'))===ctx.seedHashes.database&&await hash(path.join(ctx.seed,'Local State'))===ctx.seedHashes.localState;
  if(!receipt.protectedEvidenceUnchanged||!receipt.readonlySeedUnchanged||receipt.sourceChecks.some(row=>row.expectedHash!==row.actualHash)){receipt.status='failed';receipt.reason='ORIGINAL_EVIDENCE_OR_SOURCE_CHANGED';process.exitCode=1;}
  receipt.finishedAt=new Date().toISOString();if(receiptDir)await save();await fs.unlink(activePath);
  console.log(JSON.stringify({status:receipt.status,reason:receipt.reason,receipt:receiptDir?path.join(receiptDir,'resume-receipt.json'):undefined,originalRunId:ctx.expected,resumedRunId:newId,cloudExecuted:receipt.cloudExecuted,resumeCalls:receipt.resumeCalls,sendCalls:0,artifact:receipt.finalArtifact?.snapshot}));
 }
}

try{
 const flags=new Set(['--help','--verify','--resume','--allow-cloud','--allow-runtime-update','--test-dir','--protocol','--expected-run','--parent-receipt','--observe-seconds']);
 for(let i=0;i<args.length;i++){if(!flags.has(args[i]))throw Error('UNKNOWN_ARGUMENT');if(['--test-dir','--protocol','--expected-run','--parent-receipt','--observe-seconds'].includes(args[i])){if(!args[i+1]||args[i+1].startsWith('--'))throw Error('ARGUMENT_VALUE_REQUIRED');i++;}}
 if(args.includes('--help'))console.log('Offline: --verify --test-dir <approved case> --protocol completions --expected-run <parent run ID> [--parent-receipt <first resume receipt>] [--observe-seconds <compiled host budget>] [--allow-runtime-update]\nOne official continuation: --resume --allow-cloud with same arguments. Per-parent once lock and independent receipt; compiled host budget plus 15s grace; never send a replacement task.');
 else{if(args.includes('--verify')===args.includes('--resume')||args.includes('--verify')&&args.includes('--allow-cloud'))throw Error('SELECT_VERIFY_OR_RESUME');const ctx=await load();if(args.includes('--verify'))console.log(JSON.stringify({status:'verified_offline_no_resume',cloudExecuted:false,expectedRun:ctx.expected,rootOriginalRunId:ctx.original.runId,parentReceipt:ctx.parentFile,priorRunIds:ctx.priorRunIds,hostRunLimits:ctx.observation.hostLimits,observationBudgetSeconds:ctx.observeSeconds,serviceGraceSeconds:ctx.observation.graceSeconds,run:ctx.old,configuredModel:ctx.c.model,profile:ctx.c.profile,workspace:ctx.c.workspace,contracts:['state','resume','operations','pendingApprovals','apply','versions'],originalPending:ctx.originalPending,targetHash:ctx.targetHash,runtimeDiff:ctx.runtimeDiff,runtimeDiffFromParentReceipt:ctx.runtimeDiffFromParent,runtimeUpdateExplicitlyAllowed:args.includes('--allow-runtime-update')}));else await execute(ctx);}
}catch(error){console.error(JSON.stringify({status:'failed',reason:code(error),cloudExecuted:false}));process.exitCode=1;}
