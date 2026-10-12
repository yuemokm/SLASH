// Independent candidate trial after the original baseline crossed a build.
// The original runner/manifest/receipt remain untouched; no baseline retry.
// Oracle/rubric files are never parsed by the cloud child or sent to the model.
import fs from 'node:fs/promises';
import {readFileSync,realpathSync} from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import {spawn} from 'node:child_process';
import {observeReviewFetch} from './prd-review-transport-diagnostics.mjs';

const script=fileURLToPath(import.meta.url),root=path.resolve(path.dirname(script),'..'),args=process.argv.slice(2);
const fixtureId='PRD-DIMENSION-HARNESS-20261012',prefix='harness-prd-semantic-';
const historical=path.join(root,'.test-data/prd-dimension-repair-proposal/case-PRD-DIMENSION');
const sourceProfile=path.join(root,'.test-data/wangshu-astra-config-20261010/isolated-profile');
const modelId='cbfc4c25-c0f2-460e-99fa-4cd62e7a0553',timeoutMs=240000;
const hash=value=>createHash('sha256').update(value).digest('hex'),json=file=>fs.readFile(file,'utf8').then(JSON.parse);
const write=(file,value)=>fs.writeFile(file,JSON.stringify(value,null,2)+'\n',{flag:'wx'});
const compiledRoot=()=>args.includes('--case-dir')?path.join(caseDirectory(),'runtime'):path.join(root,'dist');
const moduleUrl=(name,compiled=true)=>pathToFileURL(path.join(compiled?compiledRoot():root,name+(compiled?'.js':'.ts'))).href;
const route=()=>{const index=args.indexOf('--route'),value=args[index+1];if(index<0||value!=='candidate')throw Error('CANDIDATE_ROUTE_REQUIRED');return value;};
const safeError=error=>String(error?.message??error).match(/^[A-Z][A-Z0-9_]+/)?.[0]??'HARNESS_FIXTURE_FAILED';
function caseDirectory(){const index=args.indexOf('--case-dir');if(index<0)throw Error('CASE_DIRECTORY_REQUIRED');const dir=realpathSync(path.resolve(args[index+1]));if(path.dirname(dir)!==path.join(root,'.test-data')||!new RegExp('^'+prefix+'[0-9a-f-]{36}$').test(path.basename(dir)))throw Error('CASE_SCOPE_INVALID');return dir;}
const fileIdentity=async file=>({path:file,sha256:hash(await fs.readFile(file))});
async function runtimeFiles(folder,extensions=['.js']){const files=[];for(const entry of await fs.readdir(folder,{withFileTypes:true})){const file=path.join(folder,entry.name);if(entry.isDirectory())files.push(...await runtimeFiles(file,extensions));else if(extensions.some(extension=>entry.name.endsWith(extension)))files.push(file);}return files.sort();}
async function verify(manifest){for(const file of manifest.protectedFiles)assert.equal(hash(await fs.readFile(file.path)),file.sha256,'PROTECTED_FILE_CHANGED');for(const file of manifest.runtimeFiles??[])assert.equal(hash(await fs.readFile(file.path)),file.sha256,'RUNTIME_BUILD_CHANGED');assert.equal(hash(await fs.readFile(script)),manifest.runnerHash,'RUNNER_CHANGED');}

