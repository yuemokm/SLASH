import {test} from 'node:test';
import assert from 'node:assert/strict';
import type {Run} from '../shared/types';
import {runExecutionSummary} from '../src/run-execution-summary';

const run=(status:Run['status'],extra:Partial<Run>={}):Run=>({id:'own',conversationId:'chat',startedAt:'2026-10-13T00:00:00Z',status,...extra});
test('completed short reply has no empty execution card; actual work retains its record',()=>{
 assert.equal(runExecutionSummary(run('succeeded',{plan:{status:'completed',steps:['理解任务','生成回复'],source:'heuristic',createdAt:'2026-10-13T00:00:00Z'},runtimeStatus:{activity:'settled',updatedAt:'2026-10-13T00:00:00Z'}})).visible,false);
 assert.equal(runExecutionSummary(run('succeeded'),{hasTools:true}).visible,true);
 assert.match(runExecutionSummary(run('succeeded'),{pendingChanges:2}).title,/2 份草稿待应用/);
});
test('terminal host status wins over stale phase and retry/tool activity',()=>{
 for(const [status,label] of [['cancelled','任务已取消'],['failed','执行失败'],['interrupted','任务已中断'],['succeeded','任务已完成']] as const){
  assert.equal(runExecutionSummary(run(status,{phase:'tool_call',runtimeStatus:{activity:'retry_wait',updatedAt:'2026-10-13T00:00:00Z',retry:{attempt:2,delayMs:1000,status:'waiting'}}})).title,label);
 }
});
test('approval, plan confirmation, recovery and queued Run cannot be filtered out',()=>{
 for(const status of ['queued','waiting_user','awaiting_plan','failed','interrupted','cancelling','cancelled'] as const)assert.equal(runExecutionSummary(run(status)).visible,true);
 assert.equal(runExecutionSummary(run('succeeded',{resumable:true})).visible,true);
 assert.equal(runExecutionSummary(run('succeeded',{piPlanReview:{status:'awaiting_user'} as Run['piPlanReview']})).visible,true);
});
test('active retry and tools show concrete host state; metadata is not counted as read source',()=>{
 assert.equal(runExecutionSummary(run('running',{runtimeStatus:{activity:'tool',updatedAt:'2026-10-13T00:00:00Z'}}),{active:true}).title,'正在执行工具');
 assert.equal(runExecutionSummary(run('running',{runtimeStatus:{activity:'retry_wait',updatedAt:'2026-10-13T00:00:00Z',retry:{attempt:2,delayMs:1000,status:'waiting'}}})).title,'等待模型重试 · 第 2 次');
 const workflow={receipts:[{contentStatus:'metadata_only'},{contentStatus:'complete'}]} as unknown as Run['workflow'];
 assert.equal(runExecutionSummary(run('succeeded',{workflow})).detail,'已读取 1 份资料');
});
