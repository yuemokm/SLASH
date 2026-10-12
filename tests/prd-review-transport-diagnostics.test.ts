import assert from 'node:assert/strict';
import {createServer,type Server} from 'node:http';
import {test} from 'node:test';
import {observeReviewFetch} from '../scripts/prd-review-transport-diagnostics.mjs';
import {runtimeRequestDiagnostics} from '../main/runtime-request-diagnostics';
async function listen(server:Server){await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));return`http://127.0.0.1:${(server.address() as {port:number}).port}/`;}
async function close(server:Server){server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
const body=JSON.stringify({model:'fixture',thinking:{type:'disabled'},stream:true,max_completion_tokens:12000,messages:[{role:'user',content:'PRIVATE_PROMPT'}]});
test('real loopback stream preserves bytes and only counts public enum/number fields',async()=>{
 const wire='data: '+JSON.stringify({choices:[{delta:{reasoning_content:'PRIVATE_THINKING'}}]})+'\n\n'+'data: '+JSON.stringify({choices:[{delta:{content:'PRIVATE_TEXT'},finish_reason:'stop'}],usage:{prompt_tokens:10,completion_tokens:2,total_tokens:12,secret:'PRIVATE_USAGE'}})+'\n\n'+'data: [DONE]\n\n';
 const server=createServer((req,res)=>{assert.equal(req.headers.authorization,'Bearer PRIVATE_KEY');setTimeout(()=>{res.writeHead(200,{'content-type':'text/event-stream','x-secret':'PRIVATE_HEADER'});const bytes=Buffer.from(wire);res.write(bytes.subarray(0,17));setTimeout(()=>res.end(bytes.subarray(17)),25);},25);});
 try{
  const observer=observeReviewFetch(fetch,{projectPayload:runtimeRequestDiagnostics});const response=await observer.fetch(await listen(server),{method:'POST',headers:{authorization:'Bearer PRIVATE_KEY'},body});assert.equal(await response.text(),wire);
  const result=observer.snapshot(),a=result.attempts[0];assert.equal(a.httpStatus,200);assert(a.headersAtMs>=20);assert.equal(a.eventCount,3);assert.equal(a.textCharacters,12);assert.equal(a.thinkingCharacters,16);assert.equal(a.doneSeen,true);assert.equal(a.phase,'body_complete');assert.equal(a.finishReason,'stop');assert.deepEqual(a.requestDiagnostics,{source:'fixture-fetch-request',thinkingType:'disabled',reasoningEffort:'absent',maxCompletionTokens:12000});assert.equal(JSON.stringify(result).includes('PRIVATE'),false);
 }finally{await close(server);}
});
test('cancellation before headers records its phase and forwards AbortSignal',async()=>{
 const server=createServer(()=>{}),controller=new AbortController();
 try{const observer=observeReviewFetch(fetch),request=observer.fetch(await listen(server),{method:'POST',body,signal:controller.signal});setTimeout(()=>controller.abort(),40);await assert.rejects(request);const a=observer.snapshot().attempts[0];assert.equal(a.cancelledPhase,'waiting_headers');assert.equal(a.phase,'cancelled');assert.equal(a.headersAtMs,undefined);}finally{await close(server);}
});
test('cancellation during a real stream preserves completed event counts without a forged completion',async()=>{
 const server=createServer((_req,res)=>{res.writeHead(200,{'content-type':'text/event-stream'});res.write('data: '+JSON.stringify({choices:[{delta:{content:'PRIVATE_PARTIAL'}}]})+'\n\n');}),controller=new AbortController();
 try{const observer=observeReviewFetch(fetch),response=await observer.fetch(await listen(server),{method:'POST',body,signal:controller.signal});const reading=response.text();setTimeout(()=>controller.abort(),40);await assert.rejects(reading);const a=observer.snapshot().attempts[0];assert.equal(a.cancelledPhase,'streaming');assert.equal(a.eventCount,1);assert.equal(a.textCharacters,15);assert.equal(a.doneSeen,false);assert.equal(a.bodyEndAtMs,undefined);assert.equal(JSON.stringify(a).includes('PRIVATE'),false);}finally{await close(server);}
});