async function prepare(){
 const {Store}=await import(moduleUrl('main/store'));
 const inputFile=path.join(historical,'review-selection-audit/final/candidate-input.json'),pending=path.join(historical,'pending-1.md'),criticalFile=path.join(historical,'review-selection-audit/final/critical-cell-coverage.json');
 const old=await json(inputFile),artifact=old.snapshot.artifacts[0],source=old.snapshot.sources[0];
 assert.equal(artifact.sha256,'83e3e9c085cb3fd80a1332744635ad458e78c9393eec89a2a6cb9d9288b39f36');assert.equal(hash(await fs.readFile(pending)),artifact.sha256);assert.equal(hash(artifact.text),artifact.sha256);
 assert.equal(source.sha256,'9e4c1f54b6925220edbe551cd560d57f663b9661092a30067573ea7a7af0820c');assert.equal(hash(source.text),source.sha256);assert.equal(old.snapshot.requests.length,1);
 const dir=path.join(root,'.test-data',prefix+randomUUID());await fs.mkdir(dir);
 await fs.cp(path.join(root,'dist'),path.join(dir,'runtime'),{recursive:true,errorOnExist:true,force:false});
 await fs.mkdir(path.join(dir,'frozen'));await fs.mkdir(path.join(dir,'readonly-sources'));
 await fs.writeFile(path.join(dir,'frozen','PRD.md'),artifact.text,{flag:'wx'});await fs.writeFile(path.join(dir,'readonly-sources','字段表原文.txt'),source.text,{flag:'wx'});
 await write(path.join(dir,'request.json'),old.snapshot.requests[0]);await write(path.join(dir,'critical-cells.json'),await json(criticalFile));
 // Only preparation/independent judging reads these answers. No cloud prompt does.
 const judgementFile=path.join(root,'.test-data/prd-focused-review-8c7c868a-3bc6-4243-bc7a-de8cf944cb57/independent-business-judgement.json');
 const judgement=await json(judgementFile);assert.equal(judgement.beforeSha256,artifact.sha256);
 const sectionStart=source.text.indexOf('工作表: "03 机会门店主数据"'),sectionEnd=source.text.indexOf('工作表:',sectionStart+1);assert(sectionStart>=0&&sectionEnd>sectionStart);
 const quoteRef=(text,quote,start=0,end=text.length)=>{const at=text.indexOf(quote,start);assert(at>=start&&at+quote.length<=end);return{quote,start:at,end:at+quote.length,startLine:text.slice(0,at).split('\n').length};};
 const sourceQuotes=['合并区域: K5:K7','D1: "文本: 字段名称"','K1: "文本: 字段规则"','D5: "文本: 经度"','D6: "文本: 纬度"','N1: "文本: 前端是否展示"','O1: "文本: 新增页面展示"','P1: "文本: 是否允许前端发起变更修改"','D2: "文本: 网点编码"','N2: "文本: 是"','O2: "文本: 是"','P2: "文本: 否"'];
 const artifactQuotes=[judgement.changedLines[0].before,artifact.text.split('\n').find(line=>line.startsWith('| 网点编码 |'))];assert(artifactQuotes.every(Boolean));
 const rubric={fixtureId,frozenAt:new Date().toISOString(),humanConfirmed:false,artifactHash:artifact.sha256,sourceHash:source.sha256,originalRequest:old.snapshot.requests[0],expectedDefects:judgement.findings,expectedChangedDescription:judgement.changedLines[0],independentEvidence:{sheet:'03 机会门店主数据',sectionStart,sectionEnd,source:sourceQuotes.map(quote=>quoteRef(source.text,quote,sectionStart,sectionEnd)),artifact:artifactQuotes.map(quote=>quoteRef(artifact.text,quote))},negativeChecks:['No 01/02 same-name field rule may override the 03 business object.','F source/initial adjustment and P later frontend change must remain independent.','Out-of-scope code display issue must be record-only, not directly repaired.','Other draft values, original artifacts and sources must remain unchanged.'],classification:['detected_correctly','false_negative','unsupported_or_false_positive','scope_violation','unverified'],scoring:'Independent quotation/coordinate/meaning/scope judgement after both routes; not keyword matching or protocol-only pass.'};
 await write(path.join(dir,'independent-rubric.json'),rubric);
 const db=new DatabaseSync(path.join(sourceProfile,'slash.sqlite'),{readOnly:true});let selected,encrypted,capabilityEntries;
 try{const state=JSON.parse(db.prepare("SELECT value FROM kv WHERE key='state'").get().value);selected=state.models.find(m=>m.id===modelId);assert(selected&&selected.provider==='wangshu'&&selected.modelId==='gpt-6-astra'&&selected.protocol==='openai-responses');encrypted=JSON.parse(db.prepare('SELECT value FROM kv WHERE key=?').get('model-secret:'+modelId).value);assert(typeof encrypted==='string'&&encrypted);capabilityEntries=db.prepare("SELECT key,value FROM kv WHERE key LIKE 'model-thinking:v1:%'").all();}finally{db.close();}
 for(const lane of ['candidate'])for(const profileName of ['profile','profile-preflight']){const profile=path.join(dir,lane,profileName);await fs.mkdir(profile,{recursive:true});await fs.copyFile(path.join(sourceProfile,'Local State'),path.join(profile,'Local State'));const store=new Store(profile);try{store.set('state',{root:'',mounts:[],conversations:[],changes:[],runs:[],connections:[],models:[selected],defaultModelId:selected.id,model:{baseUrl:selected.baseUrl,id:selected.modelId,protocol:selected.protocol,hasKey:true}});store.set('model-secret:'+selected.id,encrypted);for(const row of capabilityEntries)store.set(row.key,JSON.parse(row.value));}finally{store.close();}}
 encrypted=undefined;
 const files=[inputFile,pending,criticalFile,judgementFile,path.join(dir,'frozen','PRD.md'),path.join(dir,'readonly-sources','字段表原文.txt'),path.join(dir,'request.json'),path.join(dir,'critical-cells.json'),path.join(dir,'independent-rubric.json')];
 const upstreamRoot=path.dirname(createRequire(import.meta.url).resolve('pi-goal-x/package.json'));
 const compiledFiles=[...await runtimeFiles(path.join(dir,'runtime/main')),...await runtimeFiles(path.join(dir,'runtime/shared')),...await runtimeFiles(upstreamRoot,['.ts','.js','.json']),path.join(root,'package-lock.json')];
 const priorBaselineCase=path.join(root,'.test-data/harness-prd-semantic-9f66b39e-8ba0-4e35-90ad-4e158f09316f');
 const manifest={fixtureId,preparedAt:new Date().toISOString(),runnerHash:hash(await fs.readFile(script)),runtimeFiles:await Promise.all(compiledFiles.map(fileIdentity)),compiledRuntime:path.join(dir,'runtime'),priorBaselineCase,comparison:'Independent candidate capability trial; prior baseline crossed a build, not a controlled A/B',model:selected,sourceProfile,artifactHash:artifact.sha256,sourceHash:source.sha256,originalRequestHash:hash(old.snapshot.requests[0].text),timeoutMs,outerReviewsPerRoute:1,outerRetries:0,candidateToolLimit:12,parentGenerationCalls:0,profilesCopied:'Only selected encrypted model and capability records/Local State; no user history',scope:'Historical complex PRD dimension review; not the prototype QE12 benchmark',protectedFiles:await Promise.all(files.map(fileIdentity))};
 await write(path.join(dir,'manifest.json'),manifest);await verify(manifest);console.log(JSON.stringify({status:'prepared',fixtureId,caseDir:dir,cloudCalls:0,artifactHash:artifact.sha256,sourceHash:source.sha256,requestHash:manifest.originalRequestHash}));
}

