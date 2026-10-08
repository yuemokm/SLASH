// Opt-in test library. Reuses an already launched isolated Electron and official IPC.
// Importing this module launches nothing, sends nothing and installs no wrapper.
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {installQualityDraftFault} from './quality-draft-fault.mjs';
const sha=value=>createHash('sha256').update(value).digest('hex');
const same=(a,b)=>path.resolve(a).toLowerCase()===path.resolve(b).toLowerCase();
const inside=(a,b)=>{const r=path.relative(a,b);return !path.isAbsolute(r)&&r!=='..'&&!r.startsWith('..'+path.sep);};
const fail=code=>{throw Error(code);};
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const terminals=new Set(['succeeded','failed','interrupted','cancelled','awaiting_plan']);
const startStageCodes={read_run_state:'FAULT_DRIVER_RUN_STATE_UNAVAILABLE',write_start_receipt:'FAULT_DRIVER_START_RECEIPT_UNAVAILABLE',install_observer:'FAULT_DRIVER_OBSERVER_INSTALL_FAILED'};
/** A successful send is irreversible for this driver. Return only host metadata
 * and a digest of the original error, never its possibly credential-bearing text. */
export class QualityFaultRetestStartError extends Error {
 constructor(stage,startReceipt,cause){
  super('FAULT_DRIVER_START_RECOVERY_REQUIRED: '+stage);
  this.name='QualityFaultRetestStartError';this.code='FAULT_DRIVER_START_RECOVERY_REQUIRED';this.stage=stage;
  this.startReceipt=structuredClone(startReceipt);this.realSendCalls=1;this.existingRunPreserved=true;
  const message=typeof cause?.message==='string'?cause.message:typeof cause==='string'?cause:'Unknown error';
  this.diagnostic={code:startStageCodes[stage],errorName:['Error','TypeError','RangeError','SyntaxError','ReferenceError','AbortError'].includes(cause?.name)?cause.name:'Error',messageHash:sha(message),messageLength:message.length,notice:'原始错误文本可能包含敏感信息，不回传；已发送的 Run 保留，禁止重复发送或自动关闭/取消。'};
 }
}
/** Serialized by Playwright into Electron main. Its UtilityScript lacks an
 * import() callback; use Node's native main-context loader, preserving the
 * exact existing ESM modules/cache rather than evaluating copied app code. */
export function createQualityFaultMainContext({app}){
 const vm=process.getBuiltinModule?.('node:vm');
 if(!vm?.compileFunction||vm.constants?.USE_MAIN_CONTEXT_DEFAULT_LOADER===undefined)throw Error('FAULT_DRIVER_NATIVE_IMPORT_UNAVAILABLE');
 const load=vm.compileFunction('return import(specifier);',['specifier'],{filename:'quality-fault-native-loader.cjs',importModuleDynamically:vm.constants.USE_MAIN_CONTEXT_DEFAULT_LOADER});
 return{app,importModule:load};
}
/** Official Playwright handle only; callbacks use importModule, with no separate
 * app/browser harness or duplicated loaders. Disposal releases only this handle. */
export async function evaluateQualityFaultMainAction(app,action,input){
 const context=await app.evaluateHandle(createQualityFaultMainContext);
 try{return await context.evaluate(action,input);}finally{await context.dispose();}
}
export async function installQualityFaultObserverInElectronMain({importModule},{serviceUrl,moduleUrl,scope,planFilePath}){
 const {Service}=await importModule(serviceUrl),{installQualityFaultCheckObserver}=await importModule(moduleUrl);
 globalThis.__slashQualityFaultObserver=await installQualityFaultCheckObserver({ServicePrototype:Service.prototype,scope,planFilePath});
}
async function hashedFile(file,max=20_000_000){const s=await fs.lstat(file);if(!s.isFile()||s.isSymbolicLink()||s.size>max)fail('FAULT_DRIVER_FILE_INVALID');return sha(await fs.readFile(file));}
async function writeNew(file,value){await fs.writeFile(file,JSON.stringify(value,null,2),{flag:'wx'});}
async function assertIsolation({app,call,repo,caseDir,profile,workspace}){
 const testRoot=await fs.realpath(path.join(repo,'.test-data'));
 for(const p of [caseDir,profile,workspace])if(!inside(testRoot,await fs.realpath(p)))fail('FAULT_DRIVER_ISOLATION_INVALID');
 if(!same(profile,path.join(caseDir,'profile'))||!same(workspace,path.join(caseDir,'workspace')))fail('FAULT_DRIVER_CASE_LAYOUT_INVALID');
 const actual=await app.evaluate(({app})=>({profile:app.getPath('userData'),hidden:process.env.PM_SLASH_TEST_HIDDEN,dev:process.env.PM_SLASH_DEV_SERVER_URL,vite:process.env.VITE_DEV_SERVER_URL}));
 if(!same(actual.profile,profile)||actual.hidden!=='1'||actual.dev||actual.vite)fail('FAULT_DRIVER_APP_ISOLATION_INVALID');
 const state=await call({type:'state'});
 if(!same(state.root,workspace)||state.connections.length||state.permissions.process_execute!=='deny'||state.permissions.external_action!=='deny'||state.permissions.web_read!=='deny')fail('FAULT_DRIVER_PERMISSION_SCOPE_INVALID');
 return state;
}
/** Strict preflight and post-run protection use the existing prepare manifest.
 * Credentials/profile DB are never read. Source paths/hashes are evidence only. */
