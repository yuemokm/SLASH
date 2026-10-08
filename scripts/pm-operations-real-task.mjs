// Preparation/verification are offline. Only --run --allow-cloud sends one real task.
import fs from 'node:fs/promises';
import path from 'node:path';
import {constants} from 'node:fs';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {fileURLToPath} from 'node:url';
import {_electron as electron} from 'playwright';
import {requestSchema} from '../dist/shared/types.js';
import {operationsBrief,operationsPrompt,syntheticOperationsData} from './pm-operations-synthetic-scenario.mjs';
import {loadObservationPolicy} from './pm-run-observation-policy.mjs';

const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),testRoot=path.join(repo,'.test-data');
const args=process.argv.slice(2),arg=name=>{const index=args.indexOf(name);return index<0?undefined:args[index+1];};
const protocols={responses:'openai-responses',completions:'openai-completions'};
const allowedSource=path.join(testRoot,'pm-synthetic-real-2026-10-05T14-23-01.348Z-QhpnRm','profile');
const title='合成移动SFA门店作战中心',htmlPath='门店作战中心/index.html';
const terminal=new Set(['succeeded','failed','interrupted','cancelled','awaiting_plan']);
const sha=bytes=>createHash('sha256').update(bytes).digest('hex'),hash=async file=>sha(await fs.readFile(file));
const canonical=value=>String(value).replaceAll('\\','/').split('/').filter(part=>part&&part!=='.').join('/').toLowerCase();
const reason=error=>String(error?.message??'').replace(/^Error:\s*/,'').match(/^[A-Z][A-Z0-9_]+(?=:|$)/)?.[0]??'OPERATIONS_HARNESS_FAILED';
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const runtimeFiles=['main/main.js','main/service.js','main/agent.js','main/settings.js','main/model-runtime.js','main/model-thinking.js','main/system-prompt.js','main/session-compaction.js','main/draft-edit.js','main/run-limits.js','shared/types.js','renderer/index.html'];
async function runtimeHashes(){return Object.fromEntries(await Promise.all(runtimeFiles.map(async file=>[file,await hash(path.join(repo,'dist',file))])));}
function within(parent,target){const relative=path.relative(parent,target);return relative&&!path.isAbsolute(relative)&&relative!=='..'&&!relative.startsWith('..'+path.sep);}
async function directFolder(folder){if(await fs.realpath(folder)!==folder)throw Error('ISOLATION_SYMLINK_FORBIDDEN');}
function readKV(db,key){const row=db.prepare('SELECT value FROM kv WHERE key=?').get(key);return row?JSON.parse(row.value):undefined;}
function modelView(model){return{id:model.id,name:model.name,provider:model.provider,modelId:model.modelId,protocol:model.protocol,contextWindow:model.contextWindow,maxTokens:model.maxTokens};}