async function cloudChild(dir,lane,preflight=false){
 const {app,safeStorage}=createRequire(import.meta.url)('electron');await app.whenReady();
 const manifest=await json(path.join(dir,'manifest.json'));await verify(manifest);
 const folder=path.join(dir,lane),profile=path.join(folder,preflight?'profile-preflight':'profile');
 assert.equal(app.getPath('userData'),profile);
 const {Store}=await import(moduleUrl('main/store')),{Service}=await import(moduleUrl('main/service')),{createRuntime}=await import(moduleUrl('main/agent')),{ModelSettings}=await import(moduleUrl('main/settings'));
 const {runtimeRequestDiagnostics}=await import(moduleUrl('main/runtime-request-diagnostics'));
 const store=new Store(profile),state=store.get('state',{});assert.deepEqual(state.models[0],manifest.model);
 const settings=new ModelSettings(store,safeStorage,{get:()=>state,save:()=>store.set('state',state)});
 let key=settings.credential(modelId);if(!key)throw Error('CREDENTIAL_UNAVAILABLE');
 const frozen=await fs.readFile(path.join(dir,'frozen','PRD.md'),'utf8'),request=await json(path.join(dir,'request.json')),source=await fs.readFile(path.join(dir,'readonly-sources','字段表原文.txt'),'utf8');
 let release;const hold=new Promise(resolve=>{release=resolve;});let readyResolve,readyReject;const ready=new Promise((resolve,reject)=>{readyResolve=resolve;readyReject=reject;});
 let service,runtime,runtimeOptions,runId,timer,transport,providerRequests=0,reviewInvocations=0;
 const result={fixtureId,lane,status:'unverified',humanConfirmed:false,parentGenerationCalls:0,outerRetries:0};
 try{
  const factory=async options=>{
   runtimeOptions=options;runtime=await createRuntime(options);
   const originalPrompt=runtime.prompt.bind(runtime);
   // Historical artifact import is offline fixture setup, not a simulated review.
   // All review methods and original Service tool/gateway closures remain intact.
   runtime.prompt=async()=>{try{const read=await options.files.read(sourceMount.id,'字段表原文.txt');assert.equal(hash(read),manifest.sourceHash);await options.sourceRead({mountId:sourceMount.id,path:'字段表原文.txt',versionId:'read:'+hash(read),contentHash:hash(read),readAt:new Date().toISOString(),characters:read.length,includedCharacters:read.length,truncated:false,locator:'historical frozen source imported by fixture'});const draft=await options.files.draft(outputMount.id,'QE12/PRD.md',frozen,options.runId);options.draft(draft);readyResolve();await hold;}catch(error){readyReject(error);throw error;}finally{runtime.prompt=originalPrompt;}};
   return runtime;
  };
  service=new Service(store,()=>key,()=>{},factory,{fetchModelMetadata:async()=>{throw Error('METADATA_NETWORK_DENIED');}},()=>key);
  await service.workspace(path.join(folder,preflight?'workspace-preflight':'workspace'));service.setPermission('workspace_read','allow');service.setPermission('artifact_write','allow');for(const name of ['process_execute','external_action','web_read','connection_config'])service.setPermission(name,'deny');
  const sourceMount=await service.mount(path.join(dir,'readonly-sources'),false),outputMount=service.state.mounts.find(m=>m.name==='成果');
  const mappedRequest=request.text+'\n\n本次隔离审查的fixtureId='+fixtureId+'，保留历史稿路径QE12/PRD.md。历史请求中的mountId只作历史定位；当前工具读取来源使用mountId='+sourceMount.id+'、path=字段表原文.txt，成果使用mountId='+outputMount.id+'、path=QE12/PRD.md。原始请求的业务范围保持。';
  runId=await service.send(service.conversation(),mappedRequest,'build','standard',modelId,undefined,undefined,'writing');await ready;
  assert(service.runIsActive(runId));assert.equal(runtimeOptions.model.id,manifest.model.modelId);
  const input=await service.taskContentReviewInput(runId);assert.equal(input.snapshot.artifacts[0].sha256,manifest.artifactHash);assert.equal(input.snapshot.sources[0].sha256,manifest.sourceHash);
  for(const cell of await json(path.join(dir,'critical-cells.json')))assert(input.sourceContexts[0].excerpts.some(e=>e.start<=cell.start&&e.end>=cell.end),'CRITICAL_CELL_NOT_PROVIDED');
  await write(path.join(folder,preflight?'preflight-input.json':'input.json'),input);
  const assertCurrent=async()=>{await verify(manifest);if(!service.runIsActive(runId))throw Error('PARENT_INACTIVE');const current=await service.taskContentReviewInput(runId);assert.equal(current.inputHash,input.inputHash);assert.equal(current.promptHash,input.promptHash);};
  Object.assign(result,{runId,inputHash:input.inputHash,promptHash:input.promptHash,originalRequestHash:manifest.originalRequestHash,contractRequestHash:hash(input.snapshot.requests[0].text),promptCharacters:input.prompt.length,promptCharacterLimit:input.promptCharacterLimit,sourceIncludedCharacters:input.sourceContexts[0].includedCharacters,sourceTotalCharacters:source.length,criticalCellsCovered:14,productionMethods:['Service.send','Service.taskContentReviewInput','createRuntime'],comparison:manifest.comparison,runtimeHashes:await Promise.all(['main/agent','main/service','main/content-review',...(lane==='candidate'?['main/pi-goal-auditor']:[])].map(name=>fileIdentity(path.join(compiledRoot(),name+'.js'))))});
  if(preflight){Object.assign(result,{status:'preflight_passed',cloudCalls:0,credentialAvailable:true,baselineAvailable:typeof runtime.reviewContent==='function',candidateAvailable:typeof runtime.reviewGoalCompletion==='function'});return;}
  if(lane==='candidate'&&typeof runtime.reviewGoalCompletion!=='function')throw Error('PRODUCTION_GOAL_AUDITOR_NOT_AVAILABLE');
  const {modelProxyFetch}=await import(moduleUrl('main/model-proxy')),{openAICompatibleProviderConfig,OPENAI_COMPATIBLE_RUNTIME_PROVIDER}=await import(moduleUrl('main/model-runtime')),{openAIResponsesApi}=await import('@earendil-works/pi-ai/api/openai-responses.lazy');
  transport=observeReviewFetch(modelProxyFetch(manifest.model.proxyUrl),{projectPayload:runtimeRequestDiagnostics});
  const observedFetch=async(...values)=>{if(++providerRequests>(lane==='baseline'?1:13))throw Error('MODEL_REQUEST_BUDGET_EXCEEDED');return transport.fetch(...values);};
  runtime.modelRuntime.registerProvider(OPENAI_COMPATIBLE_RUNTIME_PROVIDER,{...openAICompatibleProviderConfig(runtimeOptions.model),streamSimple:(model,context,options)=>openAIResponsesApi().streamSimple(model,context,{...options,fetch:observedFetch})});
  timer=setTimeout(()=>service.cancel(runId),timeoutMs);const started=Date.now();reviewInvocations++;
  if(lane==='baseline'){
   const report=await service.checkTaskAcceptance(runId),reviewed=await service.finishTaskContentReview(runId,report,runtime,runtimeOptions.model,true);
   await write(path.join(folder,'receipt.json'),reviewed.contentReview??{notice:reviewed.contentReviewNotice});Object.assign(result,{status:reviewed.contentReview?.status??'unverified',completion:reviewed.contentReview?.completion??'unknown',productionReviewMethod:'Service.finishTaskContentReview',findings:reviewed.contentReview?.findings?.length??0,invalidFindings:reviewed.contentReview?.invalidFindings?.length??0});
  }else{
   const {goalReviewInputHash,goalReviewEligible}=await import(moduleUrl('main/pi-goal-review')),{requiresReconciliation}=await import(moduleUrl('main/run-recovery'));
   const report=await service.checkTaskAcceptance(runId),domain=service.taskDomain(runId),contract=domain.getContract(runId),goalInputHash=goalReviewInputHash(contract,report),authorization=service.businessAuthorization(),permissions=hash(JSON.stringify(service.state.permissions)),parentSignal=service.runControllers.get(runId).signal;
   const guard=async()=>{await assertCurrent();service.assertBusinessAccess(service.state.root);assert.equal(service.businessAuthorization(),authorization,'AUTHORIZATION_CHANGED');assert.equal(hash(JSON.stringify(service.state.permissions)),permissions,'PERMISSIONS_CHANGED');if(service.store.recoveryForRun(runId).some(requiresReconciliation))throw Error('SIDE_EFFECT_UNKNOWN');const current=await domain.getReport(runId,report.id);if(!current||current.versionState!=='current'||goalReviewInputHash(domain.getContract(runId),current)!==goalInputHash)throw Error('PI_GOAL_REVIEW_INPUT_CHANGED');};
   const evidence=JSON.stringify({requests:input.requestContexts,artifacts:input.artifactContexts,sources:input.sourceContexts,coverageLimits:input.coverageLimits,outputs:contract.outputs,hostReport:{status:report.status,results:report.results,regression:report.regression,versionState:report.versionState},notice:'选段可能不完整，可用read_draft读取本Run待应用稿，read_file读取授权资料；来源版本与全量覆盖仍需实际核验。'});
   await write(path.join(folder,'candidate-evidence.json'),{objective:contract.requests.map(r=>r.text).join('\n\n'),evidence});
   const native=await service.capabilityBroker.execute({runId,conversationId:service.taskRun(runId).conversationId,capability:'workspace_read',summary:'隔离真实PRD完成审查对照',details:{kind:'goal_completion_review',goalInputHash}},async()=>{await guard();return runtime.reviewGoalCompletion({objective:contract.requests.map(r=>r.text).join('\n\n'),evidence,signal:parentSignal,assertCurrent:guard,acceptCompletion:async()=>{await guard();return report.status!=='failed';},onUsage:usage=>{store.operation(randomUUID(),runId,'goal_auditor_usage','succeeded',JSON.stringify({fixtureId,usage}));}});});
   await write(path.join(folder,'receipt.json'),native);Object.assign(result,{status:native.error?'unverified':native.approved?'approved':native.disapproved?'disapproved':'unverified',completion:native.error?'failed':'completed',productionReviewMethod:'Runtime.reviewGoalCompletion with original Service gateway tools/capability broker and production goalReviewInputHash',upstreamApproved:native.upstreamApproved,approved:native.approved,disapproved:native.disapproved,errorCode:native.error?safeError(native.error):undefined,defaultTaskEligibility:goalReviewEligible(contract,report,service.requiresTaskContentReview(runId)),manualAdapterBenchmark:true,productionDefaultChanged:false});
  }
  Object.assign(result,{elapsedMs:Date.now()-started,outerReviewCalls:reviewInvocations});await assertCurrent();
 }catch(error){Object.assign(result,{status:'failed',errorCode:safeError(error),outerReviewCalls:reviewInvocations});}
 finally{
  clearTimeout(timer);if(service&&runId)service.cancel(runId);release();
  const until=Date.now()+10000;while(service&&(service.active.size||service.starting.size)&&Date.now()<until)await new Promise(resolve=>setTimeout(resolve,25));
  if(transport){result.transport=transport.snapshot();await write(path.join(folder,'network-diagnostics.json'),result.transport);}result.providerRequestAttempts=providerRequests;result.sourceHashAfter=hash(await fs.readFile(path.join(dir,'readonly-sources','字段表原文.txt')));result.artifactHashAfter=hash(await fs.readFile(path.join(dir,'frozen','PRD.md')));
  if(service){if(runId){result.sourceReadsAfter=service.taskRun(runId).sourceReads??[];result.operations=store.operationsForRun(runId).map(({tool,state,result:body})=>({tool,state,bodyHash:hash(body??'')}));}service.dispose();await Promise.allSettled([...service.agentIndex.queues.values()]);}store.close();key=undefined;
  await(await import(moduleUrl('main/model-proxy'))).closeModelProxyTransports();await verify(manifest);await write(path.join(folder,preflight?'preflight-result.json':'result.json'),result);app.exit(result.status==='failed'?1:0);
 }
}