export async function snapshotFaultProtection({repo,manifestPath,additionalFiles=[]}){
 const manifest=JSON.parse(await fs.readFile(manifestPath,'utf8'));
 const {snapshotEvaluationSourceVersions}=await import('../main/quality-evaluation.ts');
 const actual=await snapshotEvaluationSourceVersions(repo);
 if(JSON.stringify(actual)!==JSON.stringify(manifest.sourceVersions))fail('FAULT_DRIVER_SOURCE_REPREPARE_REQUIRED');
 const records=[{path:manifestPath,sha256:await hashedFile(manifestPath)},...Object.entries(manifest.sourceVersions).map(([file,sha256])=>({path:path.join(repo,file),sha256})),...Object.entries(manifest.runtimeVersions).map(([file,sha256])=>({path:path.join(repo,'dist',file),sha256})),...manifest.skillFiles];
 for(const source of manifest.sources)records.push({path:source.sourcePath,sha256:source.sourceSha256Before},{path:source.copyPath,sha256:source.copySha256},{path:source.textPath,sha256:source.textSha256});
 records.push(...additionalFiles);const unique=new Map();
 for(const record of records){if(!/^[a-f0-9]{64}$/.test(record.sha256)||await hashedFile(record.path)!==record.sha256)fail('FAULT_DRIVER_PROTECTED_FILE_CHANGED');const k=path.resolve(record.path).toLowerCase();if(unique.has(k)&&unique.get(k).sha256!==record.sha256)fail('FAULT_DRIVER_HASH_CONFLICT');unique.set(k,{path:record.path,sha256:record.sha256});}
 return [...unique.values()];
}
export async function verifyFaultProtection(records){const results=[];for(const record of records){let after=null;try{after=await hashedFile(record.path);}catch{}results.push({...record,after,unchanged:after===record.sha256});}return {status:results.every(r=>r.unchanged)?'unchanged':'verification_invalid',files:results};}

/** Replay exact reviewed core8 definitions in the NEW profile. Old screenshots
 * are provenance, never a substitute for this current browser execution. */
