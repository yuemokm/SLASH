import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {Service} from '../main/service.js';
import {Store} from '../main/store.js';
import {createRuntime,type RuntimeOptions} from '../main/agent.js';
import {runDraftRecoveryLocal} from '../scripts/draft-edit-recovery-local.mjs';

test('native Pi → localhost HTTP → real Service: rejected inputs, atomic index7 failure, bounded read and correct pending recovery',async()=>{
 const report=await runDraftRecoveryLocal({modules:{Service,Store,createRuntime}});
 assert.equal(report.status,'passed');assert.equal(report.cloudExecuted,false);assert.equal(report.requests,5);assert.equal(report.checks.length,7);
 console.log(`Local recovery evidence: ${report.output}`);
});

test('Service original 120-call budget includes unique draft input rejections; duplicate and terminal callbacks do not spend it again',async t=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'slash-draft-rejection-budget-')),store=new Store(path.join(directory,'profile'));
 let options:RuntimeOptions|undefined,executed=0,brokerCalls=0;
 const rejection=(index:number)=>({tool:'edit_draft' as const,toolCallHash:createHash('sha256').update(`safe-rejection-${index}`).digest('hex'),stage:'pi_schema' as const,reason:'missing_replacement' as const,issueCount:1,state:'failed' as const});
 const service=new Service(store,()=> 'local-budget-fixture',()=>{},async runtimeOptions=>{
  options=runtimeOptions;
  const broker=(service as any).capabilityBroker,originalExecute=broker.execute.bind(broker);broker.execute=async(...args:unknown[])=>{brokerCalls++;return originalExecute(...args);};
  return{messages:[],abort:async()=>{},dispose:()=>{},prompt:async()=>{
   for(let index=0;index<120;index++){
    runtimeOptions.draftInputRejected!(rejection(index));
    if(index===0){runtimeOptions.draftInputRejected!(rejection(index));runtimeOptions.draftInputRejected!(rejection(index));}
   }
   const rejected=store.operationsForRun(runtimeOptions.runId).filter(operation=>operation.tool==='edit_draft');
   assert.equal(rejected.length,120,'duplicate native notifications must not add operations or consume budget');
   assert.equal(rejected.every(operation=>operation.state==='failed'&&JSON.parse(operation.result).code==='DRAFT_INPUT_INVALID'),true,'the 120th unique rejection remains inside the original budget');
   assert.equal(brokerCalls,0);assert.equal(service.state.pendingApprovals!.length,0);
   const target={mountId:service.state.mounts.find(mount=>mount.name==='成果')!.id,path:'note.md'};
   await runtimeOptions.log('read_draft',target,async()=>{executed++;return runtimeOptions.readDraft!(target);});
  }} as never;
 },{fetchModelMetadata:async()=>{throw Error('OFFLINE_BUDGET_FIXTURE');}});
 t.after(async()=>{service.dispose();await Promise.allSettled([...(service as any).agentIndex.queues.values()]);store.close();const relative=path.relative(path.resolve(os.tmpdir()),path.resolve(directory));assert.ok(relative&&!relative.startsWith('..'+path.sep)&&relative!=='..'&&!path.isAbsolute(relative));await fs.rm(directory,{recursive:true,force:true,maxRetries:5,retryDelay:30});});
 await service.workspace(path.join(directory,'project'));service.setPermission('workspace_read','allow');service.setPermission('artifact_write','ask');
 const output=service.state.mounts.find(mount=>mount.name==='成果')!;await fs.writeFile(path.join(output.path,'note.md'),'unchanged original');
 const runId=await service.send(service.conversation(),'预算隔离测试。','build','standard');
 for(let index=0;index<500&&!service.state.runs.find(run=>run.id===runId)?.finishedAt;index++)await new Promise(resolve=>setTimeout(resolve,10));
 const run=service.state.runs.find(item=>item.id===runId)!;assert.equal(run.status,'failed');assert.match(run.error??'',/TOOL_BUDGET_EXCEEDED.*120/);
 const operations=store.operationsForRun(runId),read=operations.filter(operation=>operation.tool==='read_draft');assert.equal(read.length,1);assert.equal(read[0].state,'failed');assert.match(read[0].result,/^TOOL_BUDGET_EXCEEDED/);assert.equal(operations.filter(operation=>operation.tool==='edit_draft').length,120);
 assert.equal(executed,0);assert.equal(brokerCalls,0);assert.equal(service.state.pendingApprovals!.length,0);assert.equal(service.state.changes.length,0);assert.equal(await fs.readFile(path.join(output.path,'note.md'),'utf8'),'unchanged original');
 const before={run:JSON.stringify(run),operations:JSON.stringify(operations),checkpoint:JSON.stringify(store.get('run-checkpoint:'+runId,null)),approvals:JSON.stringify(service.state.pendingApprovals)};
 options!.draftInputRejected!(rejection(999));options!.draftInputRejected!(rejection(0));
 assert.deepEqual({run:JSON.stringify(run),operations:JSON.stringify(store.operationsForRun(runId)),checkpoint:JSON.stringify(store.get('run-checkpoint:'+runId,null)),approvals:JSON.stringify(service.state.pendingApprovals)},before);
});
