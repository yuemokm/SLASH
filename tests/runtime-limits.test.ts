import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {Service} from '../main/service.js';
import {Store} from '../main/store.js';
import type {RuntimeOptions} from '../main/agent.js';
import {DEFAULT_RUN_LIMITS} from '../main/run-limits.js';

async function fixture(t:test.TestContext,handler:(o:RuntimeOptions,s:Service)=>Promise<void>){
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'slash-runtime-limits-')),store=new Store(path.join(dir,'data'));
 const service=new Service(store,()=> 'offline-key',()=>{},async o=>({messages:[{role:'assistant',stopReason:'stop'}],abort:async()=>{},dispose:()=>{},prompt:async()=>handler(o,service)}));
 t.after(async()=>{t.mock.timers.reset();service.dispose();await Promise.allSettled([...(service as any).agentIndex.queues.values()]);store.close();await fs.rm(dir,{recursive:true,force:true,maxRetries:5,retryDelay:30});});
 await service.workspace(path.join(dir,'project'));return{service,store};
}
async function done(s:Service,id:string){for(let i=0;i<500;i++){const run=s.state.runs.find(item=>item.id===id);if(run&&['succeeded','failed','interrupted','cancelled'].includes(run.status))return run;await new Promise(resolve=>setTimeout(resolve,10));}throw Error('offline task timeout');}

test('42次合法read_draft经过实际Service网关均成功，不在原40次上限截断',async t=>{
 let reads=0;
 const {service,store}=await fixture(t,async(o,s)=>{const target={mountId:s.state.mounts.find(m=>m.name==='成果')!.id,path:'index.html'};for(let i=0;i<42;i++){const receipt=await o.log('read_draft',target,()=>o.readDraft!(target));assert.equal(receipt.content,'<main>已保存成果</main>');reads++;}});
 const output=service.state.mounts.find(m=>m.name==='成果')!;await fs.writeFile(path.join(output.path,'index.html'),'<main>已保存成果</main>');
 const id=await service.send(service.conversation(),'检查授权成果');assert.equal((await done(service,id)).status,'succeeded');assert.equal(reads,42);assert.equal(store.operationsForRun(id).filter(op=>op.tool==='read_draft'&&op.state==='succeeded').length,42);
});

test('虚拟宿主时钟10分钟仍运行，30分钟预算准确中止并保留草稿和可恢复错误',{timeout:10_000},async t=>{
 let started!:()=>void;const ready=new Promise<void>(resolve=>{started=resolve;});let signal:AbortSignal|undefined;
 const {service,store}=await fixture(t,async(o,s)=>{signal=o.signal;const output=s.state.mounts.find(m=>m.name==='成果')!;o.draft(await o.files.draft(output.id,'partial.html','<main>保留未完成草稿</main>',o.runId));started();await new Promise<void>(resolve=>signal!.addEventListener('abort',()=>resolve(),{once:true}));});
 t.mock.timers.enable({apis:['setTimeout']});
 const id=await service.send(service.conversation(),'复杂原型需要持续制作');await ready;
 assert.equal(DEFAULT_RUN_LIMITS.durationMs,30*60*1000);
 t.mock.timers.tick(10*60*1000);assert.equal(service.state.runs.find(r=>r.id===id)?.status,'running');assert.equal(signal?.aborted,false);
 t.mock.timers.tick(20*60*1000-1);assert.equal(service.state.runs.find(r=>r.id===id)?.status,'running');assert.equal(signal?.aborted,false);
 t.mock.timers.tick(1);assert.equal(signal?.aborted,true);
 t.mock.timers.reset();const run=await done(service,id);assert.equal(run.status,'failed');assert.match(run.error??'',/TIME_BUDGET_EXCEEDED: 任务超过 30 分钟运行预算/);assert.equal(run.resumable,true);assert.equal(service.state.changes[0]?.content,'<main>保留未完成草稿</main>');assert.equal(store.get<any>('run-checkpoint:'+id,null).safeToResume,true);
});
