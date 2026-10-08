// Synthetic receipts test evidence classification only. No Electron/browser/LLM.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {snapshotEvaluationSourceVersions} from '../main/quality-evaluation.js';
import {Service} from '../main/service.js';
import {Store} from '../main/store.js';
import {assessQualityFaultChain,startQualityFaultRetest,observeQualityFaultRetest,QualityFaultRetestStartError,createQualityFaultMainContext,installQualityFaultCheckObserver} from '../scripts/quality-fault-retest-driver.mjs';
const clone=value=>structuredClone(value);
function fixture(){
 const cases=Array.from({length:8},(_,i)=>({id:'case'+i,title:'synthetic evidence fixture',steps:[i?{action:'assert',assertion:'text',selector:'#x',expected:'x'}:{action:'assert',assertion:'readonly',selector:'#code',expected:true}]}));
 const injection={status:'injected',runId:'run',changeId:'change',afterHash:'f'.repeat(64),fault:{selector:'#code'}},run={id:'run',status:'succeeded',acceptance:{repairRounds:1}},baselineSpecHash='b'.repeat(64);
 const record=(round,hash,failed)=>({repairRounds:round,snapshots:[{changeId:'change',sha256:hash}],report:{id:failed?'failed-report':'rechecked-report',runId:'run',versionState:'current',results:[],regression:[{required:true,status:failed?'failed':'passed',evidence:[{kind:'prototype_report',targetHash:hash,prototype:{status:failed?'failed':'passed',entryHash:hash,caseOrigin:'host_baseline',baselineSpecHash,draft:{parentRunId:'run',changeId:'change',expectedContentHash:hash},caseDefinitions:clone(cases),cases:cases.map((c,i)=>({caseId:c.id,status:failed&&i===0?'failed':'passed',steps:[{stepIndex:0,status:failed&&i===0?'failed':'passed',observed:i?'x':!failed}]})),screenshots:cases.map(c=>({caseId:c.id,contentHash:'e'.repeat(64)}))}}]}]}});
 return {injection,run,cases,baselineSpecHash,checks:[record(0,injection.afterHash,true),record(1,'a'.repeat(64),false)]};
}
test('Synthetic complete bound original failure→one repair→core8 chain is distinct from human confirmation',()=>{const result=assessQualityFaultChain(fixture());assert.equal(result.status,'repair_evidenced');assert.equal(result.failureReportId,'failed-report');assert.match(result.notice,/never human/);});
test('Successful Run and changed bytes alone cannot evidence correction',()=>{const f=fixture();f.checks=[];assert.equal(assessQualityFaultChain(f).status,'unknown');});
test('Failure tied to previous HTML rather than injected pending hash is unknown',()=>{const f=fixture();f.checks[0].report.regression[0].evidence[0].targetHash='c'.repeat(64);assert.equal(assessQualityFaultChain(f).status,'unknown');});
test('Unbound previous-Run DOM evidence cannot establish failure',()=>{const f=fixture();f.checks[0].report.regression[0].evidence[0].prototype.draft.parentRunId='old-run';assert.equal(assessQualityFaultChain(f).status,'unknown');});
test('Readonly failure at another selector is insufficient',()=>{const f=fixture();f.injection.fault.selector='#other';assert.equal(assessQualityFaultChain(f).status,'unknown');});
test('Weakened definition cannot count as core8 recheck',()=>{const f=fixture();f.checks[1].report.regression[0].evidence[0].prototype.caseDefinitions[0].steps[0].expected=false;assert.equal(assessQualityFaultChain(f).status,'failed');});
test('Missing actual assertion observation or screenshot stays failed',()=>{for(const item of ['observation','screenshot']){const f=fixture(),p=f.checks[1].report.regression[0].evidence[0].prototype;if(item==='observation')delete p.cases[0].steps[0].observed;else p.screenshots=[];assert.equal(assessQualityFaultChain(f).status,'failed');}});
test('Third repair or stale final report cannot be counted',()=>{for(const item of ['third','stale']){const f=fixture();if(item==='third')f.checks[1].repairRounds=3;else f.checks[1].report.versionState='stale';assert.equal(assessQualityFaultChain(f).status,'failed');}});
test('No injection is not_executed',()=>{const f=fixture();f.injection.status='not_executed';assert.equal(assessQualityFaultChain(f).status,'not_executed');});
test('Cloud gate rejects before app/IPC access',async()=>{await assert.rejects(startQualityFaultRetest({}),/EXPLICIT_ROOT_GATE/);});
test('An observation timeout preserves live app/Run without cancel, extra send or wrapper disposal',async()=>{const calls=[];const result=await observeQualityFaultRetest({app:{evaluate(){throw Error('must not finish');}},call:async input=>{calls.push(input.type);return {runs:[{id:'r',status:'running',phase:'generating'}]};},caseDir:'unused',start:{runId:'r'},observeMs:0});assert.equal(result.status,'running');assert.equal(result.cancelSent,false);assert.deepEqual(calls,['state']);});

