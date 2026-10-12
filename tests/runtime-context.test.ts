import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createServer,type ServerResponse} from 'node:http';
import type {AddressInfo} from 'node:net';
import {SessionManager} from '@earendil-works/pi-coding-agent';
import type {AssistantMessage} from '@earendil-works/pi-ai';
import {assertRuntimeSucceeded,createRuntime,type RuntimeOptions} from '../main/agent.js';

type Payload={messages:Array<{role:string;content:unknown}>;max_tokens?:number;max_completion_tokens?:number};
type Recovery=NonNullable<RuntimeOptions['contextRecovery']> extends (event:infer E)=>void?E:never;
function reply(res:ServerResponse,text:string,finish='stop',input=20){
 res.writeHead(200,{'content-type':'text/event-stream'});
 const base={id:'native-pi',object:'chat.completion.chunk',created:1,model:'fixture'};
 res.write('data: '+JSON.stringify({...base,choices:[{index:0,delta:{role:'assistant',content:text},finish_reason:null}]})+'\n\n');
 res.end('data: '+JSON.stringify({...base,choices:[{index:0,delta:{},finish_reason:finish}],usage:{prompt_tokens:input,completion_tokens:2,total_tokens:input+2}})+'\n\ndata: [DONE]\n\n');
}
const isSummary=(data:Payload)=>JSON.stringify(data.messages).includes('<conversation>');
async function fixture(t:test.TestContext,handler:(data:Payload,res:ServerResponse,index:number)=>void,options:{historyTokens?:number;historyRepeat?:number;settings?:object;signal?:AbortSignal}={}){
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'slash-native-pi-')),requests:Payload[]=[],recovery:Recovery[]=[],deltas:string[]=[],observed:Array<{status:import('../shared/runtime-status.js').RuntimeObservedStatus;source:string}>=[];
 const server=createServer(async(req,res)=>{const chunks:Buffer[]=[];for await(const chunk of req)chunks.push(Buffer.from(chunk));const data=JSON.parse(Buffer.concat(chunks).toString()) as Payload;requests.push(data);handler(data,res,requests.length);});
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
 const agentDir=path.join(dir,'agent');await fs.mkdir(agentDir);
 if(options.settings)await fs.writeFile(path.join(agentDir,'settings.json'),JSON.stringify(options.settings));
 let sessionFile:string|undefined;
 if(options.historyTokens!==undefined){
  const manager=SessionManager.create(agentDir,path.join(dir,'sessions'));const timestamp=Date.now()-10000;
  for(let i=0;i<3;i++){
   manager.appendMessage({role:'user',content:`HISTORY-${i} `+'prior evidence '.repeat(options.historyRepeat??200),timestamp:timestamp+i*2});
   const input=i===2?options.historyTokens:20;
   manager.appendMessage({role:'assistant',content:[{type:'text',text:`PRIOR-STOP-${i}`}],stopReason:'stop',api:'openai-completions',provider:'baishan',model:'fixture',usage:{input,output:2,cacheRead:0,cacheWrite:0,totalTokens:input+2,cost:{input:0,output:0,cacheRead:0,cacheWrite:0,total:0}},timestamp:timestamp+i*2+1} satisfies AssistantMessage);
  }
  sessionFile=manager.getSessionFile()!;
 }
 const runtime=await createRuntime({dir:agentDir,workspaceRoot:dir,model:{id:'fixture',baseUrl:`http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`,protocol:'openai-completions',contextWindow:65536,maxTokens:12000},key:'fixture-key',files:{} as RuntimeOptions['files'],mounts:[],connections:[],runId:'native-fixture',mode:'plan',sessionFile,signal:options.signal,listConnections:()=>[],delta:text=>deltas.push(text),runtimeObserved:(status,source)=>observed.push({status,source}),contextRecovery:event=>recovery.push(event)} as RuntimeOptions);
 t.after(async()=>{await runtime.abort();runtime.dispose();server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));await fs.rm(dir,{recursive:true,force:true,maxRetries:5,retryDelay:30});});
 return{runtime,requests,recovery,deltas,agentDir,observed};
}
const nativeSettings={compaction:{keepRecentTokens:200},retry:{maxRetries:2,baseDelayMs:10,provider:{maxRetries:0}}};

test('new actual HTTP request clears old response before a transport failure, preserving prior numeric usage only',async t=>{
 let entered=false;const {runtime,observed,requests}=await fixture(t,(_data,res,index)=>{if(index===1)reply(res,'FIRST-COMPLETED');else{entered=true;res.destroy();}},{settings:{retry:{enabled:false,provider:{maxRetries:0}}}});
 await runtime.prompt('FIRST');assertRuntimeSucceeded(runtime);assert.equal(observed.at(-1)?.status.responseDiagnostics?.stopReason,'stop');
 await runtime.prompt('SECOND');assert.equal(entered,true);assert.equal(requests.length,2);assert.throws(()=>assertRuntimeSucceeded(runtime),/MODEL_RESPONSE_ERROR/);
 const secondRequest=observed.filter(e=>e.source==='provider_request')[1];assert.ok(secondRequest);assert.equal(secondRequest.status.responseDiagnostics,undefined);assert.ok(secondRequest.status.lastUsage);
 assert.equal(observed.at(-1)?.status.responseDiagnostics?.stopReason,'error');assert.equal(observed.at(-1)?.status.responseDiagnostics?.textEmpty,true);
});

