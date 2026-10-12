import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createServer,type Server} from 'node:http';
import {test} from 'node:test';
import {createRuntime} from '../main/agent';
import {Files} from '../main/files';
import {runtimeRequestDiagnostics} from '../main/runtime-request-diagnostics';
import {observeReviewFetch} from '../scripts/prd-review-transport-diagnostics.mjs';
async function listen(server:Server){await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));return`http://127.0.0.1:${(server.address() as {port:number}).port}/v1`;}
async function close(server:Server){server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
for(const cancel of [false,true])test(`formal Pi review transport ${cancel?'retains cancel phase':'retains payload flags and stream bytes'}`,async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'slash-review-wire-')),originalFetch=globalThis.fetch;
 const observer=observeReviewFetch(originalFetch,{projectPayload:runtimeRequestDiagnostics});globalThis.fetch=observer.fetch;
 const server=createServer(async(req,res)=>{
  let raw='';for await(const c of req)raw+=c;const input=JSON.parse(raw);raw='';assert.equal(input.thinking.type,'disabled');assert.equal(input.max_completion_tokens,12000);
  if(cancel)return;
  res.writeHead(200,{'content-type':'text/event-stream'});
  const base={id:'local-review',object:'chat.completion.chunk',created:1,model:input.model};
  res.write('data: '+JSON.stringify({...base,choices:[{index:0,delta:{role:'assistant',content:'审查夹具结果'},finish_reason:null}]})+'\n\n');
  res.end('data: '+JSON.stringify({...base,choices:[{index:0,delta:{},finish_reason:'stop'}],usage:{prompt_tokens:20,completion_tokens:4,total_tokens:24}})+'\n\ndata: [DONE]\n\n');
 });
 let runtime;
 try{
  runtime=await createRuntime({dir,workspaceRoot:dir,model:{id:'DeepSeek-V4-Flash-0731',baseUrl:await listen(server),protocol:'openai-completions',contextWindow:65536,maxTokens:12000},thinkingLevel:'off',key:'LOCAL_KEY_DO_NOT_PERSIST',files:new Files(()=>[]),mounts:[],connections:[],runId:'fixture',mode:'plan',listConnections:()=>[],delta:()=>{},log:async(_name,_input,execute)=>execute(),draft:()=>{throw Error('NO_DRAFT');},redact:()=> 'LOCAL_ERROR'} as any);
  const signal=cancel?AbortSignal.timeout(80):undefined;
  if(cancel)await assert.rejects(runtime.reviewContent!('Read-only local fixture.',signal),/CANCELLED/);
  else{const response=await runtime.reviewContent!('Read-only local fixture.',signal);assert.equal(response.text,'审查夹具结果');assert.equal(response.stopReason,'stop');assert.equal(response.requestedOutputTokens,12000);}
  const summary=observer.snapshot(),a=summary.attempts[0];assert.equal(summary.fetchAttempts,1);
  if(cancel){assert.equal(a.cancelledPhase,'waiting_headers');assert.equal(a.headersAtMs,undefined);}
  else{assert.equal(a.textCharacters,6);assert.equal(a.doneSeen,true);assert.equal(a.eventCount,3);assert.equal(a.requestDiagnostics.thinkingType,'disabled');assert.equal(a.requestDiagnostics.maxCompletionTokens,12000);}
  assert.equal(JSON.stringify(summary).includes('LOCAL_KEY'),false);assert.equal(JSON.stringify(summary).includes('审查夹具结果'),false);
 }finally{globalThis.fetch=originalFetch;if(runtime){await runtime.abort();runtime.dispose();}await close(server);assert.equal(path.dirname(dir),os.tmpdir());assert(path.basename(dir).startsWith('slash-review-wire-'));await fs.rm(dir,{recursive:true,force:true});}
});
