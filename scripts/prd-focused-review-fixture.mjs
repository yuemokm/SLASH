// One independent read-only review of the already corrected PRD. This fixture
// never sends a generation prompt, applies a ChangeSet, or writes user files.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {spawn} from 'node:child_process';
import {readFileSync,realpathSync} from 'node:fs';
import {createRequire} from 'node:module';
import {observeReviewFetch} from './prd-review-transport-diagnostics.mjs';
import {migrateFocusedPrdReviewInput} from './prd-review-input-identity.mjs';

const script=fileURLToPath(import.meta.url),root=path.resolve(path.dirname(script),'..');
const approved=path.join(root,'.test-data/prd-dimension-repair-proposal/case-PRD-DIMENSION');
const selection=path.join(approved,'review-selection-audit/final');
const args=process.argv.slice(2),hash=value=>createHash('sha256').update(value).digest('hex');
const credentialSources=[path.join(approved,'profile'),path.join(root,'.test-data/wangshu-astra-config-20261010/isolated-profile')];
function argument(name){const i=args.indexOf(name);if(i<0||!args[i+1])throw Error('EXPLICIT_MODEL_IDENTITY_REQUIRED');return args[i+1];}
const reviewTimeoutMs=240000,wrapperTimeoutMs=280000;
const observerFile=path.join(root,'scripts/prd-review-transport-diagnostics.mjs');
const identityFile=path.join(root,'scripts/prd-review-input-identity.mjs');
const json=file=>fs.readFile(file,'utf8').then(JSON.parse);
const write=(dir,name,value)=>fs.writeFile(path.join(dir,name),JSON.stringify(value,null,2)+'\n',{flag:'wx'});
const modulePath=(name,compiled)=>pathToFileURL(path.join(root,compiled?'dist':'',name+(compiled?'.js':'.ts'))).href;
const safeError=error=>String(error?.message??error).match(/^[A-Z][A-Z0-9_]+/)?.[0]??'FIXTURE_FAILED';
let childContext;
function modelIdentity(model){return Object.fromEntries(['id','provider','name','baseUrl','proxyUrl','modelId','protocol','supportsVision','contextWindow','maxTokens'].filter(k=>model[k]!==undefined).map(k=>[k,model[k]]));}
async function scopeDirectory(){
 const i=args.indexOf('--case-dir');if(i<0||!args[i+1])throw Error('CASE_DIRECTORY_REQUIRED');
 const dir=await fs.realpath(path.resolve(args[i+1]));
 if(path.dirname(dir)!==path.join(root,'.test-data')||!/^prd-focused-review-[0-9a-f-]{36}$/.test(path.basename(dir)))throw Error('CASE_SCOPE_INVALID');
 return dir;
}
async function assertInputCurrent(dir,manifest,input,build){
 assert.equal(hash(await fs.readFile(script)),manifest.fixtureHash,'FIXTURE_CHANGED');
 assert.equal(hash(await fs.readFile(observerFile)),manifest.observerHash,'OBSERVER_CHANGED');
 assert.equal(hash(await fs.readFile(identityFile)),manifest.identityHelperHash,'INPUT_IDENTITY_HELPER_CHANGED');
 for(const item of manifest.protectedFiles)assert.equal(hash(await fs.readFile(item.path)),item.sha256,'FROZEN_SOURCE_CHANGED');
 assert.equal(hash(await fs.readFile(path.join(dir,'input.json'))),manifest.inputFileHash,'FROZEN_INPUT_CHANGED');
 const current=build(input.snapshot,{promptCharacters:input.promptCharacterLimit});
 assert.equal(current.inputHash,manifest.inputHash,'CURRENT_INPUT_CHANGED');assert.equal(current.promptHash,manifest.promptHash,'CURRENT_PROMPT_CHANGED');
 return current;
}
async function prepare(){
 const {buildContentReviewInput}=await import(modulePath('main/content-review',false));
 const {REVIEW_PROTOCOL_PROMPT}=await import(modulePath('main/content-review-protocol',false));
 const {Store}=await import(modulePath('main/store',false));
 const {thinkingFingerprint}=await import(modulePath('main/model-thinking',false));
 const before=await json(path.join(selection,'candidate-input.json'));
 const {input,trace:protocolMigration}=migrateFocusedPrdReviewInput(before,buildContentReviewInput,REVIEW_PROTOCOL_PROMPT);
 // Root approved this exact protocol-only delta for the v2/v3 comparison.
 assert.equal(protocolMigration.protocolCharactersDelta,410,'APPROVED_PROTOCOL_DELTA_CHANGED');
 const critical=await json(path.join(selection,'critical-cell-coverage.json'));
 assert.equal(critical.length,14);
 for(const cell of critical){assert(input.sourceContexts[0].excerpts.some(e=>e.start<=cell.start&&e.end>=cell.end));assert.equal(input.snapshot.sources[0].text.slice(cell.start,cell.end),cell.text);}
 const pending=path.join(approved,'pending-1.md');assert.equal(hash(await fs.readFile(pending)),input.snapshot.artifacts[0].sha256);
 const sourceProfile=await fs.realpath(path.resolve(argument('--source-profile')));if(!credentialSources.includes(sourceProfile))throw Error('CREDENTIAL_SOURCE_NOT_APPROVED');
 const identity={entryId:argument('--entry-id'),provider:argument('--provider'),modelId:argument('--model-id'),protocol:argument('--protocol')};
 const sourceDb=new DatabaseSync(path.join(sourceProfile,'slash.sqlite'),{readOnly:true});
 let model,encrypted,capability;
 try{
  const state=JSON.parse(String(sourceDb.prepare("SELECT value FROM kv WHERE key='state'").get()?.value??'null'));
  model=state?.models?.find(m=>m.id===identity.entryId);
  if(!model||model.provider!==identity.provider||model.modelId!==identity.modelId||model.protocol!==identity.protocol||!model.hasKey)throw Error('APPROVED_MODEL_MISSING');
  encrypted=JSON.parse(String(sourceDb.prepare('SELECT value FROM kv WHERE key=?').get('model-secret:'+model.id)?.value??'null'));
  if(typeof encrypted!=='string'||!encrypted)throw Error('APPROVED_CREDENTIAL_MISSING');
  const fingerprint=thinkingFingerprint({entryId:model.id,baseUrl:model.baseUrl,id:model.modelId,protocol:model.protocol});
  const row=sourceDb.prepare('SELECT key,value FROM kv WHERE key=?').get('model-thinking:v1:'+fingerprint);
  if(row)capability={key:String(row.key),value:JSON.parse(String(row.value))};
 }finally{sourceDb.close();}
 const dir=path.join(root,'.test-data','prd-focused-review-'+randomUUID()),profile=path.join(dir,'profile');
 await fs.mkdir(profile,{recursive:true});
 await fs.copyFile(path.join(sourceProfile,'Local State'),path.join(profile,'Local State'));
 const store=new Store(profile);
 try{store.set('state',{models:[{...modelIdentity(model),hasKey:true}],defaultModelId:model.id});store.set('model-secret:'+model.id,encrypted);if(capability)store.set(capability.key,capability.value);}finally{store.close();encrypted=undefined;}
 await write(dir,'input.json',input);
 const files=[path.join(selection,'candidate-input.json'),path.join(selection,'critical-cell-coverage.json'),pending];
 const protectedFiles=await Promise.all(files.map(async file=>({path:file,sha256:hash(await fs.readFile(file))})));
 const manifest={version:3,protocolMigration,identityHelperHash:hash(await fs.readFile(identityFile)),preparedAt:new Date().toISOString(),fixtureHash:hash(await fs.readFile(script)),observerHash:hash(await fs.readFile(observerFile)),inputFileHash:hash(await fs.readFile(path.join(dir,'input.json'))),inputHash:input.inputHash,promptHash:input.promptHash,sourceProfile,profile,model:modelIdentity(model),protectedFiles,reviewTimeoutMs,wrapperTimeoutMs,observationBasis:'Historical real PRD content_review completed in 152.376s. Text review follows the Run budget; prior fixture 60s was not a product text-review limit. User authorized 240s text observation/280s wrapper; no product budget change.',outerReviewCalls:1,outerRetries:0,piConfiguredMaxRetries:1,scope:'existing corrected PRD and task-referenced table dimensions; no edits',humanConfirmed:false};
 await write(dir,'prepared.json',manifest);
 await assertInputCurrent(dir,manifest,input,buildContentReviewInput);
 const {buildContentReviewInput:compiledBuild}=await import(modulePath('main/content-review',true));
 await assertInputCurrent(dir,manifest,input,compiledBuild);
 await write(dir,'prepare-result.json',{status:'prepared',protocolMigration,cloudCalls:0,inputHash:input.inputHash,promptHash:input.promptHash,compiledInputIdentityMatches:true,sourceHashes:input.snapshot.sources.map(s=>({id:s.id,sha256:s.sha256})),artifactHashes:input.snapshot.artifacts.map(a=>({id:a.id,sha256:a.sha256})),criticalCellsCovered:14,promptCharacters:input.prompt.length,promptCharacterLimit:input.promptCharacterLimit,includedSourceCharacters:input.sourceContexts[0].includedCharacters,sourceCharacters:input.sourceContexts[0].totalCharacters,modelId:model.modelId,encryptedCredentialCopied:true,userHistoryCopied:false,plaintextCredentialPersisted:false,profile});
 console.log(JSON.stringify({status:'prepared',caseDir:dir,cloudCalls:0,criticalCellsCovered:14,inputHash:input.inputHash}));
}
async function cloudChild(dir,preflight=false){
 const started=performance.now(),stages=[];
 childContext={dir,preflight,stage:'child_entered'};
 const stage=async name=>{childContext.stage=name;stages.push({name,elapsedMs:Math.round(performance.now()-started)});await fs.writeFile(path.join(dir,preflight?'preflight-stages.json':'cloud-stages.json'),JSON.stringify({stages,currentStage:name},null,2));};
 await stage('child_entered');
 await fs.writeFile(path.join(dir,preflight?'preflight-child-once.lock':'child-once.lock'),new Date().toISOString(),{flag:'wx'});
 await stage('electron_import');
 const {default:electron}=await import('electron');const {app,safeStorage}=electron;
 await stage('manifest_read');
 const manifest=await json(path.join(dir,'prepared.json'));if(manifest.profile!==path.join(dir,'profile')||!credentialSources.includes(manifest.sourceProfile))throw Error('PROFILE_SCOPE_INVALID');
 await stage('electron_ready');
 assert.equal(app.getPath('userData'),manifest.profile,'EARLY_PROFILE_SETUP_REQUIRED');await app.whenReady();
 await stage('store_import');
 const {Store}=await import(modulePath('main/store',true));
 await stage('files_import');
 const {Files}=await import(modulePath('main/files',true));
 await stage('agent_import');
 const {createRuntime}=await import(modulePath('main/agent',true));
 await stage('content_review_import');
 const {buildContentReviewInput,reviewContent,verifyContentReviewReceipt}=await import(modulePath('main/content-review',true));
 const {contentReviewReceiptSchema}=await import(modulePath('shared/content-review',true));
 const {ModelThinkingResolver}=await import(modulePath('main/model-thinking',true));
 const {ModelSettings}=await import(modulePath('main/settings',true));
 const {runtimeRequestDiagnostics}=await import(modulePath('main/runtime-request-diagnostics',true));
 const {contentReviewBudgetDiagnostics}=await import(modulePath('main/content-review-budget',true));
 await stage('input_identity_check');
 const input=await json(path.join(dir,'input.json'));await assertInputCurrent(dir,manifest,input,buildContentReviewInput);
 const store=new Store(manifest.profile),state=store.get('state',{});let runtime,key,reviewCalls=0,timer,transport,transportWrites=Promise.resolve(),lastTransportSave=0,lastTransportPhase;
 const result={status:'unverified',preflightOnly:preflight,outerReviewCalls:0,outerRetries:0,piConfiguredMaxRetries:1,actualProviderRetries:'unknown',reviewTimeoutMs,humanConfirmed:false};
 try{
  await stage('credential_check');
  const selected=state.models?.[0];assert.deepEqual(modelIdentity(selected),manifest.model);
  const settings=new ModelSettings(store,safeStorage,{get:()=>state,save:()=>store.set('state',state)});
  if(!safeStorage.isEncryptionAvailable())throw Error('CREDENTIAL_ENCRYPTION_UNAVAILABLE');
  try{key=settings.credential(selected.id);}catch{throw Error('CREDENTIAL_DECRYPT_FAILED');}if(!key)throw Error('APPROVED_CREDENTIAL_UNAVAILABLE');
  const configured={entryId:selected.id,baseUrl:selected.baseUrl,proxyUrl:selected.proxyUrl,id:selected.modelId,protocol:selected.protocol,contextWindow:selected.contextWindow,maxTokens:selected.maxTokens};
  await stage('local_capability_resolution');
  const resolution=await new ModelThinkingResolver(async()=>{throw Error('METADATA_NETWORK_DENIED');},store).resolve(configured,{refresh:false});
  const controller=new AbortController();
  const runtimeDir=path.join(manifest.profile,preflight?'runtime-preflight':'runtime');
  await fs.mkdir(runtimeDir,{recursive:true});
  if(preflight)globalThis.fetch=async()=>{throw Error('PREFLIGHT_NETWORK_DENIED');};
  else{
   const fetcher=selected.proxyUrl?(await import(modulePath('main/model-proxy',true))).modelProxyFetch(selected.proxyUrl):globalThis.fetch;
   transport=observeReviewFetch(fetcher,{projectPayload:runtimeRequestDiagnostics,onUpdate:summary=>{
    const now=performance.now(),phase=summary.attempts.at(-1)?.phase;if(now-lastTransportSave<1000&&phase===lastTransportPhase)return;
    lastTransportSave=now;lastTransportPhase=phase;const safe=JSON.stringify(summary,null,2);transportWrites=transportWrites.then(()=>fs.writeFile(path.join(dir,'network-diagnostics.json'),safe)).catch(()=>{});
   }});if(!selected.proxyUrl)globalThis.fetch=transport.fetch;
  }
  await stage('runtime_create');
  runtime=await createRuntime({dir:runtimeDir,workspaceRoot:dir,model:{...configured,contextWindow:resolution.capability.limits.contextWindow,maxTokens:resolution.capability.limits.maxTokens,thinkingRuntime:resolution.runtime},thinkingLevel:'off',key,files:new Files(()=>[]),mounts:[],connections:[],runId:path.basename(dir),mode:'plan',signal:controller.signal,listConnections:()=>[],delta:()=>{},log:async(_name,_input,execute)=>execute(),draft:()=>{throw Error('READ_ONLY_DRAFT_DENIED');},redact:value=>String(value).replaceAll(key,'[REDACTED]')});
  if(selected.proxyUrl&&!preflight){
   const {openAICompatibleProviderConfig,OPENAI_COMPATIBLE_RUNTIME_PROVIDER}=await import(modulePath('main/model-runtime',true));
   if(selected.protocol!=='openai-responses')throw Error('PROXY_OBSERVER_PROTOCOL_NOT_VERIFIED');
   const {openAIResponsesApi}=await import('@earendil-works/pi-ai/api/openai-responses.lazy');
   const config=openAICompatibleProviderConfig({...configured,contextWindow:resolution.capability.limits.contextWindow,maxTokens:resolution.capability.limits.maxTokens,thinkingRuntime:resolution.runtime});
   runtime.modelRuntime.registerProvider(OPENAI_COMPATIBLE_RUNTIME_PROVIDER,{...config,streamSimple:(model,context,options)=>openAIResponsesApi().streamSimple(model,context,{...options,fetch:transport.fetch})});
  }
  await stage('runtime_ready');
  result.inputBudget={contextWindow:runtime.model.contextWindow,configuredOutputTokens:runtime.model.maxTokens,promptCharacters:input.prompt.length,promptUtf8Bytes:Buffer.byteLength(input.prompt),...contentReviewBudgetDiagnostics(runtime.model,{messages:[{role:'user',content:input.prompt,timestamp:Date.now()}]},runtime.model.maxTokens)};
  if(preflight){Object.assign(result,{status:'passed',elapsedMs:Math.round(performance.now()-started),credentialAvailable:true,inputIdentityVerified:true,cloudModelCalls:0,reviewMethodAvailable:typeof runtime.reviewContent==='function'});return;}
  result.compiledRuntimeHashes=await Promise.all(['main/agent','main/content-review','main/model-runtime'].map(async name=>({file:'dist/'+name+'.js',sha256:hash(await fs.readFile(path.join(root,'dist',name+'.js')))})));
  const reviewStarted=performance.now();timer=setTimeout(()=>controller.abort(),reviewTimeoutMs);
  const receipt=await reviewContent({input,reviewer:{provider:selected.provider,modelId:selected.modelId,protocol:selected.protocol,configurationId:selected.id},signal:controller.signal,assertCurrent:()=>assertInputCurrent(dir,manifest,input,buildContentReviewInput),review:async(prompt,signal)=>{
   if(++reviewCalls!==1)throw Error('SECOND_REVIEW_DENIED');
   await write(dir,'review-started.json',{at:new Date().toISOString(),inputHash:input.inputHash,promptHash:input.promptHash,modelId:selected.modelId,reviewTimeoutMs,outerReviewCalls:1,inputBudget:result.inputBudget});
   const response=await runtime.reviewContent(prompt,signal);
   return{raw:response.text,usage:response.usage,durationMs:response.durationMs,stopReason:response.stopReason,error:response.error,configuredMaxRetries:response.configuredMaxRetries,requestedOutputTokens:response.requestedOutputTokens,thinkingLevel:response.thinkingLevel,budgetNotice:response.budgetNotice,responseDiagnostics:response.responseDiagnostics};
  }});
  clearTimeout(timer);contentReviewReceiptSchema.parse(receipt);assert(verifyContentReviewReceipt(receipt));
  await write(dir,'content-review.json',receipt);
  Object.assign(result,{status:receipt.status,completion:receipt.completion,validReceipt:true,outerReviewCalls:reviewCalls,elapsedMs:Math.round(performance.now()-reviewStarted),stopReason:receipt.stopReason,findings:receipt.findings.length,invalidFindings:receipt.invalidFindings.length,usage:receipt.usage,responseDiagnostics:receipt.responseDiagnostics,inputHash:receipt.inputHash,promptHash:receipt.promptHash,scope:'PRD cross-table dimensions only; zero findings never implies full business approval'});
 }catch(error){result.errorCode=safeError(error);result.failedStage=childContext.stage;result.errorName=error?.name;result.outerReviewCalls=reviewCalls;result.status='failed';}
 finally{clearTimeout(timer);await stage('cleanup');if(runtime){await runtime.abort();runtime.dispose();}if(transport){await transportWrites;result.networkDiagnostics=transport.snapshot();await fs.writeFile(path.join(dir,'network-diagnostics.json'),JSON.stringify(result.networkDiagnostics,null,2));}key=undefined;store.close();await(await import(modulePath('main/model-proxy',true))).closeModelProxyTransports();await write(dir,preflight?'preflight-result.json':'result.json',result);app.exit(result.status==='failed'?1:0);}
}
async function runCloud(preflight=false){
 const dir=await scopeDirectory();await fs.writeFile(path.join(dir,preflight?'preflight-once.lock':'cloud-once.lock'),new Date().toISOString(),{flag:'wx'});
 const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;delete env.NODE_OPTIONS;
 const child=spawn(path.join(root,'node_modules/electron/dist/electron.exe'),[script,preflight?'--electron-preflight':'--electron-child','--case-dir',dir],{cwd:root,env,windowsHide:true,stdio:['ignore','pipe','pipe']});
 const outputCounts={stdoutBytes:0,stderrBytes:0};child.stdout.on('data',c=>outputCounts.stdoutBytes+=c.length);child.stderr.on('data',c=>outputCounts.stderrBytes+=c.length);
 const timer=setTimeout(()=>{if(child.exitCode===null){const killer=spawn('taskkill',['/pid',String(child.pid),'/t','/f'],{windowsHide:true,stdio:'ignore'});killer.on('error',()=>{});}},wrapperTimeoutMs);
 const exit=await new Promise(resolve=>{child.once('error',()=>resolve(1));child.once('exit',code=>resolve(code));});clearTimeout(timer);
 let result;try{result=await json(path.join(dir,preflight?'preflight-result.json':'result.json'));}catch{const progress=await json(path.join(dir,preflight?'preflight-stages.json':'cloud-stages.json')).catch(()=>({}));result={status:'failed',errorCode:'CHILD_WITHOUT_RECEIPT',lastStage:progress.currentStage,outerRetries:0,outputCounts};await write(dir,preflight?'preflight-wrapper-failure.json':'wrapper-failure.json',result);}
 console.log(JSON.stringify({caseDir:dir,status:result.status,completion:result.completion,outerReviewCalls:result.outerReviewCalls,exitCode:exit}));process.exitCode=exit??1;
}
async function main(){
 if(args.includes('--prepare-only'))await prepare();
 else if(args.includes('--preflight-only'))await runCloud(true);
 else if(args.includes('--run-cloud'))await runCloud();
 else if(args.includes('--electron-preflight'))await cloudChild(await scopeDirectory(),true);
 else if(args.includes('--electron-child')){const dir=await scopeDirectory();if(!await fs.stat(path.join(dir,'cloud-once.lock')).catch(()=>false))throw Error('CLOUD_LOCK_MISSING');await cloudChild(dir);}
 else throw Error('USE_PREPARE_ONLY_OR_RUN_CLOUD');
}
async function reportError(error){const failure={status:'failed',errorCode:safeError(error),errorName:error?.name,failedStage:childContext?.stage,outerReviewCalls:0};if(childContext)await write(childContext.dir,childContext.preflight?'preflight-result.json':'result.json',failure).catch(()=>{});console.error(JSON.stringify(failure));process.exitCode=1;if(process.versions.electron){const {default:electron}=await import('electron');electron.app.exit(1);}}
// Electron waits for the ESM entry to finish loading before emitting ready.
// Awaiting the full child here would wait for ready while keeping that entry
// unfinished. Schedule its work and let the Electron entry resolve first.
if(process.versions.electron){
 try{
  // safeStorage loads its OS key during Electron initialization. Set the
  // copied profile synchronously before letting the ESM entry finish; doing
  // this later in the async child can initialize it from the default profile.
  const i=args.indexOf('--case-dir');if(i<0||!args[i+1])throw Error('CASE_DIRECTORY_REQUIRED');
  const dir=realpathSync(path.resolve(args[i+1]));
  if(path.dirname(dir)!==path.join(root,'.test-data')||!/^prd-focused-review-[0-9a-f-]{36}$/.test(path.basename(dir)))throw Error('CASE_SCOPE_INVALID');
  const manifest=JSON.parse(readFileSync(path.join(dir,'prepared.json'),'utf8'));
  if(manifest.profile!==path.join(dir,'profile')||!credentialSources.includes(manifest.sourceProfile))throw Error('PROFILE_SCOPE_INVALID');
  const {app}=createRequire(import.meta.url)('electron');app.setName('slash');app.setPath('userData',manifest.profile);
  void main().catch(reportError);
 }catch(error){void reportError(error);}
}
else await main().catch(reportError);
