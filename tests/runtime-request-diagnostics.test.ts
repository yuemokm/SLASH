import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createServer} from 'node:http';
import type {AddressInfo} from 'node:net';
import type {AgentSession} from '@earendil-works/pi-coding-agent';
import {observeRuntimePayloads,runtimeRequestDiagnostics} from '../main/runtime-request-diagnostics.js';
import {Service} from '../main/service.js';
import {Store} from '../main/store.js';
import {createRuntime} from '../main/agent.js';

test('fixed request projection never reads messages/tools/headers or retains arbitrary strings',()=>{
 const payload={thinking:{type:'disabled'},reasoning_effort:'PRIVATE',max_tokens:12000,max_completion_tokens:Infinity,max_output_tokens:-1,get messages(){throw Error('private');},get tools(){throw Error('private');},get headers(){throw Error('private');},api_key:'PRIVATE',reasoning_content:'PRIVATE'};
 assert.deepEqual(runtimeRequestDiagnostics(payload),{source:'pi-on-payload',thinkingType:'disabled',reasoningEffort:'unrecognized',maxTokens:12000});
 assert.deepEqual(runtimeRequestDiagnostics({}),{source:'pi-on-payload',thinkingType:'absent',reasoningEffort:'absent'});
 assert.equal(runtimeRequestDiagnostics({thinking:{type:'PRIVATE'}}).thinkingType,'unrecognized');
 assert.equal(runtimeRequestDiagnostics({reasoning:{effort:'high'}}).reasoningEffort,'high');
});

test('official onPayload chain preserves replacement, in-place mutation, undefined, null and thrown errors',async()=>{
 for(const mode of ['replacement','mutation','undefined','null','throw','observer-throw']){
  const body={thinking:{type:'enabled'},messages:['PRIVATE']};let seen:unknown,returned:unknown,called=0;
  const replacement={thinking:{type:'disabled'},messages:['PRIVATE']},error=Error('callback failure');
  const original=async(_model:unknown,_context:unknown,options:any)=>{returned=await options.onPayload(body,{});return returned;};
  const session={agent:{streamFunction:original}} as unknown as Pick<AgentSession,'agent'>;
  observeRuntimePayloads(session,value=>{if(mode==='observer-throw')throw Error('diagnostic unavailable');seen=value;});
  const options={onPayload:async(value:typeof body)=>{called++;if(mode==='throw')throw error;if(mode==='replacement')return replacement;if(mode==='mutation')value.thinking.type='disabled';if(mode==='null')return null;return undefined;}};
  const pending=(session.agent.streamFunction as any)({}, {},options);
  if(mode==='throw'){await assert.rejects(pending,e=>e===error);assert.equal(seen,undefined);}else{await pending;assert.equal(returned,mode==='replacement'?replacement:mode==='null'?null:undefined);if(mode!=='observer-throw')assert.equal((seen as any).thinkingType,mode==='replacement'||mode==='mutation'?'disabled':mode==='null'?'absent':'enabled');}
  assert.equal(called,1);assert.equal(JSON.stringify(seen??{}).includes('PRIVATE'),false);
 }
});

