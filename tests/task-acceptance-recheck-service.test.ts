import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {Store} from '../main/store.js';
import {Service} from '../main/service.js';
import {hash} from '../main/files.js';
import type {Event,TaskAcceptanceRecheckInput} from '../shared/types.js';

async function fixture(t:test.TestContext,beforeFirstReport=false,withSource=false){
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'slash-task-recheck-')),store=new Store(path.join(dir,'profile')),events:Event[]=[];let modelCalls=0;
 const service=new Service(store,()=> 'fixture-only',event=>events.push(event),async options=>({messages:[{role:'assistant',stopReason:'stop'}],abort:async()=>{},dispose:()=>{},prompt:async()=>{modelCalls++;if(withSource){const source=service.state.mounts.find(item=>item.name==='资源')!,content=await options.files.read(source.id,'source.md');options.sourceRead!({mountId:source.id,path:'source.md',versionId:'current',contentHash:hash(content),characters:content.length,includedCharacters:content.length,truncated:false,readAt:new Date().toISOString()});}const mount=service.state.mounts.find(item=>item.name==='成果')!,change=await options.files.draft(mount.id,'note.md','# 项目使用说明\n\n选择相关资料后查看已有成果，逐项核对内容与版本。保存时先预览差异，再确认变更。\n\n项目目录保留来源和成果，后续修改可以继续查看。',options.runId);options.draft(change);if(beforeFirstReport)throw Error('INJECTED_FAILURE_BEFORE_FIRST_REPORT');}} as never),{fetchModelMetadata:async()=>{throw Error('OFFLINE_RECHECK_FIXTURE');}});
 t.after(async()=>{service.dispose();await Promise.allSettled([...(service as any).agentIndex.queues.values()]);store.close();const relative=path.relative(os.tmpdir(),dir);assert.ok(relative&&!relative.startsWith('..')&&!path.isAbsolute(relative));await fs.rm(dir,{recursive:true,force:true,maxRetries:6,retryDelay:40});});
 await service.workspace(path.join(dir,'project'));service.setPermission('workspace_read','allow');service.setPermission('artifact_write','allow');if(withSource)await fs.writeFile(path.join(service.state.mounts.find(item=>item.name==='资源')!.path,'source.md'),'真实隔离来源：核对已有成果和版本。');const runId=await service.send(service.conversation(),'写一份项目使用说明。');
 for(let i=0;i<1000&&(!service.state.runs.find(item=>item.id===runId)?.finishedAt||service.active.has(runId)||service.starting.has(runId));i++)await new Promise(resolve=>setTimeout(resolve,10));
 const run=service.state.runs.find(item=>item.id===runId)!;assert.equal(run.status,beforeFirstReport?'failed':'succeeded');const view=(await service.getTaskAcceptance(runId))!,input:TaskAcceptanceRecheckInput={runId,expectedContractHash:view.contract.contractHash,expectedReportId:view.latestReport?.id??null};const domain=(service as any).taskDomain(runId),change=service.state.changes[0];
 return{dir,store,service,events,run,view,input,domain,change,modelCalls:()=>modelCalls};
}

test('stopped task recheck keeps contract/artifact, saves new report and state event, does not inherit human delivery confirmation',async t=>{
 const f=await fixture(t),beforeContent=f.change.content,beforeContract=f.domain.getContract(f.run.id),beforeFiles=await fs.readdir(path.join(f.dir,'project'));
 const delivery=await f.service.taskDeliveryGet(f.run.id),decisions=delivery.items.filter(item=>item.status==='needs_review'&&item.allowedActions.includes('confirm')).map(item=>({itemId:item.id,action:'confirm' as const,note:'已查看本次成果与实际要求内容',evidence:{...item.requiredEvidence,locators:['note.md 全文核对']}}));assert.ok(decisions.length);
 const reviewed=await f.service.reviewTaskDelivery({runId:f.run.id,reportId:delivery.reportId,expectedBindingHash:delivery.bindingHash,decisions});assert.equal(reviewed.allowed,true);f.events.length=0;
 const next=await f.service.recheckTaskAcceptance(f.input);assert.notEqual(next.latestReport!.id,f.input.expectedReportId);assert.deepEqual(next.contract,beforeContract);assert.equal(f.change.content,beforeContent);assert.deepEqual(await fs.readdir(path.join(f.dir,'project')),beforeFiles);assert.equal(f.change.status,'pending');assert.equal(f.modelCalls(),1);assert.ok(f.events.some(event=>event.type==='state'));assert.equal(f.run.acceptance!.reportId,next.latestReport!.id);assert.equal(f.store.get<any>('state',null).runs.find((run:any)=>run.id===f.run.id).acceptance.reportId,next.latestReport!.id);assert.equal(f.store.operationsForRun(f.run.id).find(op=>op.id===next.latestReport!.id)!.tool,'task_acceptance');const current=await f.service.taskDeliveryGet(f.run.id);assert.equal(current.allowed,false);assert.deepEqual(current.recordIds,[]);assert.equal((await f.service.taskDeliveryGet(f.run.id,delivery.reportId)).allowed,true,'original human record remains bound to its original report');
});