async function prepare(){
 const observation=await loadObservationPolicy(repo);
 if(!arg('--source-profile'))throw Error('SOURCE_PROFILE_REQUIRED');
 const source=await fs.realpath(path.resolve(arg('--source-profile')));
 if(source!==await fs.realpath(allowedSource))throw Error('SOURCE_PROFILE_NOT_APPROVED_ISOLATED_FIXTURE');
 const database=path.join(source,'slash.sqlite'),localState=path.join(source,'Local State');
 const before={database:await hash(database),localState:await hash(localState)};
 let model,encrypted;
 const db=new DatabaseSync(database,{readOnly:true});
 try{
  // Select model fields only. Do not fetch source conversations, workspace or history.
  const row=db.prepare("SELECT json_extract(value,'$.models') AS models,json_extract(value,'$.defaultModelId') AS selected FROM kv WHERE key='state'").get();
  const models=JSON.parse(row?.models??'[]');model=models.find(value=>value.id===row?.selected);
  if(!model||model.provider!=='baishan'||model.modelId!=='DeepSeek-V4-Flash-0731')throw Error('EXPECTED_VERIFIED_MODEL_MISSING');
  encrypted=readKV(db,'model-secret:'+model.id);
  if(typeof encrypted!=='string'||!encrypted)throw Error('ENCRYPTED_CREDENTIAL_MISSING');
 }finally{db.close();}
 const permitted=['id','provider','name','baseUrl','modelId','protocol','hasKey','supportsVision','contextWindow','maxTokens'];
 model=Object.fromEntries(permitted.filter(key=>model[key]!==undefined).map(key=>[key,model[key]]));
 await fs.mkdir(testRoot,{recursive:true});
 const output=await fs.mkdtemp(path.join(testRoot,'pm-operations-real-'+new Date().toISOString().replaceAll(':','-')+'-'));
 const sources=path.join(output,'synthetic-sources');await fs.mkdir(sources);await fs.mkdir(path.join(output,'protocols'));
 await fs.writeFile(path.join(sources,'operations-brief.md'),operationsBrief,{flag:'wx'});
 await fs.writeFile(path.join(sources,'operations-data.json'),JSON.stringify(syntheticOperationsData,null,2)+'\n',{flag:'wx'});
 const cases={};
 for(const [label,protocol]of Object.entries(protocols)){
  const folder=path.join(output,'protocols',label),profile=path.join(folder,'profile'),workspace=path.join(folder,'workspace');
  for(const dir of [folder,profile,workspace,path.join(folder,'snapshots'),path.join(folder,'screenshots')])await fs.mkdir(dir);
  const config={...model,protocol,hasKey:true};
  const isolated=new DatabaseSync(path.join(profile,'slash.sqlite'));
  try{
   isolated.exec('CREATE TABLE kv(key TEXT PRIMARY KEY,value TEXT NOT NULL)');const insert=isolated.prepare('INSERT INTO kv VALUES(?,?)');
   insert.run('state',JSON.stringify({root:'',mounts:[],conversations:[],changes:[],runs:[],connections:[],models:[config],defaultModelId:config.id,model:{baseUrl:config.baseUrl,id:config.modelId,protocol,hasKey:true},permissions:{workspace_read:'allow',artifact_write:'allow',process_execute:'deny',web_read:'deny',connection_config:'deny',external_action:'deny'}}));
   insert.run('model-secret:'+config.id,JSON.stringify(encrypted));
  }finally{isolated.close();}
  await fs.copyFile(localState,path.join(profile,'Local State'),constants.COPYFILE_EXCL);
  cases[label]={folder,profile,workspace,model:modelView(config),snapshot:path.join(folder,'snapshots','final-html.html'),result:path.join(folder,'result.json')};
 }
 encrypted=undefined;
 const after={database:await hash(database),localState:await hash(localState)};
 if(before.database!==after.database||before.localState!==after.localState)throw Error('SOURCE_PROFILE_CHANGED_DURING_PREPARATION');
 const sourceFiles=await Promise.all(['operations-brief.md','operations-data.json'].map(async name=>({name,path:path.join(sources,name),sha256:await hash(path.join(sources,name))})));
 const manifest={schemaVersion:1,status:'prepared_no_cloud',createdAt:new Date().toISOString(),output,sources,sourceFiles,cases,htmlPath,runtime:await runtimeHashes(),version:JSON.parse(await fs.readFile(path.join(repo,'package.json'),'utf8')).version,sourceProfileReadOnly:true,sourceProfileHashes:{before,after},limits:{maxRealSendsPerProtocol:1,maxRunSeconds:observation.hostSeconds,maxToolCalls:observation.hostLimits.maxToolCalls,observationGraceSeconds:observation.graceSeconds},viewports:[{width:390,height:844,primary:true},{width:1440,height:900},{width:1280,height:800}],notice:'Two fresh, independent protocol profiles; no fallback, resend or resume. Synthetic sources only. The root operator chooses whether to run the second protocol. Credential stays encrypted; no history or plaintext credential copied. Completion requires independent browser/business review.'};
 await fs.writeFile(path.join(output,'manifest.json'),JSON.stringify(manifest,null,2),{flag:'wx'});
 console.log(JSON.stringify({status:manifest.status,testDir:output,manifest:path.join(output,'manifest.json'),cases:Object.fromEntries(Object.entries(cases).map(([key,value])=>[key,{profile:value.profile,model:value.model}])),cloudExecuted:false}));
}