for(const withDraft of [false,true])test(`actual main Agent/Pi HTTP diagnostics persist safely on length (${withDraft?'visible body + draft':'thinking only, zero drafts'})`,async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'slash-wire-diagnostic-')),store=new Store(path.join(dir,'data'));let service:Service,target:{mountId:string;path:string},calls=0;const flags:unknown[]=[];
 const server=createServer(async(req,res)=>{
  const chunks:Buffer[]=[];for await(const chunk of req)chunks.push(Buffer.from(chunk));const body=JSON.parse(Buffer.concat(chunks).toString());flags.push(runtimeRequestDiagnostics(body));calls++;
  res.writeHead(200,{'content-type':'text/event-stream'});const base={id:'local-only',object:'chat.completion.chunk',created:1,model:'DeepSeek-V4-Flash-0731'};
  const first=withDraft&&calls===1,delta=first?{role:'assistant',tool_calls:[{index:0,id:'draft-tool',type:'function',function:{name:'write_draft',arguments:JSON.stringify({...target,content:'# Local fixture draft'})}}]}:withDraft?{role:'assistant',content:'Partial visible fixture'}:{role:'assistant',reasoning_content:'PRIVATE_THINKING_FIXTURE'};
  res.write('data: '+JSON.stringify({...base,choices:[{index:0,delta,finish_reason:null}]})+'\n\n');res.end('data: '+JSON.stringify({...base,choices:[{index:0,delta:{},finish_reason:first?'tool_calls':'length'}],usage:{prompt_tokens:20,completion_tokens:12,total_tokens:32}})+'\n\ndata: [DONE]\n\n');
 });await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
 service=new Service(store,()=> 'local-fixture-key',()=>{},createRuntime);await service.workspace(path.join(dir,'project'));service.setPermission('workspace_read','allow');service.setPermission('artifact_write','allow');target={mountId:service.state.mounts.find(m=>m.name==='成果')!.id,path:'fixture.md'};
 service.state.models=[{id:'local-wire',name:'Local wire fixture',provider:'loopback',baseUrl:`http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`,modelId:'DeepSeek-V4-Flash-0731',protocol:'openai-completions',hasKey:true}];service.state.defaultModelId='local-wire';service.save();
 t.after(async()=>{for(const id of service.active.keys())service.cancel(id);service.dispose();await Promise.allSettled([...(service as any).agentIndex.queues.values()]);store.close();server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));await fs.rm(dir,{recursive:true,force:true,maxRetries:5,retryDelay:30});});
 const id=await service.send(service.conversation(),'Local diagnostic fixture only.');const deadline=Date.now()+15000;while((!service.state.runs.find(r=>r.id===id)?.finishedAt||service.active.size)&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,20));
 const run=service.state.runs.find(r=>r.id===id)!;assert.equal(run.status,'interrupted');assert.equal(calls,withDraft?2:1);assert.equal(run.interruptionReason,'model_output_limit');assert.equal(run.reasoning?.status,'unknown');assert.equal(run.modelLimits?.maxTokensSource,'unverified-compatibility');
 assert.deepEqual(run.runtimeStatus?.requestDiagnostics,flags.at(-1));assert.equal(run.runtimeStatus?.requestDiagnostics?.thinkingType,'disabled');assert.equal(run.runtimeStatus?.requestDiagnostics?.reasoningEffort,'absent');assert.equal(run.runtimeStatus?.requestDiagnostics?.maxCompletionTokens,12000);
 assert.equal(run.runtimeStatus?.responseDiagnostics?.stopReason,'length');assert.equal(run.runtimeStatus?.responseDiagnostics?.textEmpty,!withDraft);assert.equal(run.runtimeStatus?.responseDiagnostics?.blockCounts.thinking,withDraft?0:1);
 assert.match(run.error??'',withDraft?/已有可见正文；已生成草稿记录 1 份/:/无可见正文；未生成草稿记录/);assert.match(run.error??'',/不代表上游真实限额/);assert.doesNotMatch(run.error??'',/思考已关闭|可以继续生成/);
 const saved=store.get<any>('state',null).runs.find((r:any)=>r.id===id);assert.deepEqual(saved.runtimeStatus,run.runtimeStatus);assert.doesNotMatch(JSON.stringify(saved.runtimeStatus),/PRIVATE|local-fixture-key|messages|headers|tool_calls|baseUrl/);
 // Old persisted runs have no new optional fields; reopening neither fabricates
 // observations nor replays the interrupted request.
 delete saved.runtimeStatus.requestDiagnostics;delete saved.runtimeStatus.responseDiagnostics;const state=store.get<any>('state',null);state.runs=state.runs.map((r:any)=>r.id===id?saved:r);store.set('state',state);const reopened=new Service(store,()=> '',()=>{});try{const old=reopened.state.runs.find(r=>r.id===id)!;assert.equal(old.runtimeStatus?.requestDiagnostics,undefined);assert.equal(old.runtimeStatus?.responseDiagnostics,undefined);assert.equal(calls,withDraft?2:1);}finally{reopened.dispose();}
});