export async function prepareQualityFaultBaseline(options){
 const {app,call,caseDir,target,artifactPath,artifactHash,core8Proof,sourceRefs}=options;
 const state=await assertIsolation(options);
 if(state.runs.length||state.changes.length)fail('FAULT_DRIVER_FRESH_PROFILE_REQUIRED');
 const mount=state.mounts.find(m=>m.id===target.mountId&&m.enabled&&m.write);
 if(!mount||!same(artifactPath,path.join(mount.path,target.path))||!inside(options.workspace,artifactPath)||await hashedFile(artifactPath)!==artifactHash)fail('FAULT_DRIVER_SEED_ARTIFACT_INVALID');
 if(await hashedFile(core8Proof.path)!==core8Proof.sha256)fail('FAULT_DRIVER_CORE8_PROOF_CHANGED');
 const proof=JSON.parse(await fs.readFile(core8Proof.path,'utf8')),cases=proof.cases;
 if(proof.status!=='passed'||proof.requiredConfirmed!==true||proof.artifactHash!==artifactHash||cases?.length!==8||cases.reduce((n,c)=>n+c.steps.length,0)!==69||sha(JSON.stringify(cases))!==proof.casesHash)fail('FAULT_DRIVER_CORE8_PROOF_INVALID');
 if(!cases.some(c=>c.steps.some(s=>s.action==='assert'&&s.assertion==='readonly'&&s.expected===true)))fail('FAULT_DRIVER_REQUIRED_READONLY_MISSING');
 if(!sourceRefs?.length)fail('FAULT_DRIVER_SOURCE_SCOPE_INVALID');
 for(const original of proof.report.evidence.sourceRefs)if(!sourceRefs.some(s=>s.path===original.path&&s.contentHash===original.contentHash))fail('FAULT_DRIVER_CORE8_SOURCE_OMITTED');
 for(const source of sourceRefs){const m=state.mounts.find(m=>m.id===source.mountId&&m.enabled&&!m.write);if(!m||!inside(m.path,path.join(m.path,source.path))||await hashedFile(path.join(m.path,source.path))!==source.contentHash)fail('FAULT_DRIVER_SOURCE_SCOPE_INVALID');}
 let view=await call({type:'prototypeAcceptanceGet',...target});
 if(view.spec||view.activeRun)fail('FAULT_DRIVER_BASELINE_ALREADY_EXISTS');
 view=await call({type:'prototypeAcceptanceSave',...target,mode:'build',expectedRevision:0,title:'真实资料独立浏览器基准 core8 故障复测',cases,sourceRefs});
 const spec=view.spec,execution=await call({type:'prototypeAcceptanceRun',...target,mode:'build',expectedRevision:spec.revision}),observeUntil=Date.now()+75000;
 while(Date.now()<observeUntil){view=await call({type:'prototypeAcceptanceGet',...target});if(!view.activeRun&&view.latestReport?.evidence.executionId===execution.executionId)break;await sleep(250);}
 const report=view.latestReport;
 if(view.activeRun||report?.evidence.executionId!==execution.executionId)fail('FAULT_DRIVER_BROWSER_STILL_RUNNING');
 if(report.versionState!=='current'||report.evidence.status!=='passed'||report.evidence.entryHash!==artifactHash||report.evidence.specHash!==spec.specHash||report.evidence.cases.length!==cases.length||!report.evidence.cases.every((c,i)=>c.caseId===cases[i].id&&c.status==='passed'&&c.steps.length===cases[i].steps.length&&c.steps.every(s=>s.status==='passed')))fail('FAULT_DRIVER_CURRENT_BASELINE_NOT_PASSED');
 view=await call({type:'prototypeAcceptanceRequired',...target,mode:'build',required:true,expectedRevision:view.spec.revision,expectedSpecHash:view.spec.specHash});
 if(!view.spec.required||view.spec.requiredSpecHash!==spec.specHash||JSON.stringify(view.spec.cases)!==JSON.stringify(cases)||await hashedFile(artifactPath)!==artifactHash)fail('FAULT_DRIVER_REQUIRED_BASELINE_CHANGED');
 const receipt={schemaVersion:1,identity:'host_replayed_core8',humanConfirmed:false,cloudExecuted:false,artifactHash,target,core8Proof,spec:view.spec,report,notice:'Eight cases only. No full business, field-preservation or visual confirmation.'};
 await writeNew(path.join(caseDir,'retest-baseline.json'),receipt);return receipt;
}

/** Electron-main only. Wrap original checker solely to preserve its real
 * returned evidence and same-Run pending bytes. Never change its result. */