async function loadCase(){
 const label=arg('--protocol');if(!Object.hasOwn(protocols,label??''))throw Error('EXPLICIT_PROTOCOL_REQUIRED');
 if(!arg('--test-dir'))throw Error('TEST_DIRECTORY_REQUIRED');
 const output=await fs.realpath(path.resolve(arg('--test-dir'))),base=await fs.realpath(testRoot);
 if(path.dirname(output)!==base||!path.basename(output).startsWith('pm-operations-real-'))throw Error('ISOLATION_DIRECTORY_INVALID');
 const m=JSON.parse(await fs.readFile(path.join(output,'manifest.json'),'utf8')),c=m.cases?.[label];
 if(m.output!==output||m.sources!==path.join(output,'synthetic-sources')||m.htmlPath!==htmlPath||c?.folder!==path.join(output,'protocols',label)||c.profile!==path.join(c.folder,'profile')||c.workspace!==path.join(c.folder,'workspace')||c.model.protocol!==protocols[label])throw Error('ISOLATION_MANIFEST_INVALID');
 for(const dir of [output,m.sources,c.folder,c.profile,c.workspace])await directFolder(dir);
 for(const file of m.sourceFiles){if(path.dirname(file.path)!==m.sources||await hash(file.path)!==file.sha256)throw Error('SYNTHETIC_SOURCE_CHANGED');}
 for(const [file,expected]of Object.entries(m.runtime))if(!runtimeFiles.includes(file)||await hash(path.join(repo,'dist',file))!==expected)throw Error('RUNTIME_CHANGED_REPREPARE');
 if(args.includes('--timeout-seconds')&&args.includes('--observe-seconds'))throw Error('DUPLICATE_OBSERVATION_BUDGET');
 const observation=await loadObservationPolicy(repo,arg('--observe-seconds')??arg('--timeout-seconds'));
 return{output,m,c,label,seconds:observation.observeSeconds,observation};
}

function summarizeRun(run,observations){return{
 id:run.id,conversationId:run.conversationId,status:run.status,phase:run.phase,mode:run.mode,permissionMode:run.permissionMode,startedAt:run.startedAt,finishedAt:run.finishedAt,generationStartedAt:run.generationStartedAt,generationFinishedAt:run.generationFinishedAt,generationDurationMs:run.generationDurationMs,elapsedMs:run.finishedAt?Date.parse(run.finishedAt)-Date.parse(run.startedAt):undefined,error:run.error?.slice(0,1200),interruptionReason:run.interruptionReason,modelStopReason:run.modelStopReason,contextRecovery:run.contextRecovery,reasoning:run.reasoning,route:run.modelRoute,
 tools:observations,
};}
function completeDraft(content){
 const checks={doctype:/<!doctype html>/i.test(content),htmlEnd:/<\/html>\s*$/i.test(content),hasScript:/<script\b[\s\S]*<\/script>/i.test(content),offlineMapLabel:content.includes('离线示意地图'),allStores:syntheticOperationsData.stores.every(store=>content.includes(store.name)),allReps:syntheticOperationsData.reps.every(rep=>content.includes(rep.name)),allTaskIds:syntheticOperationsData.tasks.every(task=>content.includes(task.id)),noFillMarkers:!/(?:<!--\s*(?:SLASH_SECTION_|TODO_|PLACEHOLDER_)|\b(?:CHUNK_[A-Z]+|REPLACE_ME)\b)/.test(content)};
 return{checks,passed:Object.values(checks).every(Boolean),notice:'Only a host completeness/scope check. This does not confirm DOM interactions, visual quality or business correctness.'};
}