async function launch(preflight=false){const dir=caseDirectory(),lane=route(),folder=path.join(dir,lane);await fs.writeFile(path.join(folder,preflight?'preflight-once.lock':'cloud-once.lock'),new Date().toISOString(),{flag:'wx'});const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;delete env.NODE_OPTIONS;const child=spawn(path.join(root,'node_modules/electron/dist/electron.exe'),[script,'--electron-child',...(preflight?['--preflight-child']:[]),'--case-dir',dir,'--route',lane],{cwd:root,env,windowsHide:true,stdio:['ignore','pipe','pipe']});let stdoutBytes=0,stderrBytes=0;child.stdout.on('data',data=>stdoutBytes+=data.length);child.stderr.on('data',data=>stderrBytes+=data.length);const timer=setTimeout(()=>{if(child.exitCode===null)spawn('taskkill',['/pid',String(child.pid),'/t','/f'],{windowsHide:true,stdio:'ignore'});},timeoutMs+40000);const exit=await new Promise(resolve=>{child.once('error',()=>resolve(1));child.once('exit',resolve);});clearTimeout(timer);await write(path.join(folder,preflight?'preflight-launcher.json':'launcher.json'),{exit,stdoutBytes,stderrBytes});const result=await json(path.join(folder,preflight?'preflight-result.json':'result.json')).catch(()=>({status:'failed',errorCode:'CHILD_WITHOUT_RECEIPT'}));console.log(JSON.stringify({fixtureId,lane,caseDir:dir,status:result.status,completion:result.completion,providerRequestAttempts:result.providerRequestAttempts,exit}));process.exitCode=exit??1;}
async function main(){if(args.includes('--prepare-only'))await prepare();else if(args.includes('--preflight-only'))await launch(true);else if(args.includes('--run-cloud'))await launch();else if(args.includes('--electron-child'))await cloudChild(caseDirectory(),route(),args.includes('--preflight-child'));else throw Error('MODE_REQUIRED');}
async function failed(error){console.error(JSON.stringify({status:'failed',errorCode:safeError(error)}));process.exitCode=1;if(process.versions.electron)createRequire(import.meta.url)('electron').app.exit(1);}
if(process.versions.electron){try{const dir=caseDirectory(),lane=route(),{app}=createRequire(import.meta.url)('electron');app.setName('slash');app.setPath('userData',path.join(dir,lane,args.includes('--preflight-child')?'profile-preflight':'profile'));void main().catch(failed);}catch(error){void failed(error);}}else await main().catch(failed);