export async function installQualityFaultCheckObserver({ServicePrototype,scope,planFilePath}){
 const waitPlan=async({signal})=>{while(!signal.aborted){try{return {path:planFilePath,sha256:await hashedFile(planFilePath,128000)};}catch(e){if(e.code!=='ENOENT')throw e;}await sleep(200);}fail('FAULT_DRIVER_PLAN_WAIT_CANCELLED');};
 const fault=await installQualityDraftFault({ServicePrototype,scope,preparePlan:waitPlan}),original=ServicePrototype.checkTaskAcceptance;let index=0;
 async function wrapped(runId,...args){
  const report=await original.call(this,runId,...args),run=this.state.runs.find(r=>r.id===runId);
  if(runId!==scope.runId||!same(this.store.dir,scope.profile)||!same(this.state.root,scope.workspace)||run?.phase!=='validating'||!run.generationFinishedAt)return report;
  const number=++index,record={schemaVersion:1,identity:'host_official_checker_observer',humanConfirmed:false,runId,repairRounds:run.acceptance?.repairRounds??null,generationFinishedAt:run.generationFinishedAt,observedAt:new Date().toISOString(),report,reportHash:sha(JSON.stringify(report)),snapshots:[]};
  const targetAbsolute=await this.files.resolve(scope.mountId,scope.path),physicalTarget=await fs.realpath(targetAbsolute),outputs=[];
  if(!inside(scope.workspace,physicalTarget)||!same(targetAbsolute,physicalTarget))fail('FAULT_DRIVER_CHECK_TARGET_SCOPE');
  for(const o of (report.targets??[]).filter(o=>o.kind==='html'&&o.target.source==='draft'&&o.target.mountId===scope.mountId)){
   const absolute=await this.files.resolve(o.target.mountId,o.target.path);
   if(same(absolute,targetAbsolute)){
    const physical=await fs.realpath(absolute);if(!inside(scope.workspace,physical)||!same(absolute,physical)||!same(physical,physicalTarget))fail('FAULT_DRIVER_CHECK_TARGET_SCOPE');outputs.push(o);
   }
  }
  if(outputs.length>1)fail('FAULT_DRIVER_CHECK_TARGET_AMBIGUOUS');const output=outputs[0];
  if(output){let content='',offset=0;for(let page=0;page<126;page++){const r=await this.readDraftForRun(runId,{mountId:scope.mountId,path:scope.path,offset,limit:16000});if(r.changeId!==output.target.changeId||r.contentHash!==output.target.contentHash)fail('FAULT_DRIVER_CHECK_SNAPSHOT_STALE');content+=r.content;if(Buffer.byteLength(content)>2_000_000)fail('FAULT_DRIVER_CHECK_SNAPSHOT_LIMIT');if(r.nextOffset===undefined)break;if(r.nextOffset<=offset)fail('FAULT_DRIVER_CHECK_SNAPSHOT_CURSOR');offset=r.nextOffset;}
   if(sha(content)!==output.target.contentHash)fail('FAULT_DRIVER_CHECK_SNAPSHOT_HASH');const file=path.join(scope.caseDir,`official-check-${number}-draft.html`);await fs.writeFile(file,content,{flag:'wx'});record.snapshots.push({path:file,sha256:output.target.contentHash,changeId:output.target.changeId});}
  await writeNew(path.join(scope.caseDir,`official-check-${number}.json`),record);return report;
 }
 ServicePrototype.checkTaskAcceptance=wrapped;
 return {async finish(){return fault.finish();},dispose(){if(ServicePrototype.checkTaskAcceptance!==wrapped)fail('FAULT_DRIVER_OBSERVER_CHANGED');ServicePrototype.checkTaskAcceptance=original;fault.dispose();}};
}

/** Explicit one-send gate. The root supplies existing official IPC/app and a
 * reviewed tiny user request. Installation happens immediately after send;
 * a too-fast/missed Run honestly becomes not_executed, never a second send. */