// These are synthetic official-IPC/app callbacks, not Electron or cloud runs.
async function startFixture(t,{stateFails=false,receiptFails=false,hookFails=false}={}){
 const testRoot=path.resolve('.test-data');await fs.mkdir(testRoot,{recursive:true});
 const repo=await fs.mkdtemp(path.join(testRoot,'fault-start-offline-'));
 t.after(async()=>{const relative=path.relative(testRoot,repo);assert.ok(relative&&!relative.startsWith('..')&&!path.isAbsolute(relative));await fs.rm(repo,{recursive:true,force:true});});
 for(const dir of ['main','shared','src','scripts','tests','public','dist/main','.test-data/case/profile','.test-data/case/workspace'])await fs.mkdir(path.join(repo,dir),{recursive:true});
 await fs.writeFile(path.join(repo,'package.json'),JSON.stringify({type:'module'}));
 const limitsFile=path.join(repo,'dist/main/run-limits.js'),limits={durationMs:1800000,maxToolCalls:120,maxRepairRounds:2};
 await fs.writeFile(limitsFile,'export const DEFAULT_RUN_LIMITS='+JSON.stringify(limits)+';');
 const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
 const caseDir=path.join(repo,'.test-data/case'),profile=path.join(caseDir,'profile'),workspace=path.join(caseDir,'workspace'),artifactPath=path.join(workspace,'index.html'),proofPath=path.join(caseDir,'proof.json');
 await fs.writeFile(artifactPath,'<input readonly>');await fs.writeFile(proofPath,'{"synthetic":true}');
 const artifactHash=hash(await fs.readFile(artifactPath)),core8Proof={path:proofPath,sha256:hash(await fs.readFile(proofPath))};
 const manifestPath=path.join(caseDir,'manifest.json');await fs.writeFile(manifestPath,JSON.stringify({sourceVersions:await snapshotEvaluationSourceVersions(repo),runtimeVersions:{'main/run-limits.js':hash(await fs.readFile(limitsFile))},skillFiles:[],sources:[]}));
 const model={id:'synthetic-current-model',protocol:'openai-completions'},spec={specHash:'b'.repeat(64),required:true,cases:fixture().cases},report={reportId:'synthetic-baseline-report',versionState:'current'},baseline={spec,report,artifactHash};
 const calls=[],evaluations=[],startedAt=new Date().toISOString();let sent=false;
 const state=()=>({root:workspace,runs:sent?[{id:'synthetic-run',status:'running',phase:'generating',startedAt}]:[],changes:[],connections:[],permissions:{process_execute:'deny',external_action:'deny',web_read:'deny'},models:[{...model,hasKey:true}],defaultModelId:model.id});
 const call=async input=>{calls.push(input.type);if(input.type==='state'){if(sent&&stateFails)throw Error('secret-state-token-do-not-return');return state();}if(input.type==='prototypeAcceptanceGet')return{spec,latestReport:report};if(input.type==='conversation')return'synthetic-conversation';if(input.type==='send'){assert.equal(sent,false,'Never resend');sent=true;if(receiptFails)await fs.mkdir(path.join(caseDir,'retest-start.json'));return'synthetic-run';}throw Error('unexpected IPC '+input.type);};
 const handles=[];
 const app={async evaluate(_fn,arg){evaluations.push(arg);return{profile,hidden:'1'};},async evaluateHandle(){const handle={disposed:false,async evaluate(_fn,arg){evaluations.push(arg);if(hookFails)throw Error('secret-api-key-do-not-return');},async dispose(){this.disposed=true;}};handles.push(handle);return handle;},close(){throw Error('Must preserve app');}};
 return{options:{repo,app,call,caseDir,profile,workspace,artifactPath,core8Proof,target:{mountId:'output',path:'index.html'},model,baseline,prompt:'Synthetic reviewed small modification',manifestPath,planFilePath:path.join(caseDir,'plan.json'),allowCloud:true,reviewedByRoot:true},calls,evaluations,handles,limits,startedAt};
}
test('Acknowledged send and persisted receipt survive observer-install failure without cancel, close or resend',async t=>{
 const f=await startFixture(t,{hookFails:true});let error;
 try{await startQualityFaultRetest(f.options);assert.fail('expected hook failure');}catch(e){error=e;}
 assert.ok(error instanceof QualityFaultRetestStartError);assert.equal(error.code,'FAULT_DRIVER_START_RECOVERY_REQUIRED');assert.equal(error.stage,'install_observer');assert.equal(error.realSendCalls,1);assert.equal(error.existingRunPreserved,true);
 assert.equal(error.startReceipt.runId,'synthetic-run');assert.equal(error.startReceipt.conversationId,'synthetic-conversation');assert.equal(error.startReceipt.scope.deadlineAt,Date.parse(f.startedAt)+f.limits.durationMs);
 const saved=JSON.parse(await fs.readFile(path.join(f.options.caseDir,'retest-start.json'),'utf8'));assert.deepEqual(error.startReceipt,saved);
 assert.equal(error.diagnostic.code,'FAULT_DRIVER_OBSERVER_INSTALL_FAILED');assert.match(error.diagnostic.messageHash,/^[a-f0-9]{64}$/);assert.ok(!JSON.stringify(error).includes('secret-api-key'));assert.ok(!error.message.includes('secret-api-key'));assert.equal(error.cause,undefined);
 assert.equal(f.handles.length,1);assert.equal(f.handles[0].disposed,true);
 assert.equal(f.calls.filter(x=>x==='send').length,1);assert.ok(!f.calls.includes('cancel'));
 await assert.rejects(startQualityFaultRetest(f.options),/FAULT_DRIVER_MODEL_OR_PROFILE_INVALID/);assert.equal(f.calls.filter(x=>x==='send').length,1);
 const observed=await observeQualityFaultRetest({...f.options,start:error.startReceipt,observeMs:0});assert.equal(observed.status,'running');assert.equal(observed.runId,'synthetic-run');assert.equal(observed.cancelSent,false);
});
test('State read after acknowledged send fails with recoverable identity and explicitly unknown deadline',async t=>{
 const f=await startFixture(t,{stateFails:true});let error;try{await startQualityFaultRetest(f.options);}catch(e){error=e;}
 assert.ok(error instanceof QualityFaultRetestStartError);assert.equal(error.stage,'read_run_state');assert.equal(error.startReceipt.runId,'synthetic-run');assert.equal(error.startReceipt.realSendCalls,1);assert.equal(error.startReceipt.scope.deadlineAt,null);assert.equal(f.evaluations.length,1);
 assert.equal(JSON.parse(await fs.readFile(path.join(f.options.caseDir,'retest-start.json'),'utf8')).runId,'synthetic-run');assert.ok(!JSON.stringify(error).includes('secret-state-token'));assert.equal(f.calls.filter(x=>x==='send').length,1);
});
test('Failed receipt storage still carries acknowledged identity and preserves the once lock',async t=>{
 const f=await startFixture(t,{receiptFails:true});let error;try{await startQualityFaultRetest(f.options);}catch(e){error=e;}
 assert.ok(error instanceof QualityFaultRetestStartError);assert.equal(error.stage,'write_start_receipt');assert.equal(error.startReceipt.runId,'synthetic-run');assert.equal(error.realSendCalls,1);assert.equal(f.evaluations.length,1);assert.ok((await fs.stat(path.join(f.options.caseDir,'retest-send-once.lock'))).isFile());assert.equal(f.calls.filter(x=>x==='send').length,1);assert.ok(!f.calls.includes('cancel'));
});
test('Successful synthetic observer installation keeps the original receipt and exactly one send',async t=>{
 const f=await startFixture(t),receipt=await startQualityFaultRetest(f.options);assert.equal(receipt.runId,'synthetic-run');assert.equal(receipt.realSendCalls,1);assert.equal(receipt.scope.deadlineAt,Date.parse(f.startedAt)+f.limits.durationMs);assert.equal(f.evaluations.length,2);assert.equal(f.calls.filter(x=>x==='send').length,1);assert.equal(f.handles[0].disposed,true);
});
test('Shared native main-context import function resolves actual modules with stable ESM identity',async()=>{
 const app={identity:'synthetic-context-only'},context=createQualityFaultMainContext({app});assert.equal(context.app,app);
 const first=await context.importModule('node:crypto'),second=await context.importModule('node:crypto');assert.equal(first,second);assert.equal(first.createHash('sha256').update('offline').digest('hex'),createHash('sha256').update('offline').digest('hex'));
});

