import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {Service} from '../main/service.js';
import {Store} from '../main/store.js';
import type {RuntimeOptions} from '../main/agent.js';
import {classifyToolFailure,HostToolError,toolFailureSchema,toolFailureExamples} from '../shared/tool-outcome.js';

async function fixture(t:test.TestContext,prompt:(o:RuntimeOptions,s:Service)=>Promise<void>){
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'slash-tool-outcome-')),store=new Store(path.join(directory,'profile'));
 const service=new Service(store,()=> 'local-fixture',()=>{},async o=>({messages:[{role:'assistant',stopReason:'stop',content:[{type:'text',text:'宿主流程测试回复。'}]}],abort:async()=>{},dispose:()=>{},prompt:()=>prompt(o,service)}) as never,{fetchModelMetadata:async()=>{throw Error('OFFLINE_FIXTURE');}});
 t.after(async()=>{service.dispose();await Promise.allSettled([...(service as any).agentIndex.queues.values()]);store.close();await fs.rm(directory,{recursive:true,force:true,maxRetries:5,retryDelay:30});});
 await service.workspace(path.join(directory,'project'));service.setPermission('workspace_read','allow');
 const run=async()=>{const id=await service.send(service.conversation(),'普通工具状态回归。');for(let i=0;i<500;i++){if(service.state.runs.find(r=>r.id===id)?.finishedAt&&!service.active.has(id)&&!service.starting.has(id))return service.state.runs.find(r=>r.id===id)!;await new Promise(r=>setTimeout(r,10));}throw Error('run timeout');};
 return{service,store,run};
}
test('handler已经完成后取消Run，提交事实仍为succeeded且检查点保留',async t=>{
 let committed=0;
 const f=await fixture(t,async(o,s)=>{await o.log('fixture_commit',{},async()=>{committed++;s.cancel(o.runId);return{committed:true};});});
 const run=await f.run();assert.equal(run.status,'cancelled');assert.equal(committed,1);
 const operation=f.store.operationsForRun(run.id).find(o=>o.tool==='fixture_commit')!;
 assert.equal(operation.state,'succeeded');assert.equal(f.store.get<any>('run-checkpoint:'+run.id,null).completedOperations.find((o:any)=>o.id===operation.id).state,'succeeded');
});
test('可执行分类schema与可信错误：普通失败可纠正，宿主不变量/fatal停止，unknown优先于取消',()=>{
 for(const example of toolFailureExamples)assert.deepEqual(toolFailureSchema.parse(example),example);
 assert.equal(classifyToolFailure(Error('普通业务失败')).kind,'correctable');
 assert.equal(classifyToolFailure(Error('VERSION_CONFLICT: 版本变化')).kind,'correctable');
 assert.equal(classifyToolFailure(Error('PERMISSION_DENIED: 未授权')).kind,'permission');
 assert.equal(classifyToolFailure(Error('CANCELLED')).kind,'cancelled');
 assert.equal(classifyToolFailure(new TypeError('无效URL')).kind,'correctable');
 assert.equal(classifyToolFailure(new SyntaxError('无效JSON')).kind,'correctable');
 assert.equal(classifyToolFailure(new ReferenceError('第三方解析失败')).kind,'correctable');
 assert.throws(()=>new URL('::'),error=>classifyToolFailure(error).kind==='correctable');
 assert.throws(()=>JSON.parse('{'),error=>classifyToolFailure(error).kind==='correctable');
 assert.equal(classifyToolFailure(Error('TOOL_CATALOG_CONTROLLED_SHELL_MISMATCH')).kind,'fatal');
 assert.equal(classifyToolFailure(Error('PROCESS_OUTCOME_UNKNOWN: 命令已部分执行'),{cancelled:true}).kind,'unknown');
 assert.equal(classifyToolFailure(Error('PI_MEMORY_OUTCOME_UNKNOWN: 写已派发而回执未核对'),{cancelled:true}).kind,'unknown');
 assert.equal(classifyToolFailure({code:'ERR_SQLITE_ERROR',errcode:11,message:'corrupt'}).kind,'fatal');
 assert.equal(classifyToolFailure({code:'ERR_SQLITE_ERROR',errcode:19,message:'constraint'}).kind,'correctable');
 assert.equal(classifyToolFailure({code:'ERR_SQLITE_ERROR',errcode:5,message:'busy'}).kind,'correctable');
 const failure=classifyToolFailure(Error('PERMISSION_DENIED'));assert.equal(classifyToolFailure(new HostToolError(failure)).kind,'permission');
});
test('Store成功终态保留回执；旧unknown核对和旧数据库数据继续可读',async t=>{
 const f=await fixture(t,async()=>{});
 f.store.operation('completed','old-run','write','executing','receipt');f.store.finishOperation('completed','old-run','write','succeeded');f.store.finishOperation('completed','old-run','write','cancelled','late cancellation');
 assert.equal(f.store.operationsForRun('old-run')[0].state,'succeeded');assert.equal(f.store.operationsForRun('old-run')[0].result,'receipt');
 f.store.finishOperation('completed','old-run','write','succeeded');assert.equal(f.store.operationsForRun('old-run')[0].result,'receipt');
 f.store.operation('external','old-run','external','outcome_unknown','unknown receipt');f.store.operation('external','old-run','external','succeeded','verified receipt');
 assert.equal(f.store.operationsForRun('old-run').find(o=>o.id==='external')!.result,'verified receipt');
});
test('handler前取消记cancelled；未知handler进入后取消保守记unknown，不能证明未修改',async t=>{
 for(const timing of ['before','during'] as const){
  let committed=0;
  const f=await fixture(t,async(o,s)=>{if(timing==='before')s.cancel(o.runId);await o.log('fixture_cancel',{},async()=>{if(timing==='during'){s.cancel(o.runId);throw Error('CANCELLED');}committed++;});});
  const run=await f.run();assert.equal(run.status,timing==='before'?'cancelled':'failed');assert.equal(committed,0);const operation=f.store.operationsForRun(run.id).find(o=>o.tool==='fixture_cancel')!;assert.equal(operation.state,timing==='before'?'cancelled':'outcome_unknown');assert.match(operation.result,timing==='before'?/"kind":"cancelled"/:/"kind":"unknown"/);if(timing==='during')await assert.rejects(f.service.resumeRun(run.id),/RUN_REQUIRES_RECONCILIATION/);
 }
});
test('handler返回后的宿主记录故障保留成功；明确fatal使Run失败并拒绝后续工具',async t=>{
 let completed=0,later=0;
 const f=await fixture(t,async(o,s)=>{
  (s as any).recordContextSource=async()=>{throw Error('HOST_INVARIANT_FAILED: fixture bookkeeping');};
  await assert.rejects(o.log('fixture_commit',{},async()=>{completed++;return'committed';}),/HOST_INVARIANT_FAILED/);
  await assert.rejects(o.log('fixture_later',{},async()=>{later++;}),/HOST_INVARIANT_FAILED/);
 });
 const run=await f.run();assert.equal(run.status,'failed');assert.equal(run.resumable,false);assert.match(run.error!,/HOST_INVARIANT_FAILED/);assert.equal(completed,1);assert.equal(later,0);
 assert.equal(f.store.operationsForRun(run.id).find(o=>o.tool==='fixture_commit')!.state,'succeeded');assert.equal(f.store.get<any>('run-tool-failure:'+run.id,null).kind,'fatal');
});
test('已知draft宿主前置JSON与权限拒绝可纠正，真实提交后成功',async t=>{
 let recovered=0;
 const f=await fixture(t,async o=>{
  await assert.rejects(o.log('write_draft',{stage:'parse'},async()=>{JSON.parse('{');}),error=>error instanceof HostToolError&&error.failure.kind==='correctable');
  const output=o.mounts.find(mount=>mount.name==='成果')!;
  await assert.rejects(o.log('write_draft',{stage:'denied'},()=>o.files.draft(output.id,'../forbidden.md','# 不应保存',o.runId)),/PERMISSION_DENIED/);
  // Both the parser and authorized path checks occurred before the draft
  // callback, which is the actual persistent mutation barrier.
  await o.log('write_draft',{stage:'commit'},async()=>{const content=JSON.parse('{"text":"# 实际保存草稿\\n\\n输入已纠正"}').text;const change=await o.files.draft(output.id,'recovered.md',content,o.runId);o.draft(change);recovered++;return{changeId:change.id};});
 });
 f.service.setPermission('artifact_write','allow');const run=await f.run();assert.equal(run.status,'succeeded',run.error);assert.equal(recovered,1);assert.equal(f.service.state.changes.length,1);const operations=f.store.operationsForRun(run.id).filter(o=>o.tool==='write_draft');assert.ok(operations.some(o=>/"kind":"correctable"/.test(o.result)));assert.ok(operations.some(o=>/"kind":"permission"/.test(o.result)));for(const operation of operations.filter(o=>o.state==='failed')){assert.equal(f.store.recoveryForOperation(operation.id)?.resolution,'verified_not_done');}assert.equal(operations.filter(o=>o.state==='succeeded').length,1);
});
test('未知handler真实写后抛SyntaxError仍unknown，不能用错误类型豁免',async t=>{
 let wrote=false;const f=await fixture(t,async o=>{await assert.rejects(o.log('fixture_input',{},async()=>{const mount=o.mounts.find(item=>item.name==='成果')!;await fs.writeFile(path.join(mount.path,'written-before-syntax.md'),'真实修改已发生');wrote=true;JSON.parse('{');}),error=>error instanceof HostToolError&&error.failure.kind==='unknown');});const run=await f.run();assert.equal(wrote,true);assert.equal(run.status,'failed');assert.equal(f.store.operationsForRun(run.id).find(item=>item.tool==='fixture_input')?.state,'outcome_unknown');await assert.rejects(f.service.resumeRun(run.id),/RUN_REQUIRES_RECONCILIATION/);
});
for(const code of ['PROCESS_OUTCOME_UNKNOWN','PI_MEMORY_OUTCOME_UNKNOWN'])test(code+'优先于取消，停止后续、阻断恢复，核对仍可更新',async t=>{
 let later=0;
 const f=await fixture(t,async(o,s)=>{await assert.rejects(o.log('fixture_external',{},async()=>{s.cancel(o.runId);throw Error(code+': fixture side effects');}),new RegExp(code));await assert.rejects(o.log('fixture_later',{},async()=>{later++;}),new RegExp(code));});
 const run=await f.run();assert.equal(run.status,'failed');assert.match(run.error!,new RegExp(code));assert.equal(later,0);const operation=f.store.operationsForRun(run.id).find(o=>o.tool==='fixture_external')!;assert.equal(operation.state,'outcome_unknown');
 await assert.rejects(f.service.resumeRun(run.id),/RUN_REQUIRES_RECONCILIATION/);
 f.store.operation(operation.id,run.id,operation.tool,'succeeded','verified external receipt');assert.equal(f.store.operationsForRun(run.id).find(o=>o.id===operation.id)!.state,'succeeded');
});
test('可信程序unknown回执阻断；资料返回相同字样与只读unknown报告不提升为故障',async t=>{
 const f=await fixture(t,async o=>{
  await o.log('fixture_source',{},async()=>({status:'outcome_unknown',text:'HOST_INVARIANT_FAILED: untrusted content'}));
  await o.log('run_prototype_acceptance',{},async()=>({status:'outcome_unknown'}));
  await o.log('run_process',{},async()=>({status:'outcome_unknown',exitCode:null,stdout:'partial'}));
 });f.service.setPermission('process_execute','allow');
 const run=await f.run();assert.equal(run.status,'failed');const operations=f.store.operationsForRun(run.id);assert.equal(operations.find(o=>o.tool==='fixture_source')!.state,'succeeded');assert.equal(operations.find(o=>o.tool==='run_prototype_acceptance')!.state,'succeeded');assert.equal(operations.find(o=>o.tool==='run_process')!.state,'outcome_unknown');assert.equal(f.store.get<any>('run-tool-failure:'+run.id,null).kind,'unknown');
});