export async function startQualityFaultRetest(options){
 if(options.allowCloud!==true||options.reviewedByRoot!==true)fail('FAULT_DRIVER_EXPLICIT_ROOT_GATE_REQUIRED');
 const {app,call,repo,caseDir,profile,workspace,target,model,baseline,prompt,manifestPath,planFilePath}=options;
 if(typeof prompt!=='string'||!prompt.trim()||prompt.length>5000||!inside(caseDir,planFilePath)||inside(workspace,planFilePath)||inside(profile,planFilePath))fail('FAULT_DRIVER_REVIEWED_REQUEST_INVALID');
 const state=await assertIsolation(options),live=state.models.find(m=>m.id===model.id);
 if(state.runs.length||state.changes.length||state.models.length!==1||state.defaultModelId!==model.id||!live?.hasKey||live.protocol!==model.protocol)fail('FAULT_DRIVER_MODEL_OR_PROFILE_INVALID');
 const current=await call({type:'prototypeAcceptanceGet',...target});
 if(current.spec?.specHash!==baseline.spec.specHash||!current.spec.required||current.latestReport?.reportId!==baseline.report.reportId||current.latestReport.versionState!=='current')fail('FAULT_DRIVER_BASELINE_STALE');
 const driverPath=fileURLToPath(import.meta.url),faultPath=fileURLToPath(new URL('./quality-draft-fault.mjs',import.meta.url));
 const protectedBefore=await snapshotFaultProtection({repo,manifestPath,additionalFiles:[{path:options.artifactPath,sha256:baseline.artifactHash},options.core8Proof,{path:driverPath,sha256:await hashedFile(driverPath)},{path:faultPath,sha256:await hashedFile(faultPath)}]});
 const limits=(await import(pathToFileURL(path.join(repo,'dist/main/run-limits.js')).href)).DEFAULT_RUN_LIMITS;
 const once=await fs.open(path.join(caseDir,'retest-send-once.lock'),'wx');await once.close();
 await fs.writeFile(path.join(caseDir,'retest-prompt.txt'),prompt,{flag:'wx'});
 const conversationId=await call({type:'conversation',title:'core8 单次草稿故障与原自动修正复测'});
 const runId=await call({type:'send',id:conversationId,text:prompt,mode:'build',permissionMode:'full_access',modelEntryId:model.id,taskType:'coding'});
 // Establish recovery identity immediately after the acknowledged send. A failed
 // state read cannot justify inventing a deadline or treating this as zero sends.
 const scope={testRoot:path.join(repo,'.test-data'),caseDir,profile,workspace,runId,mountId:target.mountId,path:target.path,deadlineAt:null};
 const receipt={schemaVersion:1,identity:'host_fault_retest_driver',humanConfirmed:false,status:'running',realSendCalls:1,runId,conversationId,model:{id:model.id,protocol:model.protocol},promptHash:sha(prompt),scope,limits,protectedBefore,baselineSpecHash:baseline.spec.specHash,cases:baseline.spec.cases,notice:'No apply, retry, extra prompt or budget extension. Root retains Electron on observation timeout.'};
 let stage='read_run_state';
 try{
  const started=(await call({type:'state'})).runs.find(r=>r.id===runId);if(!started)fail('FAULT_DRIVER_RUN_MISSING');
  const deadlineAt=Date.parse(started.startedAt)+limits.durationMs;if(!Number.isFinite(deadlineAt))fail('FAULT_DRIVER_RUN_STARTED_AT_INVALID');scope.deadlineAt=deadlineAt;
  stage='write_start_receipt';await writeNew(path.join(caseDir,'retest-start.json'),receipt);
  stage='install_observer';await evaluateQualityFaultMainAction(app,installQualityFaultObserverInElectronMain,{serviceUrl:pathToFileURL(path.join(repo,'dist/main/service.js')).href,moduleUrl:import.meta.url,scope,planFilePath});
  return receipt;
 }catch(error){
  // Exclusive creation preserves any already-written evidence. Even if storage
  // fails, the structured error still carries the acknowledged Run identity.
  await writeNew(path.join(caseDir,'retest-start.json'),receipt).catch(()=>{});
  throw new QualityFaultRetestStartError(stage,receipt,error);
 }
}

/** Bounded observation only. A caller abort is a real official cancellation;
 * elapsed observation never cancels the original Run or closes Electron. */
export async function observeQualityFaultRetest({app,call,caseDir,start,signal,observeMs=60000}){
 if(!Number.isInteger(observeMs)||observeMs<0||observeMs>60000)fail('FAULT_DRIVER_OBSERVATION_LIMIT');
 const until=Date.now()+observeMs;let run,cancelSent=false;
 do{if(signal?.aborted&&!cancelSent){await call({type:'cancel',id:start.runId});cancelSent=true;}run=(await call({type:'state'})).runs.find(r=>r.id===start.runId);if(!run)fail('FAULT_DRIVER_RUN_MISSING');if(terminals.has(run.status))break;await sleep(250);}while(Date.now()<until);
 if(!terminals.has(run.status))return {status:'running',runId:run.id,phase:run.phase,cancelSent,observationExpired:true,notice:'Keep the app and observer. Observe again; original Service deadline remains active.'};
 const injection=await app.evaluate(async()=>{const wrapper=globalThis.__slashQualityFaultObserver;if(!wrapper)return {status:'not_executed',reason:'FAULT_DRIVER_WRAPPER_MISSING'};const receipt=await wrapper.finish();wrapper.dispose();delete globalThis.__slashQualityFaultObserver;return receipt;});
 const checks=[];for(let n=1;n<=8;n++){try{checks.push(JSON.parse(await fs.readFile(path.join(caseDir,`official-check-${n}.json`),'utf8')));}catch(e){if(e.code==='ENOENT')break;throw e;}}
 const protection=await verifyFaultProtection(start.protectedBefore),view=await call({type:'taskAcceptanceGet',runId:start.runId});
 const chain=assessQualityFaultChain({injection,checks,run,cases:start.cases,baselineSpecHash:start.baselineSpecHash});
 const result={schemaVersion:1,identity:'host_fault_retest_driver',humanConfirmed:false,status:protection.status==='unchanged'?chain.status:'verification_invalid',chain,run:{id:run.id,status:run.status,phase:run.phase,startedAt:run.startedAt,finishedAt:run.finishedAt,error:run.error,repairRounds:run.acceptance?.repairRounds},injection,protection,finalTaskAcceptance:view,cancelSent,formalApplied:false,notice:'This test measures only injected readonly repair and the frozen eight browser cases. Semantic/business/visual coverage remains separate.'};
 await writeNew(path.join(caseDir,'retest-result.json'),result);return result;
}

