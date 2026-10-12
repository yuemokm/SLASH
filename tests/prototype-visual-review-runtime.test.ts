import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createServer} from 'node:http';
import type {AddressInfo} from 'node:net';
import {createRuntime,type RuntimeOptions} from '../main/agent.js';

test('正式Pi只读审查HTTP带真实图片内容、原模型且无工具，输出cap有界，不污染父会话历史',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'slash-visual-native-')),requests:Array<Record<string,any>>=[];
 const server=createServer(async(req,res)=>{const chunks:Buffer[]=[];for await(const chunk of req)chunks.push(Buffer.from(chunk));requests.push(JSON.parse(Buffer.concat(chunks).toString()));res.writeHead(200,{'content-type':'text/event-stream'});const base={id:'visual-fixture',object:'chat.completion.chunk',created:1,model:'visual-fixture'};res.write('data: '+JSON.stringify({...base,choices:[{index:0,delta:{role:'assistant',content:'{"findings":[],"limitations":[]}'},finish_reason:null}]})+'\n\n');res.end('data: '+JSON.stringify({...base,choices:[{index:0,delta:{},finish_reason:'stop'}],usage:{prompt_tokens:20,completion_tokens:4,total_tokens:24}})+'\n\ndata: [DONE]\n\n');});
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const runtimes:Awaited<ReturnType<typeof createRuntime>>[]=[];
 t.after(async()=>{for(const runtime of runtimes){await runtime.abort();runtime.dispose();}server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));await fs.rm(dir,{recursive:true,force:true,maxRetries:5,retryDelay:30});});
 const make=async(supportsVision:boolean|undefined)=>{const runtime=await createRuntime({dir,workspaceRoot:dir,model:{id:'visual-fixture',baseUrl:`http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`,protocol:'openai-completions',supportsVision,contextWindow:65536,maxTokens:12000},key:'fixture-key',files:{} as RuntimeOptions['files'],mounts:[],connections:[],runId:'visual-native',mode:'plan',listConnections:()=>[],delta:()=>{},redact:String} as RuntimeOptions);runtimes.push(runtime);return runtime;};
 const image={type:'image' as const,mimeType:'image/png',data:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j9H0AAAAASUVORK5CYII='},runtime=await make(true),before=structuredClone(runtime.messages);
 const result=await runtime.reviewContent!('审查此图，不能调用工具。',undefined,[image]);assert.equal(result.stopReason,'stop');assert.equal(result.requestedOutputTokens,2048);assert.equal(requests.length,1);assert.equal(requests[0].model,'visual-fixture');assert.equal(requests[0].tools,undefined);assert.equal(requests[0].messages.length,1);assert.equal(requests[0].messages[0].content[1].type,'image_url');assert.equal(requests[0].messages[0].content[1].image_url.url,'data:image/png;base64,'+image.data);assert.deepEqual(runtime.messages,before);
 const unknown=await make(undefined);await assert.rejects(unknown.reviewContent!('不能自动换模型',undefined,[image]),/MODEL_VISION_UNAVAILABLE/);assert.equal(requests.length,1);
 const controller=new AbortController();controller.abort();await assert.rejects(runtime.reviewContent!('取消',controller.signal,[image]),/CANCELLED/);assert.equal(requests.length,1);
});