test('recheck rejects active/starting/plan, wrong workspace, revoked read permission and stale contract/report without adding reports',async t=>{
 const f=await fixture(t),count=f.domain.listReports(f.run.id).length;
 f.service.active.set(f.run.id,{} as never);await assert.rejects(f.service.recheckTaskAcceptance(f.input),/RECHECK_UNSAFE/);f.service.active.delete(f.run.id);
 f.service.starting.add(f.run.id);await assert.rejects(f.service.recheckTaskAcceptance(f.input),/RECHECK_UNSAFE/);f.service.starting.delete(f.run.id);
 const status=f.run.status;f.run.status='running';await assert.rejects(f.service.recheckTaskAcceptance(f.input),/RECHECK_UNSAFE/);f.run.status=status;
 f.run.mode='plan';await assert.rejects(f.service.recheckTaskAcceptance(f.input),/RECHECK_UNSAFE/);f.run.mode='build';
 const key='context-manifest:'+f.run.id,scope=f.store.get<any>(key,null);f.store.set(key,{...scope,workspaceRoot:path.join(f.dir,'other-project')});await assert.rejects(f.service.recheckTaskAcceptance(f.input),/PERMISSION_DENIED/);f.store.set(key,scope);
 f.service.setPermission('workspace_read','deny');await assert.rejects(f.service.recheckTaskAcceptance(f.input),/PERMISSION_DENIED/);f.service.setPermission('workspace_read','allow');
 await assert.rejects(f.service.recheckTaskAcceptance({...f.input,expectedContractHash:'0'.repeat(64)}),/RECHECK_STALE/);await assert.rejects(f.service.recheckTaskAcceptance({...f.input,expectedReportId:'obsolete-report'}),/RECHECK_STALE/);assert.equal(f.domain.listReports(f.run.id).length,count);assert.equal(f.modelCalls(),1);
});

for(const mutation of ['authorization','contract','report','draft'])test(`recheck detects ${mutation} change during awaited validation before persisting its own report`,async t=>{
 const f=await fixture(t),count=f.domain.listReports(f.run.id).length,resolve=f.service.files.resolve.bind(f.service.files);let changed=false,reads=0;
 f.service.files.resolve=async(...args:Parameters<typeof resolve>)=>{const result=await resolve(...args);if(++reads===2){changed=true;await new Promise(done=>setImmediate(done));if(mutation==='authorization')f.service.setPermission('workspace_read','deny');else if(mutation==='contract')f.domain.appendRequest(f.run.id,{id:'concurrent-user-request',text:'明确新增的业务要求',source:'follow_up'});else if(mutation==='report'){const key=f.store.db.prepare("SELECT key FROM kv WHERE key LIKE '%:reports' AND value LIKE ?").get('%'+f.input.expectedReportId+'%')!.key;const reports=f.store.get<any[]>(String(key),[]);f.store.set(String(key),[{...reports[0],id:'concurrent-report'},...reports]);}else f.change.content+='\n并发修改后的正文';}return result;};
 await assert.rejects(f.service.recheckTaskAcceptance(f.input),mutation==='authorization'?/PERMISSION_DENIED/:/RECHECK_STALE/);assert.equal(changed,true,'fault occurs after preflight, inside actual validate snapshot');assert.equal(f.domain.listReports(f.run.id).length,count+(mutation==='report'?1:0));assert.equal(f.modelCalls(),1);assert.equal((f.service as any).taskRechecks.size,0);
});

test('unknown effects allow read-only recheck evidence but remain pending and block formal delivery and runtime replay',async t=>{
 const f=await fixture(t);f.store.operation('unknown-effect',f.run.id,'powershell','outcome_unknown','实际执行结果未知');f.store.saveRecovery({operationId:'unknown-effect',runId:f.run.id,tool:'powershell',effect:'process',dispatch:'may_have_run',resolution:'pending',evidenceRefs:['retained effect'],updatedAt:'2026-10-11T00:00:00.000Z'});const before=f.store.recoveryForOperation('unknown-effect');
 const next=await f.service.recheckTaskAcceptance(f.input);assert.notEqual(next.latestReport!.id,f.input.expectedReportId);assert.deepEqual(f.store.recoveryForOperation('unknown-effect'),before);assert.equal(f.store.operationsForRun(f.run.id).find(op=>op.id==='unknown-effect')!.state,'outcome_unknown');assert.equal(f.modelCalls(),1);await assert.rejects(f.service.taskDeliveryGet(f.run.id),/RUN_REQUIRES_RECONCILIATION/);f.run.status='failed';f.run.resumable=true;await assert.rejects(f.service.resumeRun(f.run.id),/RUN_REQUIRES_RECONCILIATION/);assert.equal(f.modelCalls(),1);
});