/** Positive original browser evidence is mandatory; bytes or Run succeeded
 * alone cannot prove a failure or an automatic correction. */
export function assessQualityFaultChain({injection,checks,run,cases,baselineSpecHash}){
 if(injection?.status!=='injected')return {status:'not_executed',reason:'NO_VERIFIED_HOST_INJECTION'};
 if(injection.runId!==run.id)return {status:'unknown',reason:'INJECTION_RUN_BINDING_MISMATCH'};
 const bindings=record=>[...(record.report.results??[]),...(record.report.regression??[])].flatMap(result=>(result.evidence??[]).filter(e=>e.kind==='prototype_report').map(e=>({result,evidence:e,prototype:e.prototype})));
 const bound=(record,evidence,p)=>p?.caseOrigin==='host_baseline'&&p.baselineSpecHash===baselineSpecHash&&p.draft?.parentRunId===run.id&&p.draft.changeId===injection.changeId&&p.draft.expectedContentHash===evidence.targetHash&&p.entryHash===evidence.targetHash&&record.snapshots?.some(s=>s.changeId===injection.changeId&&s.sha256===evidence.targetHash)&&cases.every(c=>p.caseDefinitions?.some(d=>d.id===c.id&&JSON.stringify(d)===JSON.stringify(c)));
 const fault=checks.find(record=>record.repairRounds===0&&record.report.runId===run.id&&record.report.versionState==='current'&&bindings(record).some(({result,evidence,prototype})=>result.required&&result.status==='failed'&&evidence.targetHash===injection.afterHash&&bound(record,evidence,prototype)&&prototype.cases.some(c=>{const def=cases.find(d=>d.id===c.caseId);return def&&c.steps.some(s=>def.steps[s.stepIndex]?.assertion==='readonly'&&def.steps[s.stepIndex]?.selector===injection.fault.selector&&def.steps[s.stepIndex]?.expected===true&&s.status==='failed'&&s.observed===false);} )));
 if(!fault)return {status:'unknown',reason:'NO_ORIGINAL_BROWSER_READONLY_FAILURE_BOUND_TO_FAULT'};
 const repaired=checks.find(record=>record.repairRounds>0&&record.repairRounds<=2&&record.report.runId===run.id&&record.report.versionState==='current'&&bindings(record).some(({result,evidence,prototype})=>result.required&&result.status==='passed'&&bound(record,evidence,prototype)&&prototype.status==='passed'&&evidence.targetHash!==injection.afterHash&&cases.every(def=>{const c=prototype.cases.find(c=>c.caseId===def.id);return c?.status==='passed'&&c.steps.length===def.steps.length&&c.steps.every((s,i)=>s.stepIndex===i&&s.status==='passed'&&(def.steps[i].action!=='assert'||s.observed!==undefined))&&prototype.screenshots?.some(s=>s.caseId===def.id&&s.contentHash);} )));
 if(!repaired)return {status:terminals.has(run.status)?'failed':'unknown',reason:'NO_BOUND_CURRENT_CORE8_RECHECK_AFTER_ORIGINAL_REPAIR',failureReportId:fault.report.id};
 if(run.status!=='succeeded'||!(run.acceptance?.repairRounds>=1&&run.acceptance.repairRounds<=2))return {status:'unknown',reason:'ORIGINAL_RUN_NOT_SUCCESSFULLY_COMPLETED',failureReportId:fault.report.id,recheckReportId:repaired.report.id};
 return {status:'repair_evidenced',failureReportId:fault.report.id,recheckReportId:repaired.report.id,notice:'Local fault repair evidence only; never human business confirmation.'};
}
