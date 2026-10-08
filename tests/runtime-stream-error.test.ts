import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createServer} from 'node:http';
import type {AddressInfo} from 'node:net';
import {createRuntime} from '../main/agent.js';
import {Service} from '../main/service.js';
import {Store} from '../main/store.js';

const providerError='OpenAI Responses stream ended before a terminal response event';
async function waitFor(predicate:()=>boolean){for(let i=0;i<500;i++){if(predicate())return;await new Promise(resolve=>setTimeout(resolve,10));}throw Error('run timeout');}
async function fixture(t:test.TestContext,factory?:ConstructorParameters<typeof Service>[3]){
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'slash-stream-error-')),store=new Store(path.join(dir,'data'));
 const service=new Service(store,()=> 'fixture-key',()=>{},factory);
 t.after(async()=>{service.dispose();await Promise.allSettled([...(service as any).agentIndex.queues.values()]);store.close();await fs.rm(dir,{recursive:true,force:true,maxRetries:5,retryDelay:30});});
 await service.workspace(path.join(dir,'project'));return{dir,store,service};
}

test('真实Responses缺少终态事件：Pi原生重试耗尽保留错误和部分回复，不执行未确认write_draft',async t=>{
 let requests=0,mountId='';
 const server=createServer(async(req,res)=>{
  for await(const _ of req){}requests++;
  res.writeHead(200,{'content-type':'text/event-stream'});
  const event=(value:unknown)=>res.write('data: '+JSON.stringify(value)+'\n\n');
  event({type:'response.output_item.added',output_index:0,item:{type:'message',id:'msg-fixture',role:'assistant',content:[]}});
  event({type:'response.output_text.delta',output_index:0,delta:'流结束前的部分回复'});
  const tool={type:'function_call',id:'fc-fixture',call_id:'call-fixture',name:'write_draft',arguments:JSON.stringify({mountId,path:'should-not-execute.md',content:'unconfirmed draft'})};
  event({type:'response.output_item.added',output_index:1,item:tool});
  event({type:'response.output_item.done',output_index:1,item:tool});
  res.end();
 });
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
 t.after(async()=>{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));});
 const {dir,store,service}=await fixture(t,createRuntime);mountId=service.state.mounts.find(m=>m.name==='成果')!.id;
 await fs.mkdir(path.join(dir,'data','agent'),{recursive:true});await fs.writeFile(path.join(dir,'data','agent','settings.json'),JSON.stringify({retry:{maxRetries:1,baseDelayMs:10,provider:{maxRetries:0}}}));
 service.state.models=[{id:'responses-fixture',name:'Responses fixture',provider:'custom',modelId:'fixture',baseUrl:`http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`,hasKey:true,protocol:'openai-responses'}];service.state.defaultModelId='responses-fixture';service.save();
 const conversation=service.conversation(),runId=await service.send(conversation,'检查流错误');
 await waitFor(()=>service.state.runs.find(r=>r.id===runId)?.status==='failed');
 const run=service.state.runs.find(r=>r.id===runId)!;
 assert.match(run.error??'',/MODEL_RESPONSE_ERROR: .*OpenAI Responses stream ended before a terminal response event/);
 assert.equal(run.resumable,true);assert.equal(requests,2);assert.equal(service.state.changes.length,0);
 assert.ok(service.state.conversations.find(c=>c.id===conversation)?.messages.some(m=>m.runId===runId&&m.text.includes('流结束前的部分回复')));
 assert.equal(store.operationsForRun(runId).some(op=>op.tool==='write_draft'),false);
 assert.equal(store.get<any>('run-checkpoint:'+runId,null).safeToResume,true);
});

test('非宿主取消的Pi aborted保留具体错误，失败任务可继续且草稿检查点保留',async t=>{
 const {store,service}=await fixture(t,async options=>({
  messages:[{role:'assistant',stopReason:'aborted',errorMessage:providerError}],sessionFile:'fixture.jsonl',abort:async()=>{},dispose:()=>{},
  prompt:async()=>{const output=options.mounts.find(m=>m.name==='成果')!;options.draft(await options.files.draft(output.id,'partial.md','retained draft',options.runId));options.delta('已生成的部分回复');},
 } as never));
 const conversation=service.conversation(),runId=await service.send(conversation,'检查aborted错误');
 await waitFor(()=>service.state.runs.find(r=>r.id===runId)?.status==='failed');
 const run=service.state.runs.find(r=>r.id===runId)!;
 assert.equal(run.error,'Error: MODEL_RESPONSE_ABORTED: '+providerError);assert.equal(run.resumable,true);
 assert.equal(service.state.changes[0]?.content,'retained draft');assert.equal(store.get<any>('run-checkpoint:'+runId,null).safeToResume,true);
});

test('真正用户停止仍为cancelled，即使Pi随后返回含供应商错误的aborted消息',async t=>{
 let started!:()=>void;const ready=new Promise<void>(resolve=>{started=resolve;});
 const {service}=await fixture(t,async options=>({
  messages:[{role:'assistant',stopReason:'aborted',errorMessage:providerError}],sessionFile:'fixture.jsonl',abort:async()=>{},dispose:()=>{},
  prompt:async()=>{started();await new Promise<void>(resolve=>options.signal!.addEventListener('abort',()=>resolve(),{once:true}));},
 } as never));
 const conversation=service.conversation(),runId=await service.send(conversation,'随后手动停止');await ready;service.cancel(runId);
 await waitFor(()=>service.state.runs.find(r=>r.id===runId)?.status==='cancelled');
 const run=service.state.runs.find(r=>r.id===runId)!;assert.equal(run.error,undefined);assert.equal(run.resumable,false);
});