test('小窗应用默认8192经真实Pi agent loop产生摘要并恢复length，未写全局配置',async t=>{
 let attempts=0;
 const {runtime,requests,recovery,agentDir}=await fixture(t,(data,res)=>isSummary(data)?reply(res,'SESSION-DEFAULT-CHECKPOINT'):reply(res,++attempts===1?'PARTIAL':'RECOVERED',attempts===1?'length':'stop'),{historyTokens:20,historyRepeat:1800});
 assert.equal(runtime.settingsManager.getCompactionKeepRecentTokens(runtime.model),8192);
 await runtime.prompt('CURRENT-TURN');assertRuntimeSucceeded(runtime);
 assert.equal(attempts,2);assert.equal(requests.filter(isSummary).length,1);assert.match(JSON.stringify(requests.at(-1)?.messages),/SESSION-DEFAULT-CHECKPOINT/);
 assert.deepEqual(recovery.map(e=>[e.status,e.reason]),[['compacting','overflow'],['compacted','overflow']]);
 assert.equal(runtime.settingsManager.getGlobalSettings().compaction,undefined);assert.equal(runtime.settingsManager.getProjectSettings().compaction,undefined);
 assert.equal(await fs.stat(path.join(agentDir,'settings.json')).then(()=>true,()=>false),false);
});

test('生产createRuntime以本session小窗默认保留近期预算并保留Pi原生压缩与重试',async t=>{
 const {runtime}=await fixture(t,(_,res)=>reply(res,'ok'));
 assert.equal(runtime.autoCompactionEnabled,true);assert.equal(runtime.autoRetryEnabled,true);
 assert.deepEqual(runtime.settingsManager.getCompactionSettings(runtime.model),{enabled:true,reserveTokens:16384,keepRecentTokens:8192});
 assert.equal(runtime.settingsManager.getRetrySettings().maxRetries,3);assert.equal(runtime.settingsManager.getRetrySettings().baseDelayMs,2000);
});

test('大型新prompt不被Slash预算提前阻断，Pi最终小生成预算真实发送给HTTP提供者',async t=>{
 const {runtime,requests}=await fixture(t,(_,res)=>reply(res,'provider accepted'));
 await runtime.prompt('large fresh input '.repeat(20000));assertRuntimeSucceeded(runtime);
 assert.equal(requests.length,1);assert.equal(requests[0].max_tokens??requests[0].max_completion_tokens,1);
 assert.match(JSON.stringify(requests[0].messages),/large fresh input/);
});

test('Pi原生threshold压缩真实调用HTTP摘要并在新prompt使用持久化summary',async t=>{
 const {runtime,requests,recovery,observed}=await fixture(t,(data,res)=>reply(res,isSummary(data)?'NATIVE-CHECKPOINT':'NEW-TASK-COMPLETE'),{historyTokens:51000,settings:nativeSettings});
 await runtime.prompt('NEW-USER-TASK');assertRuntimeSucceeded(runtime);
 assert.equal(requests.length,2);assert.ok(isSummary(requests[0]));assert.ok(!isSummary(requests[1]));
 assert.match(JSON.stringify(requests[1].messages),/NATIVE-CHECKPOINT/);assert.match(JSON.stringify(requests[1].messages),/NEW-USER-TASK/);
 assert.deepEqual(recovery.map(e=>[e.status,e.reason]),[['compacting','threshold'],['compacted','threshold']]);
 const saved=(await fs.readFile(runtime.sessionFile!,'utf8')).trim().split('\n').map(line=>JSON.parse(line));assert.equal(saved.filter(e=>e.type==='compaction').length,1);assert(observed.some(e=>e.source==='compaction_start'&&e.status.activity==='compacting'));assert(observed.some(e=>e.source==='compaction_end'&&e.status.compaction?.status==='completed'));assert(observed.some(e=>e.source==='context_usage'&&e.status.context?.tokens===null&&e.status.context.percent===null));assert(observed.some(e=>e.status.lastUsage?.input===20));assert(!JSON.stringify(observed).includes('NATIVE-CHECKPOINT')); 
});