async function execute(offline){
 if(!offline&&!args.includes('--allow-cloud'))throw Error('EXPLICIT_CLOUD_GATE_REQUIRED');
 const {output,m,c,label,observation}=await loadCase();
 // Refuse a second invocation before touching its prior result evidence.
 if(await fs.stat(path.join(c.folder,'run-once.lock')).then(()=>true,()=>false))throw Error(offline?'LOCAL_VERIFICATION_REQUIRES_FRESH_UNRUN_PROFILE':'PROTOCOL_REAL_RUN_ALREADY_ATTEMPTED');
 const activePath=path.join(output,'active-desktop.lock');
 const active=await fs.open(activePath,'wx').catch(()=>{throw Error('ANOTHER_PROTOCOL_DESKTOP_IS_ACTIVE');});await active.close();
 let app,page,runId,conversationId,outputMount,sourceMount,serviceGraceDeadline;
 const result={schemaVersion:1,status:'running',startedAt:new Date().toISOString(),protocolLabel:label,configuredProtocol:protocols[label],model:c.model,profile:c.profile,workspace:c.workspace,sourceChecks:[],runtime:m.runtime,hostRunLimits:observation.hostLimits,observationBudgetSeconds:observation.observeSeconds,serviceGraceSeconds:observation.graceSeconds,cloudExecuted:false,realSendCalls:0,pageErrors:[],drafts:[],toolObservations:[],businessReview:'not_run',visualReview:'not_run',viewports:m.viewports};
 const resultPath=path.join(c.folder,offline?'local-verification.json':'result.json');
 const save=()=>fs.writeFile(resultPath,JSON.stringify(result,null,2));
 const progress=stage=>fs.writeFile(path.join(c.folder,'progress.json'),JSON.stringify({stage,at:new Date().toISOString(),protocolLabel:label,runId,cloudExecuted:result.cloudExecuted,runStatus:result.run?.status,runPhase:result.run?.phase,writeDraftCalls:result.toolCounts?.write_draft??0,editDraftCalls:result.toolCounts?.edit_draft??0}));
 const parseRequest=input=>{const parsed=requestSchema.safeParse(input);if(!parsed.success){const error=Error('HARNESS_IPC_SCHEMA_INVALID');error.ipcType=input.type;error.validationIssues=parsed.error.issues.map(issue=>({code:issue.code,path:issue.path}));throw error;}return parsed.data;};
 const call=async input=>{const parsed=parseRequest(input),response=await page.evaluate(value=>window.pm.request(value),parsed);if(!response.ok){const error=Error(response.error??'IPC_FAILED');error.ipcType=parsed.type;throw error;}return response.data;};
 const state=()=>call({type:'state'});
 async function observe(s){
  const r=s.runs.find(item=>item.id===runId);if(!r)return;
  serviceGraceDeadline??=Date.parse(r.startedAt)+observation.totalObservationMs;
  const allOperations=await call({type:'operations',limit:200});if(!Array.isArray(allOperations))throw Error('OPERATIONS_RESPONSE_NOT_ARRAY');
  const operations=allOperations.filter(op=>op.runId===runId);
  const now=new Date().toISOString();
  for(const op of operations){let item=result.toolObservations.find(value=>value.id===op.id);if(!item){item={id:op.id,tool:op.tool,createdAt:op.createdAt,firstObservedAt:now};result.toolObservations.push(item);}item.state=op.state;item.lastObservedAt=now;if(['succeeded','failed','cancelled','outcome_unknown'].includes(op.state)&&!item.terminalStateObservedAt)item.terminalStateObservedAt=now;}
  result.toolObservations.sort((a,b)=>a.createdAt.localeCompare(b.createdAt));
  result.toolCounts=Object.fromEntries(['read_file','write_draft','read_draft','edit_draft'].map(name=>[name,result.toolObservations.filter(op=>op.tool===name).length]));
  result.segmentedGenerationObserved=Boolean(result.toolCounts.write_draft&&result.toolCounts.read_draft&&result.toolCounts.edit_draft);
  result.run=summarizeRun(r,result.toolObservations);await save();
 }
 async function captureDrafts(s,complete=false){
  const changes=s.changes.filter(item=>item.runId===runId);
  result.drafts=[];
  for(const draft of changes){
   const entry={id:draft.id,mountId:draft.mountId,path:draft.path,status:draft.status,sha256:sha(Buffer.from(draft.content,'utf8')),bytes:Buffer.byteLength(draft.content),purpose:complete?'candidate_final_draft':'unfinished_diagnostic_draft',appliedByHarness:false};
   if(draft.status==='pending'&&draft.mountId===outputMount?.id&&canonical(draft.path)===canonical(htmlPath)){
    const target=path.join(c.folder,'snapshots',complete?'candidate-final.html':'unfinished-'+draft.id+'.html');
    await fs.writeFile(target,draft.content,{flag:'wx'});entry.snapshot=target;
   }
   result.drafts.push(entry);
  }
  await save();return changes;
 }
 async function captureSession(){
  if(!conversationId||!result.run?.startedAt)return;
  const db=new DatabaseSync(path.join(c.profile,'slash.sqlite'),{readOnly:true});let sessionFile,context;
  try{sessionFile=readKV(db,'session:'+conversationId);context=readKV(db,'context-manifest:'+runId);}finally{db.close();}
  result.sourceReadEvidence=(context?.sourceRefs??[]).filter(item=>item.mountId===sourceMount?.id).map(item=>({name:item.path,contentHash:item.contentHash,readAt:item.readAt,locator:item.locator}));
  if(!sessionFile){result.sessionNotice='Native session unavailable';return;}
  const file=await fs.realpath(sessionFile);if(!within(c.profile,file)||(await fs.stat(file)).size>32*1024*1024)throw Error('SESSION_EVIDENCE_SCOPE_INVALID');
  result.sessionFile=file;result.assistantSpans=[];result.nativeToolResults=[];
  for(const line of (await fs.readFile(file,'utf8')).split(/\r?\n/).filter(Boolean)){
   const row=JSON.parse(line),message=row.type==='message'?row.message:undefined;
   if(!message||Date.parse(row.timestamp)<Date.parse(result.run.startedAt))continue;
   if(message.role==='assistant'){
    const started=Number(message.timestamp),ended=Date.parse(row.timestamp),usage={};
    const content=Array.isArray(message.content)?message.content:[];
    for(const key of ['input','output','cacheRead','cacheWrite','totalTokens'])if(Number.isFinite(message.usage?.[key]))usage[key]=message.usage[key];
    result.assistantSpans.push({persistedAt:row.timestamp,startedAt:Number.isFinite(started)?new Date(started).toISOString():undefined,spanMs:Number.isFinite(started)&&ended>=started?ended-started:undefined,api:message.api,provider:message.provider,model:message.model,stopReason:message.stopReason,usage,textChars:typeof message.content==='string'?message.content.length:content.filter(block=>block.type==='text').reduce((sum,block)=>sum+(block.text?.length??0),0),thinkingChars:content.filter(block=>block.type==='thinking').reduce((sum,block)=>sum+(block.thinking?.length??0),0),toolCalls:content.filter(block=>block.type==='toolCall').map(block=>({id:block.id,name:block.name,argumentChars:JSON.stringify(block.arguments??{}).length}))});
   }
   if(message.role==='toolResult')result.nativeToolResults.push({id:message.toolCallId,name:message.toolName,persistedAt:row.timestamp,timestamp:message.timestamp,isError:message.isError});
  }
  result.actualAssistantApis=[...new Set(result.assistantSpans.map(item=>item.api).filter(Boolean))];
  result.actualProtocolVerified=result.actualAssistantApis.length>0&&result.actualAssistantApis.every(api=>api===protocols[label]);
  result.sessionNotice='Only numeric usage, timing, counts, API identity and tool names copied; no assistant text, raw thinking, tool arguments or credentials in receipt.';
 }
 try{
  if(!offline){const marker=await fs.open(path.join(c.folder,'run-once.lock'),'wx').catch(()=>{throw Error('PROTOCOL_REAL_RUN_ALREADY_ATTEMPTED');});await marker.close();}
  else if(await fs.stat(path.join(c.folder,'run-once.lock')).then(()=>true,()=>false))throw Error('LOCAL_VERIFICATION_REQUIRES_FRESH_UNRUN_PROFILE');
  await save();await progress('starting_isolated_desktop');
  const env={...process.env,PM_SLASH_DATA_DIR:c.profile};delete env.ELECTRON_RUN_AS_NODE;delete env.VITE_DEV_SERVER_URL;
  app=await electron.launch({cwd:repo,args:['.'],env,timeout:60000});page=await app.firstWindow();page.setDefaultTimeout(20000);page.on('pageerror',()=>result.pageErrors.push('RENDERER_PAGE_ERROR'));
  if(await app.evaluate(({app})=>app.getPath('userData'))!==c.profile)throw Error('USER_DATA_ISOLATION_MISMATCH');
  await page.locator('.brand').waitFor();await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0]?.setSize(1440,900));
  let s=await state();const defaultRoot=path.join(c.profile,'默认项目');
  const empty=s.runs.length===0&&s.changes.length===0&&s.connections.length===0&&s.conversations.every(item=>!item.messages?.length);
  // A local verification can have initialized this same empty test workspace.
  if(!empty||![defaultRoot,c.workspace,''].includes(s.root)||s.mounts.some(mount=>!within(defaultRoot,mount.path)&&!within(c.workspace,mount.path)&&mount.path!==m.sources))throw Error('ISOLATION_SEED_NOT_EMPTY');
  const readyUntil=Date.now()+45000;let ready=false;
  while(Date.now()<readyUntil){try{await call({type:'workspace',path:c.workspace});ready=true;break;}catch(error){if(reason(error)!=='WORKSPACE_BUSY')throw error;await sleep(1000);}}
  if(!ready)throw Error('WORKSPACE_STARTUP_TIMEOUT');s=await state();
  sourceMount=s.mounts.find(mount=>mount.path===m.sources)??await call({type:'mount',path:m.sources,write:false});
  s=await state();sourceMount=s.mounts.find(mount=>mount.path===m.sources);outputMount=s.mounts.find(mount=>mount.name==='成果');
  const selected=s.models?.find(model=>model.id===s.defaultModelId);
  if(s.root!==c.workspace||sourceMount?.write!==false||!outputMount?.write||!within(c.workspace,outputMount.path)||!selected?.hasKey||s.models.length!==1||selected.id!==c.model.id||selected.modelId!==c.model.modelId||selected.protocol!==protocols[label]||s.permissions?.web_read!=='deny'||s.permissions?.process_execute!=='deny'||s.permissions?.external_action!=='deny')throw Error('ISOLATED_EXECUTION_CONFIG_INVALID');
  await directFolder(outputMount.path);
  result.liveConfiguredModel=modelView(selected);result.outputMount={id:outputMount.id,path:outputMount.path};result.sourceMount={id:sourceMount.id,path:sourceMount.path,write:false};
  const dummy='00000000-0000-4000-8000-000000000000';
  const schemaSamples=[{type:'state'},{type:'workspace',path:c.workspace},{type:'mount',path:m.sources,write:false},{type:'conversation',title},{type:'send',id:dummy,text:operationsPrompt({sourceMountId:sourceMount.id,outputMountId:outputMount.id,htmlPath}),mode:'build',permissionMode:'full_access',modelEntryId:selected.id,taskType:'coding'},{type:'operations',limit:200},{type:'pendingApprovals',conversationId:dummy},{type:'cancel',id:dummy},{type:'apply',id:dummy},{type:'versions',mountId:outputMount.id,path:htmlPath}];
  schemaSamples.forEach(parseRequest);result.ipcSchemaPreflight={passed:true,types:schemaSamples.map(input=>input.type),notice:'All request variants parsed locally; send/cancel/apply sample requests were not executed.'};
  const observedOperations=await call({type:'operations',limit:200}),observedApprovals=await call({type:'pendingApprovals'});
  if(!Array.isArray(observedOperations)||!Array.isArray(observedApprovals))throw Error('OFFLINE_IPC_RESPONSE_SHAPE_INVALID');
  result.offlineResponsePreflight={operationsIsArray:true,pendingApprovalsIsArray:true};
  const target=path.join(outputMount.path,...htmlPath.split('/'));
  if(await fs.stat(target).then(()=>true,()=>false))throw Error('TARGET_ALREADY_EXISTS');
  result.outputFile=target;await save();
  if(offline){result.status='verified_before_send';await progress(result.status);return;}
  conversationId=await call({type:'conversation',title});result.conversationId=conversationId;
  const prompt=operationsPrompt({sourceMountId:sourceMount.id,outputMountId:outputMount.id,htmlPath});
  await fs.writeFile(path.join(c.folder,'task-prompt.txt'),prompt,{flag:'wx'});
  await progress('sending_single_real_task');result.realSendCalls=1;result.cloudExecuted=true;await save();
  runId=await call({type:'send',id:conversationId,text:prompt,mode:'build',permissionMode:'full_access',modelEntryId:selected.id,taskType:'coding'});result.runId=runId;await save();
  let last=await state();await observe(last);if(!serviceGraceDeadline)throw Error('REAL_RUN_NOT_OBSERVABLE');
  while(Date.now()<serviceGraceDeadline){
   last=await state();await observe(last);const r=last.runs.find(item=>item.id===runId);if(terminal.has(r?.status))break;
   const approvals=await call({type:'pendingApprovals',conversationId});if(approvals.some(item=>item.runId===runId&&item.status==='pending'))throw Error('UNEXPECTED_REAL_APPROVAL');
   await progress('real_task_running');await sleep(Math.min(1500,Math.max(1,serviceGraceDeadline-Date.now())));
  }
  if(!terminal.has(last?.runs.find(item=>item.id===runId)?.status)){result.timeout=true;await call({type:'cancel',id:runId});throw Error('REAL_TASK_TIMEOUT');}
  await captureSession();
  const r=last.runs.find(item=>item.id===runId);
  if(r.status!=='succeeded'){await captureDrafts(last,false);throw Error('REAL_TASK_NOT_SUCCEEDED');}
  const changes=await captureDrafts(last,true),pending=changes.filter(item=>item.status==='pending');
  if(changes.length!==1||pending.length!==1||pending[0].mountId!==outputMount.id||canonical(pending[0].path)!==canonical(htmlPath))throw Error('FINAL_DRAFT_SCOPE_INVALID');
  result.sourceReadVerified=m.sourceFiles.every(file=>result.sourceReadEvidence.some(read=>canonical(read.name)===canonical(file.name)&&read.contentHash===file.sha256));
  if(!result.sourceReadVerified)throw Error('SYNTHETIC_BRIEF_DATA_NOT_ACTUALLY_READ');
  if(!result.actualProtocolVerified)throw Error('ACTUAL_ASSISTANT_PROTOCOL_MISMATCH');
  result.completeness=completeDraft(pending[0].content);if(!result.completeness.passed)throw Error('FINAL_DRAFT_INCOMPLETE');
  const draft=pending[0],draftHash=sha(Buffer.from(draft.content,'utf8'));await progress('applying_only_verified_final_html');await call({type:'apply',id:draft.id});
  const applied=await state();if(applied.changes.find(item=>item.id===draft.id)?.status!=='applied'||await hash(target)!==draftHash)throw Error('APPLIED_CONTENT_HASH_MISMATCH');
  result.drafts[0].appliedByHarness=true;result.drafts[0].status='applied';result.finalArtifact={path:target,snapshot:c.snapshot,sha256:draftHash,bytes:Buffer.byteLength(draft.content),changeId:draft.id,versions:await call({type:'versions',mountId:outputMount.id,path:htmlPath})};
  if(!result.finalArtifact.versions.length)throw Error('APPLIED_VERSION_MISSING');await fs.copyFile(target,c.snapshot,constants.COPYFILE_EXCL);
  const newRuns=applied.runs.filter(item=>item.conversationId===conversationId);if(newRuns.length!==1)throw Error('UNEXPECTED_ADDITIONAL_RUN');
  result.status='generated_applied_pending_independent_review';await save();await progress(result.status);
 }catch(error){
  result.status='failed';result.reason=reason(error);process.exitCode=1;
  result.diagnostic={errorType:error?.name??'Error',ipcType:error?.ipcType,validationIssues:error?.validationIssues,stackFrames:String(error?.stack??'').split('\n').filter(line=>/^\s*at\s/.test(line)).slice(0,8),notice:'Stack locations and schema issue codes/paths only; no error values, tool arguments or credentials.'};
  if(page&&!page.isClosed())await page.screenshot({path:path.join(c.folder,'screenshots',offline?'local-failure.png':'generation-failure.png')}).catch(()=>{});
 }finally{
  if(app){
   if(runId){let s;
    try{s=await state();await observe(s);}catch{}
    while(s&&!terminal.has(s.runs.find(item=>item.id===runId)?.status)&&Date.now()<serviceGraceDeadline){await sleep(1000);try{s=await state();await observe(s);}catch{break;}}
    if(s&&!terminal.has(s.runs.find(item=>item.id===runId)?.status)){result.cleanupCancelAfterServiceGrace=true;await call({type:'cancel',id:runId}).catch(()=>{});}
    if(s&&!result.drafts.length)await captureDrafts(s,false).catch(()=>{});
    await captureSession().catch(error=>{result.sessionNotice=reason(error);});
   }
   await app.close().catch(()=>{});
  }
  for(const file of m.sourceFiles)result.sourceChecks.push({name:file.name,expectedHash:file.sha256,actualHash:await hash(file.path).catch(()=>null)});
  if(result.sourceChecks.some(item=>item.expectedHash!==item.actualHash)){result.status='failed';result.reason='SYNTHETIC_SOURCE_CHANGED';process.exitCode=1;}
  result.finishedAt=new Date().toISOString();result.elapsedMs=Date.parse(result.finishedAt)-Date.parse(result.startedAt);await save();await progress(result.status);
  await fs.unlink(activePath);
  console.log(JSON.stringify({status:result.status,reason:result.reason,protocol:label,result:resultPath,cloudExecuted:result.cloudExecuted,realSendCalls:result.realSendCalls,runId,artifact:result.finalArtifact?.snapshot,businessReview:result.businessReview}));
 }
}

