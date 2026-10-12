import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createServer,type Server} from 'node:http';
import {connect,type AddressInfo,type Socket} from 'node:net';
import type {Duplex} from 'node:stream';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createRuntime} from '../main/agent';
import {Files} from '../main/files';
import {modelProxyFetch,closeModelProxyTransports} from '../main/model-proxy';
import {openAICompatibleProviderConfig,OPENAI_COMPATIBLE_RUNTIME_PROVIDER} from '../main/model-runtime';
import {runtimeRequestDiagnostics} from '../main/runtime-request-diagnostics';
import {openAIResponsesApi} from '@earendil-works/pi-ai/api/openai-responses.lazy';
import {observeReviewFetch} from '../scripts/prd-review-transport-diagnostics.mjs';
const listen=(s:Server)=>new Promise<void>(resolve=>s.listen(0,'127.0.0.1',resolve));
const port=(s:Server)=>(s.address() as AddressInfo).port;
for(const outcome of ['completed','incomplete','failed','cancelled','cancelled_before_send'])test(`formal review responses via observed CONNECT proxy: ${outcome}`,{timeout:15000},async t=>{
 const sockets=new Set<Socket|Duplex>();let calls=0;const globalFetch=globalThis.fetch;
 const thinking='PRIVATE_THINKING',text='审查通过',reasoning={id:'r',type:'reasoning',summary:[{type:'summary_text',text:thinking}]},message={id:'m',type:'message',role:'assistant',status:'completed',content:[{type:'output_text',text,annotations:[]}]};
 const events=[{type:'response.output_item.added',output_index:0,item:{...reasoning,summary:[]}},{type:'response.reasoning_summary_part.added',output_index:0,item_id:'r',summary_index:0,part:{type:'summary_text',text:''}},{type:'response.reasoning_summary_text.delta',output_index:0,item_id:'r',summary_index:0,delta:thinking},{type:'response.output_item.done',output_index:0,item:reasoning},{type:'response.output_item.added',output_index:1,item:{...message,content:[]}},{type:'response.output_text.delta',output_index:1,item_id:'m',content_index:0,delta:text},{type:'response.output_item.done',output_index:1,item:message}];
 const origin=createServer(async(req,res)=>{let raw='';for await(const chunk of req)raw+=chunk;const body=JSON.parse(raw);raw='';calls++;assert.equal(req.url,'/v1/responses');assert.equal(body.model,'gpt-6-astra');assert.equal(body.max_output_tokens,12000);assert.equal(body.stream,true);assert.equal(body.store,false);assert.equal(req.headers.authorization,'Bearer PRIVATE_KEY');res.writeHead(200,{'content-type':'text/event-stream'});
  for(const event of events)res.write('data: '+JSON.stringify(event)+'\n\n');
  if(outcome==='cancelled')return;
  res.end('data: '+JSON.stringify({type:'response.'+outcome,response:{id:'resp',model:'gpt-6-astra',status:outcome,output:[reasoning,message],...(outcome==='incomplete'?{incomplete_details:{reason:'max_output_tokens'}}:{}),...(outcome==='failed'?{error:{code:'server_error',message:'PRIVATE_ERROR'}}:{}),usage:{input_tokens:12,output_tokens:7,total_tokens:19}}})+'\n\n');
 });await listen(origin);
 const proxy=createServer();proxy.on('connect',(req,socket,head)=>{assert.equal(req.url,'review.invalid:9999');sockets.add(socket);const up=connect(port(origin),'127.0.0.1',()=>{socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');if(head.length)up.write(head);socket.pipe(up);up.pipe(socket);});sockets.add(up);socket.on('error',()=>up.destroy());up.on('error',()=>socket.destroy());});await listen(proxy);
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'slash-prd-responses-')),config={id:'gpt-6-astra',baseUrl:'http://review.invalid:9999/v1',proxyUrl:`http://127.0.0.1:${port(proxy)}`,protocol:'openai-responses' as const,contextWindow:65536,maxTokens:12000};let runtime;
 try{
  let resolveStreaming!:()=>void;
  const streaming=new Promise<void>(resolve=>{resolveStreaming=resolve;});
  const observer=observeReviewFetch(modelProxyFetch(config.proxyUrl),{projectPayload:runtimeRequestDiagnostics,onUpdate:(snapshot:any)=>{const attempt=snapshot.attempts[0];if(attempt?.phase==='streaming'&&attempt.textCharacters===text.length&&attempt.thinkingCharacters===thinking.length)resolveStreaming();}});
  runtime=await createRuntime({dir,workspaceRoot:dir,model:config,key:'PRIVATE_KEY',thinkingLevel:'off',files:new Files(()=>[]),mounts:[],connections:[],runId:'responses-probe',mode:'plan',listConnections:()=>[],delta:()=>{},log:async(_name,_input,execute)=>execute(),draft:()=>{throw Error('READ_ONLY');},redact:()=> 'SAFE_ERROR'} as any);
  runtime.modelRuntime.registerProvider(OPENAI_COMPATIBLE_RUNTIME_PROVIDER,{...openAICompatibleProviderConfig(config),streamSimple:(model,context,options)=>openAIResponsesApi().streamSimple(model,context,{...options,fetch:observer.fetch})});
  const cancellation=new AbortController();
  if(outcome==='cancelled_before_send')cancellation.abort();
  const pending=runtime.reviewContent!('PRIVATE_PROMPT',outcome.startsWith('cancelled')?AbortSignal.any([cancellation.signal,t.signal]):t.signal);
  if(outcome==='cancelled'){
   // Observe bytes actually received through CONNECT before cancelling. A
   // timer cannot establish that the provider has begun streaming.
   const rejected=assert.rejects(pending,/CANCELLED/);
   await Promise.race([streaming,pending.then(()=>{throw Error('review completed before streaming cancellation');})]);
   assert.equal(calls,1);cancellation.abort();await rejected;
  }
  else if(outcome==='cancelled_before_send')await assert.rejects(pending,/CANCELLED/);
  else{const result=await pending;assert.equal(result.stopReason,{completed:'stop',incomplete:'length',failed:'error'}[outcome]);if(outcome==='completed'){assert.equal(result.text,text);assert.equal(result.requestedOutputTokens,12000);}}
  const summary=observer.snapshot();assert.equal(JSON.stringify(summary).includes('PRIVATE'),false);assert.equal(globalThis.fetch,globalFetch);
  if(outcome==='cancelled_before_send'){assert.equal(summary.fetchAttempts,0);assert.equal(calls,0);assert.deepEqual(summary.attempts,[]);return;}
  const a=summary.attempts[0];assert.equal(summary.fetchAttempts,1);assert.equal(calls,1);assert.equal(a.textCharacters,4);assert.equal(a.thinkingCharacters,thinking.length);assert.equal(a.requestDiagnostics.maxOutputTokens,12000);assert.equal(a.responseEventCounts['response.output_text.delta'],1);
  if(outcome==='cancelled'){assert.equal(a.cancelledPhase,'streaming');assert.equal(a.doneSeen,false);assert.equal(a.responseTerminal,undefined);}else{assert.equal(a.responseTerminal,'response.'+outcome);assert.equal(a.doneSeen,outcome==='completed');assert.deepEqual(a.usage,{input_tokens:12,output_tokens:7,total_tokens:19});}
 }finally{if(runtime){await runtime.abort();runtime.dispose();}for(const socket of sockets)socket.destroy();await closeModelProxyTransports();origin.closeAllConnections();proxy.closeAllConnections();await Promise.all([new Promise<void>(resolve=>origin.close(()=>resolve())),new Promise<void>(resolve=>proxy.close(()=>resolve()))]);assert.equal(path.dirname(dir),os.tmpdir());assert(path.basename(dir).startsWith('slash-prd-responses-'));await fs.rm(dir,{recursive:true,force:true});}
});