test('changed frozen output rejects old version; recheck is not an automatic contract or artifact update',async t=>{
 const f=await fixture(t),count=f.domain.listReports(f.run.id).length,contract=f.domain.getContract(f.run.id);f.change.content+='\n用户修改后的新版本';await assert.rejects(f.service.recheckTaskAcceptance(f.input),/RECHECK_STALE/);assert.deepEqual(f.domain.getContract(f.run.id),contract);assert.equal(f.domain.listReports(f.run.id).length,count);assert.notEqual(hash(f.change.content),contract.outputs[0].target.contentHash);
});

test('trusted stopped task before first report can obtain evidence without new model, human confirmation or unknown resolution',async t=>{
 const f=await fixture(t,true);assert.equal(f.input.expectedReportId,null);assert.equal(f.domain.listReports(f.run.id).length,0);assert.ok(f.view.contract.outputs.length);f.store.operation('unknown-before-report',f.run.id,'powershell','outcome_unknown','首报前副作用未知');f.store.saveRecovery({operationId:'unknown-before-report',runId:f.run.id,tool:'powershell',effect:'process',dispatch:'may_have_run',resolution:'pending',evidenceRefs:[],updatedAt:'2026-10-11T00:00:00.000Z'});const before=f.store.recoveryForOperation('unknown-before-report');
 const checked=await f.service.recheckTaskAcceptance(f.input);assert.ok(checked.latestReport);assert.equal(checked.contract.contractHash,f.input.expectedContractHash);assert.equal(f.modelCalls(),1);assert.deepEqual(f.store.recoveryForOperation('unknown-before-report'),before);await assert.rejects(f.service.taskDeliveryGet(f.run.id),/RUN_REQUIRES_RECONCILIATION/);assert.equal(f.change.status,'pending');
});

test('first report appearing during validation invalidates explicit no-report request and retains only concurrent evidence',async t=>{
 const f=await fixture(t,true),resolve=f.service.files.resolve.bind(f.service.files);let firstReportId='';
 f.service.files.resolve=async(...args:Parameters<typeof resolve>)=>{const value=await resolve(...args);if(!firstReportId){firstReportId='in-progress';firstReportId=(await f.service.checkTaskAcceptance(f.run.id)).id;}return value;};
 await assert.rejects(f.service.recheckTaskAcceptance(f.input),/RECHECK_STALE/);assert.equal(f.domain.listReports(f.run.id).length,1);assert.equal(f.domain.listReports(f.run.id)[0].id,firstReportId);assert.equal(f.modelCalls(),1);
});

test('recheck refreshes content-review availability without model call and rejects changed actual sourceReads',async t=>{
 const f=await fixture(t,false,true);const checked=await f.service.recheckTaskAcceptance(f.input);assert.equal(checked.latestReport!.contentReviewRequired,true);assert.equal(checked.latestReport!.contentReview,undefined);assert.equal(f.modelCalls(),1);const before=f.domain.listReports(f.run.id).length,source=f.service.state.mounts.find(item=>item.name==='资源')!;await fs.writeFile(path.join(source.path,'source.md'),'核对后外部改变的资料');await assert.rejects(f.service.recheckTaskAcceptance({...f.input,expectedReportId:checked.latestReport!.id}),/RECHECK_STALE/);assert.equal(f.domain.listReports(f.run.id).length,before);
});

test('expired old check evidence can be rechecked with identical actual versions while old report remains historical',async t=>{
 const f=await fixture(t),key=String(f.store.db.prepare("SELECT key FROM kv WHERE key LIKE '%:reports' AND value LIKE ?").get('%'+f.input.expectedReportId+'%')!.key),reports=f.store.get<any[]>(key,[]);reports[0]={...reports[0],versionState:'stale',versionReasons:['历史检查器版本证据过期']};f.store.set(key,reports);const contract=f.domain.getContract(f.run.id),checked=await f.service.recheckTaskAcceptance(f.input);assert.notEqual(checked.latestReport!.id,f.input.expectedReportId);assert.equal(checked.latestReport!.versionState,'current');assert.deepEqual(checked.contract,contract);assert.equal(f.domain.listReports(f.run.id).find((report:any)=>report.id===f.input.expectedReportId).versionState,'stale');assert.equal(f.modelCalls(),1);
});