try{
 const flags=new Set(['--help','--prepare','--source-profile','--run','--allow-cloud','--verify-local','--protocol','--test-dir','--timeout-seconds','--observe-seconds']);
 for(let i=0;i<args.length;i++){if(!flags.has(args[i]))throw Error('UNKNOWN_ARGUMENT');if(['--source-profile','--protocol','--test-dir','--timeout-seconds','--observe-seconds'].includes(args[i])){if(!args[i+1]||args[i+1].startsWith('--'))throw Error('ARGUMENT_VALUE_REQUIRED');i++;}}
 if(args.includes('--help'))console.log('Offline preparation: node scripts/pm-operations-real-task.mjs --prepare --source-profile "<approved isolated profile>"\nOffline Electron/IPC preflight: add --verify-local --protocol responses --test-dir "<prepared dir>"\nOne explicitly authorized real task: --run --allow-cloud --protocol responses --test-dir "<prepared dir>" [--observe-seconds <compiled host budget>]\nSeparate optional comparison: choose completions explicitly. Compiled host budget plus 15s grace; no automatic fallback or repeat sends.');
 else if(args.includes('--prepare')&&!args.includes('--run')&&!args.includes('--verify-local')&&!args.includes('--allow-cloud'))await prepare();
 else if(args.includes('--verify-local')&&!args.includes('--prepare')&&!args.includes('--run')&&!args.includes('--allow-cloud'))await execute(true);
 else if(args.includes('--run')&&!args.includes('--prepare')&&!args.includes('--verify-local'))await execute(false);
 else throw Error('SELECT_PREPARE_VERIFY_OR_RUN');
}catch(error){console.error(JSON.stringify({status:'failed',reason:reason(error),cloudExecuted:false}));process.exitCode=1;}