async function snapshotFixture(t:test.TestContext){
 const testRoot=path.resolve('.test-data'),caseDir=await fs.mkdtemp(path.join(testRoot,'fault-snapshot-windows-')),profile=path.join(caseDir,'profile'),workspace=path.join(caseDir,'workspace');await fs.mkdir(workspace);
 const store=new Store(profile);let report:any,handle:any;
 class SnapshotFixtureService extends Service{async checkTaskAcceptance(){return report;}}
 const service=new SnapshotFixtureService(store,()=>'',()=>{},async()=>{throw Error('No model calls');});
 t.after(async()=>{handle?.dispose();service.dispose();await Promise.allSettled([...(service as any).agentIndex.queues.values()]);store.close();const r=path.relative(testRoot,caseDir);assert.ok(r&&!r.startsWith('..')&&!path.isAbsolute(r));await fs.rm(caseDir,{recursive:true,force:true,maxRetries:5,retryDelay:30});});
 await service.workspace(workspace);service.setPermission('workspace_read','allow');service.setPermission('artifact_write','allow');const mount=service.state.mounts.find(m=>m.name==='成果')!;
 const entryPath=path.join(mount.path,'QE16','index.html'),formal='<input readonly>',content=formal+'<!-- current pending fixture -->';await fs.mkdir(path.dirname(entryPath),{recursive:true});await fs.writeFile(entryPath,formal);
 const run:any={id:'snapshot-fixture-run',conversationId:service.conversation(),input:'offline snapshot fixture',mode:'build',permissionMode:'standard',status:'validating',phase:'validating',startedAt:new Date().toISOString(),generationFinishedAt:new Date().toISOString(),acceptance:{repairRounds:1}};service.state.runs.push(run);
 const change=await service.files.draft(mount.id,'QE16\\index.html',content,run.id);service.state.changes.unshift(change);const contentHash=createHash('sha256').update(content).digest('hex');
 const target={source:'draft',mountId:mount.id,path:change.path,changeId:change.id,contentHash};report={id:'snapshot-fixture-report',runId:run.id,versionState:'current',status:'unknown',targets:[{kind:'html',target}],notice:'Synthetic report fixture, not browser evidence'};
 const scope={testRoot,caseDir,profile,workspace,runId:run.id,mountId:mount.id,path:'QE16/index.html',deadlineAt:Date.now()+60000};
 handle=await installQualityFaultCheckObserver({ServicePrototype:SnapshotFixtureService.prototype,scope,planFilePath:path.join(caseDir,'unused-plan.json')});
 return{service,scope,report,target,run,change,content,contentHash,entryPath,formal};
}
test('Windows official-report alias captures full real Service pending snapshot with bound hash', {skip:process.platform!=='win32'},async t=>{
 const f=await snapshotFixture(t);f.report.targets.push({kind:'html',target:{...f.target,mountId:'not-authorized'}},{kind:'html',target:{...f.target,path:'other\\index.html'}});
 assert.equal(await f.service.checkTaskAcceptance(f.run.id),f.report);const record=JSON.parse(await fs.readFile(path.join(f.scope.caseDir,'official-check-1.json'),'utf8'));assert.equal(record.snapshots.length,1);assert.equal(record.snapshots[0].changeId,f.change.id);assert.equal(record.snapshots[0].sha256,f.contentHash);assert.equal(await fs.readFile(record.snapshots[0].path,'utf8'),f.content);assert.equal(await fs.readFile(f.entryPath,'utf8'),f.formal);assert.equal(f.change.content,f.content);
});
test('Windows observer retains target uniqueness and rejects mismatched report hash and mount revocation', {skip:process.platform!=='win32'},async t=>{
 for(const scenario of ['duplicate','hash','revoked','traversal','absolute'])await t.test(scenario,async t=>{
  const f=await snapshotFixture(t);
  if(scenario==='duplicate')f.report.targets.push({kind:'html',target:{...f.target,path:'QE16/index.html'}});
  if(scenario==='hash')f.target.contentHash='0'.repeat(64);
  if(scenario==='revoked')f.service.state.mounts.find(m=>m.id===f.scope.mountId)!.enabled=false;
  if(scenario==='traversal')f.target.path='..\\outside.html';
  if(scenario==='absolute')f.target.path=f.entryPath;
  await assert.rejects(f.service.checkTaskAcceptance(f.run.id),scenario==='duplicate'?/FAULT_DRIVER_CHECK_TARGET_AMBIGUOUS/:scenario==='hash'?/FAULT_DRIVER_CHECK_SNAPSHOT_STALE/:/PERMISSION_DENIED|INVALID_PATH/);
  await assert.rejects(fs.stat(path.join(f.scope.caseDir,'official-check-1.json')),e=>(e as NodeJS.ErrnoException).code==='ENOENT');assert.equal(await fs.readFile(f.entryPath,'utf8'),f.formal);assert.equal(f.change.content,f.content);
 });
});