test('Pi原生length恢复压缩后只重试当前轮一次，真实成功message_end替换失败终态',async t=>{
 let attempts=0;
 const {runtime,requests,recovery}=await fixture(t,(data,res)=>isSummary(data)?reply(res,'OVERFLOW-CHECKPOINT'):reply(res,++attempts===1?'TRUNCATED':'NATIVE-RETRY-SUCCESS',attempts===1?'length':'stop'),{historyTokens:20,settings:nativeSettings});
 await runtime.prompt('CURRENT-TURN');assertRuntimeSucceeded(runtime);
 assert.equal(attempts,2);assert.equal(requests.filter(isSummary).length,1);assert.match(JSON.stringify(requests.at(-1)?.messages),/OVERFLOW-CHECKPOINT/);
 assert.deepEqual(recovery.map(e=>[e.status,e.reason]),[['compacting','overflow'],['compacted','overflow']]);
 assert.equal([...runtime.messages].reverse().find(m=>m.role==='assistant')?.stopReason,'stop');
});

test('Pi原生overflow恢复重试仍length时不会无限继续，保留当前轮真实失败',async t=>{
 let attempts=0;
 const {runtime,requests,recovery}=await fixture(t,(data,res)=>isSummary(data)?reply(res,'CHECKPOINT'):reply(res,`LIMIT-${++attempts}`,'length'),{historyTokens:20,settings:nativeSettings});
 await runtime.prompt('CURRENT-TURN');assert.throws(()=>assertRuntimeSucceeded(runtime),/MODEL_OUTPUT_LIMIT/);
 assert.equal(attempts,2);assert.equal(requests.filter(isSummary).length,1);assert.equal(recovery.at(-1)?.status,'failed');assert.match(recovery.at(-1)?.error??'',/after one compact-and-retry attempt/);
});

test('Pi真实HTTP摘要失败保持compaction事件和本轮length，不能误用历史stop',async t=>{
 const {runtime,requests,recovery,deltas}=await fixture(t,(data,res)=>reply(res,isSummary(data)?'INCOMPLETE-SUMMARY':'CURRENT-PARTIAL','length'),{historyTokens:20,settings:nativeSettings});
 await runtime.prompt('CURRENT-TURN');assert.throws(()=>assertRuntimeSucceeded(runtime),/MODEL_OUTPUT_LIMIT/);
 assert.equal(requests.length,2);assert.equal(recovery.at(-1)?.status,'failed');assert.match(recovery.at(-1)?.error??'',/summary is incomplete/);assert.ok(deltas.includes('CURRENT-PARTIAL'));
 assert.equal([...runtime.messages].reverse().find(m=>m.role==='assistant')?.stopReason,'stop');
});

test('Pi原生HTTP 503通用自动retry成功与耗尽按配置终止，失败不误用历史stop',async t=>{
 for(const succeeds of [true,false]){
  const {runtime,requests,observed}=await fixture(t,(_,res,index)=>{if(succeeds&&index===2)reply(res,'RETRY-SUCCESS');else{res.writeHead(503,{'content-type':'application/json'});res.end(JSON.stringify({error:{message:'Service temporarily unavailable',type:'server_error'}}));}},{historyTokens:20,settings:nativeSettings});
  const events:string[]=[];runtime.subscribe(e=>{if(e.type==='auto_retry_start'||e.type==='auto_retry_end')events.push(e.type);});
  await runtime.prompt('CURRENT-TURN');assert(observed.some(e=>e.source==='auto_retry_start'&&e.status.retry?.maxAttempts===2));assert(observed.some(e=>e.source==='auto_retry_end'&&e.status.retry?.status===(succeeds?'succeeded':'failed')));
  if(succeeds){assertRuntimeSucceeded(runtime);assert.equal(requests.length,2);assert.deepEqual(events,['auto_retry_start','auto_retry_end']);}
  else{assert.throws(()=>assertRuntimeSucceeded(runtime),/MODEL_RESPONSE_ERROR.*503/);assert.equal(requests.length,3);assert.deepEqual(events,['auto_retry_start','auto_retry_start','auto_retry_end']);}
 }
});

test('宿主AbortSignal取消真实Pi HTTP压缩，取消后不发新任务请求并上报失败事件',{timeout:10000},async t=>{
 const controller=new AbortController();let summaryStarted!:()=>void;const started=new Promise<void>(resolve=>{summaryStarted=resolve;});
 const {runtime,requests,recovery,observed}=await fixture(t,(data,res)=>{if(isSummary(data)){res.writeHead(200,{'content-type':'text/event-stream'});res.flushHeaders();summaryStarted();}else reply(res,'unexpected');},{historyTokens:51000,settings:nativeSettings,signal:controller.signal});
 const pending=runtime.prompt('CURRENT-TURN');await started;controller.abort();await assert.rejects(pending,/CANCELLED/);
 assert.equal(requests.length,1);assert.equal(recovery.at(-1)?.status,'failed');assert(observed.some(e=>e.source==='compaction_end'&&e.status.compaction?.status==='cancelled'));assert.match(recovery.at(-1)?.error??'',/已取消/);assert.throws(()=>assertRuntimeSucceeded(runtime),/MODEL_RESPONSE_MISSING/);
});
