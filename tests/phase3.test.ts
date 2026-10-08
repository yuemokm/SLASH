import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ControlledSubAgentBroker,SharedResourceCoordinator,runParallelTasks,selectModelRoute} from '../main/phase3.js';

const context={parentRunId:'run-1',mode:'build' as const,permissionMode:'standard' as const,capabilities:{workspace_read:'allow' as const,web_read:'allow' as const,artifact_write:'deny' as const},mountIds:['mount-1']};

test('受控子 Agent 只允许白名单并继承父 Run 权限和目录范围',async()=>{
 const broker=new ControlledSubAgentBroker();
 assert.equal(broker.authorize({parentRunId:'run-1',tool:'read_file',input:{},capability:'workspace_read',mountId:'mount-1'},context).allowed,true);
 assert.equal(broker.authorize({parentRunId:'run-1',tool:'powershell',input:{},capability:'process_execute'},context).code,'SUB_AGENT_TOOL_DENIED');
 assert.equal(broker.authorize({parentRunId:'run-1',tool:'read_file',input:{},capability:'workspace_read',mountId:'mount-2'},context).code,'SUB_AGENT_SCOPE_DENIED');
 assert.equal(broker.authorize({parentRunId:'run-1',tool:'list_product_records',input:{},capability:'artifact_write'},context).code,'SUB_AGENT_PERMISSION_DENIED');
 await assert.rejects(()=>broker.call({parentRunId:'run-1',tool:'powershell',input:{},capability:'process_execute'},context,async()=>1),/SUB_AGENT_TOOL_DENIED/);
});

test('模型路由按任务类型、预算和回退策略选择',()=>{
 const candidates=[{modelId:'fast',provider:'p',taskTypes:['research'] as const,costPer1k:1,priority:1,available:true},{modelId:'deep',provider:'p',taskTypes:['review'] as const,costPer1k:5,priority:10,reasoning:'advanced' as const,available:true}];
 assert.equal(selectModelRoute(candidates,{strategy:'task_type',taskType:'review'}).modelId,'deep');
 assert.equal(selectModelRoute(candidates,{strategy:'cost_aware',taskType:'general',budget:2}).modelId,'fast');
 assert.equal(selectModelRoute(candidates,{strategy:'fallback',taskType:'general',preferredModelId:'missing',fallbackModelIds:['deep']}).modelId,'deep');
});

test('并行任务限制数量、并发和超时且保留每项结果',async()=>{
 const result=await runParallelTasks([{id:'a',run:async()=>1},{id:'b',run:async()=>{throw Error('bad')}}],{maxTasks:2,maxConcurrency:1,taskTimeoutMs:1000});
 assert.deepEqual(result.map(item=>item.status),['succeeded','failed']);
 await assert.rejects(()=>runParallelTasks(Array.from({length:3},(_,i)=>({id:String(i),run:async()=>i})),{maxTasks:2}),/PARALLEL_LIMIT/);
});

test('共享资源诊断和锁定拒绝静默覆盖',()=>{
 let tick=Date.now();const coordinator=new SharedResourceCoordinator(()=>tick,()=> 'lock-1');const resource={resourceId:'share-1',path:'a.md'};
 const lock=coordinator.acquire(resource,'run-1','write',5000);assert.equal(lock.id,'lock-1');
 assert.equal(coordinator.diagnose(resource).code,'LOCK_HELD');
 assert.throws(()=>coordinator.acquire(resource,'run-2','write'),/LOCK_HELD/);
 assert.equal(coordinator.diagnose(resource,'v1','v2').code,'LOCK_HELD');
 assert.equal(coordinator.release(lock.id,'run-1'),true);
 assert.equal(coordinator.diagnose(resource,'v1','v2').code,'VERSION_CONFLICT');
 tick+=6000;assert.equal(coordinator.diagnose(resource).code,'NO_CONFLICT');
});
