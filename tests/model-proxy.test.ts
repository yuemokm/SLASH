import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer,type ServerResponse} from 'node:http';
import {connect,type AddressInfo,type Socket} from 'node:net';
import type {Duplex} from 'node:stream';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {testModelTextConnection} from '../main/model-connection-test.js';
import {createOpenAICompatibleModelRuntime,openAICompatibleProviderConfig} from '../main/model-runtime.js';
import {createRuntime,type RuntimeOptions} from '../main/agent.js';
import {closeModelProxyTransports} from '../main/model-proxy.js';
import {modelProxyUrlSchema} from '../shared/model-proxy.js';

const model={id:'proxy-fixture',provider:'custom',name:'代理模型',protocol:'openai-responses' as const,contextWindow:65536,maxTokens:12000};
function reply(res:ServerResponse,id:string){
 res.writeHead(200,{'content-type':'text/event-stream'});
 const item={type:'message',id:'msg-fixture',role:'assistant',status:'completed',content:[{type:'output_text',text:'OK',annotations:[]}]};
 for(const event of [{type:'response.output_item.added',output_index:0,item:{...item,content:[]}},{type:'response.output_text.delta',output_index:0,content_index:0,delta:'OK'},{type:'response.output_item.done',output_index:0,item},{type:'response.completed',response:{id:'response-fixture',status:'completed',model:id,output:[item],usage:{input_tokens:3,output_tokens:2,total_tokens:5}}}])res.write('data: '+JSON.stringify(event)+'\n\n');
 res.end();
}
async function fixture(t:test.TestContext){
 const requests:Array<{path:string;body:Record<string,any>}>=[],tunnels:string[]=[],sockets=new Set<Socket|Duplex>();let status=200,hold=false;
 const origin=createServer(async(req,res)=>{const chunks:Buffer[]=[];for await(const chunk of req)chunks.push(Buffer.from(chunk));assert.equal(req.headers.authorization,'Bearer local-fixture-key');requests.push({path:req.url!,body:JSON.parse(Buffer.concat(chunks).toString())});if(hold){res.writeHead(200,{'content-type':'text/event-stream'});res.flushHeaders();return;}if(status!==200){res.writeHead(status);res.end();return;}reply(res,model.id);});
 await new Promise<void>(resolve=>origin.listen(0,'127.0.0.1',resolve));
 const originPort=(origin.address() as AddressInfo).port;
 const proxy=createServer((_req,res)=>{res.writeHead(405);res.end();});
 proxy.on('connect',(req,socket,head)=>{tunnels.push(req.url!);assert.equal(req.url,'model-only.invalid:9999');sockets.add(socket);const upstream=connect(originPort,'127.0.0.1',()=>{socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');if(head.length)upstream.write(head);socket.pipe(upstream);upstream.pipe(socket);});sockets.add(upstream);socket.on('error',()=>upstream.destroy());upstream.on('error',()=>socket.destroy());});
 await new Promise<void>(resolve=>proxy.listen(0,'127.0.0.1',resolve));
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'slash-model-proxy-'));const runtimes:Awaited<ReturnType<typeof createRuntime>>[]=[];
 t.after(async()=>{for(const runtime of runtimes){await runtime.abort();runtime.dispose();}for(const socket of sockets)socket.destroy();await closeModelProxyTransports();origin.closeAllConnections();proxy.closeAllConnections();await Promise.all([new Promise<void>(resolve=>origin.close(()=>resolve())),new Promise<void>(resolve=>proxy.close(()=>resolve()))]);await fs.rm(dir,{recursive:true,force:true,maxRetries:5,retryDelay:30});});
 return{dir,runtimes,requests,tunnels,proxyUrl:`http://127.0.0.1:${(proxy.address() as AddressInfo).port}`,baseUrl:'http://model-only.invalid:9999/v1',directUrl:`http://127.0.0.1:${originPort}/v1`,setStatus:(value:number)=>{status=value;},setHold:()=>{hold=true;}};
}

test('代理URL只允许无凭据的HTTP(S)主机端口；不自动增加代理或修改原provider',()=>{
 for(const value of ['http://127.0.0.1:7897','https://proxy.invalid:8443',' http://localhost:9000/ '])assert(modelProxyUrlSchema.safeParse(value).success);
 for(const value of ['', 'socks5://localhost:1080','file:///proxy','http://user:secret@localhost:8080','http://localhost/path','http://localhost?key=secret','http://localhost#secret'])assert(!modelProxyUrlSchema.safeParse(value).success);
 const config={...model,baseUrl:'https://model.invalid/v1'};assert.equal(openAICompatibleProviderConfig(config).streamSimple,undefined);assert.equal(openAICompatibleProviderConfig({...config,proxyUrl:'http://localhost:7897'}).streamSimple instanceof Function,true);assert.equal(openAICompatibleProviderConfig(config).baseUrl,config.baseUrl);
});

test('正式Pi文字测试、会话和只读审查同用条目CONNECT代理；旧直连条目保持隔离',{timeout:20000},async t=>{
 const f=await fixture(t),config={...model,baseUrl:f.baseUrl,proxyUrl:f.proxyUrl};const globalFetch=globalThis.fetch;
 const result=await testModelTextConnection(config,'local-fixture-key');assert.equal(result.reply,'OK');assert.match(result.notice,/已配置的模型代理/);assert.equal(f.requests.length,1);assert.equal(f.requests[0].path,'/v1/responses');assert.equal(f.requests[0].body.max_output_tokens,256);assert.equal(f.requests[0].body.stream,true);assert.equal(f.requests[0].body.store,false);assert(f.tunnels.length>0);
 const runtime=await createRuntime({dir:f.dir,workspaceRoot:f.dir,model:config,key:'local-fixture-key',files:{} as RuntimeOptions['files'],mounts:[],connections:[],runId:'proxy-session',mode:'plan',listConnections:()=>[],delta:()=>{},redact:String} as RuntimeOptions);f.runtimes.push(runtime);
 await runtime.prompt('Reply OK.');assert.equal(runtime.messages.at(-1)?.role,'assistant');const before=structuredClone(runtime.messages);const review=await runtime.reviewContent!('Review only.');assert.equal(review.text,'OK');assert.equal(review.stopReason,'stop');assert.deepEqual(runtime.messages,before);assert.equal(f.requests.length,3);assert(f.requests.every(r=>r.path==='/v1/responses'&&r.body.model===model.id&&r.body.stream===true));
 const raw=await createOpenAICompatibleModelRuntime(config,'local-fixture-key');const complete=await raw.runtime.complete(raw.model,{messages:[{role:'user',content:'Read only.',timestamp:Date.now()}]},{maxTokens:256,maxRetries:0});assert.equal(complete.stopReason,'stop');assert.equal(f.requests.length,4);
 const tunnelCount=f.tunnels.length;const direct=await testModelTextConnection({...model,baseUrl:f.directUrl},'local-fixture-key');assert.equal(direct.reply,'OK');assert.equal(f.tunnels.length,tunnelCount);assert.equal(globalThis.fetch,globalFetch);assert.doesNotMatch(JSON.stringify(result),/local-fixture-key/);
});

test('代理路径的522继续失败且单次请求；取消保持aborted，无回退直连',{timeout:20000},async t=>{
 const f=await fixture(t),config={...model,baseUrl:f.baseUrl,proxyUrl:f.proxyUrl};f.setStatus(522);
 await assert.rejects(testModelTextConnection(config,'local-fixture-key'),error=>{assert(error instanceof Error);assert.match(error.message,/custom.*proxy-fixture.*HTTP 522.*已配置的模型代理/);assert.doesNotMatch(error.message,/local-fixture-key|baishan/);return true;});assert.equal(f.requests.length,1);
 f.setHold();const configured=await createOpenAICompatibleModelRuntime(config,'local-fixture-key'),controller=new AbortController();const pending=configured.runtime.completeSimple(configured.model,{messages:[{role:'user',content:'Cancel.',timestamp:Date.now()}]},{signal:controller.signal,maxRetries:0,maxTokens:256});
 for(let i=0;f.requests.length<2&&i<100;i++)await new Promise(resolve=>setTimeout(resolve,10));assert.equal(f.requests.length,2);controller.abort();const cancelled=await pending;assert.equal(cancelled.stopReason,'aborted');assert.equal(f.requests.length,2);
});
