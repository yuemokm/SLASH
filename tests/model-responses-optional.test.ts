import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createRuntime,type RuntimeOptions} from '../main/agent.js';
import {openAICompatibleProviderConfig,type OpenAICompatibleModel} from '../main/model-runtime.js';
import {taskModelViewRequestSchema} from '../shared/task-acceptance-model-view.js';
import {prototypeAcceptanceGetSchema} from '../shared/prototype-acceptance.js';
import {toolInputSchema} from '../main/tool-input-schema.js';

test('Responses默认显式best effort，已有compat优先，其他协议保持原配置',()=>{
 const base:OpenAICompatibleModel={id:'arbitrary-model',baseUrl:'https://arbitrary.invalid/v1',protocol:'openai-responses'};
 assert.equal(openAICompatibleProviderConfig(base).models?.[0].compat?.supportsStrictMode,true);
 const compat={supportsStrictMode:false,supportsReasoningEffort:false};
 const explicit={...base,thinkingRuntime:{reasoning:false,compat}};const snapshot=structuredClone(explicit);
 assert.deepEqual(openAICompatibleProviderConfig(explicit).models?.[0].compat,compat);assert.deepEqual(explicit,snapshot);
 for(const protocol of ['openai-completions','anthropic-messages'] as const){
  assert.equal(openAICompatibleProviderConfig({...base,protocol}).models?.[0].compat,undefined);
  assert.equal(openAICompatibleProviderConfig({...explicit,protocol}).models?.[0].compat,compat);
 }
});

test('真实Pi Responses默认false及显式退出保持optional；取消/HTTP失败不执行工具或额外请求',{timeout:30000},async()=>{
 for(const scenario of ['default','explicit-optout','http-error','cancel'] as const){
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'slash-responses-optional-')),controller=new AbortController();let runtime:Awaited<ReturnType<typeof createRuntime>>|undefined,requests=0,executed=0;const failures:unknown[]=[];
  const server=createServer(async(req,res)=>{try{
   assert.equal(++requests,1);assert.equal(req.url,'/v1/responses');const chunks:Buffer[]=[];for await(const c of req)chunks.push(Buffer.from(c));const body=JSON.parse(Buffer.concat(chunks).toString());
   assert.equal(body.tools.length,1);const tool=body.tools[0];assert.equal(tool.name,'get_task_acceptance');assert.deepEqual(tool.parameters,JSON.parse(JSON.stringify(toolInputSchema(taskModelViewRequestSchema))));assert.deepEqual(tool.parameters.required??[],[]);
   assert.equal(Object.hasOwn(tool,'strict'),scenario!=='explicit-optout');if(scenario!=='explicit-optout')assert.equal(tool.strict,false);
   if(scenario==='http-error'){res.writeHead(500,{'content-type':'application/json'});res.end('{"error":{"message":"LOCAL_EXPECTED_ERROR"}}');return;}
   res.writeHead(200,{'content-type':'text/event-stream'});if(scenario==='cancel'){res.flushHeaders();controller.abort();return;}
   const item={type:'function_call',id:'fc_optional',call_id:'optional_call',name:'get_task_acceptance',arguments:'{}',status:'completed'};
   for(const event of [{type:'response.output_item.added',output_index:0,item:{...item,arguments:''}},{type:'response.output_item.done',output_index:0,item},{type:'response.completed',response:{id:'local-response',status:'completed',output:[item],usage:{input_tokens:3,output_tokens:2,total_tokens:5}}}])res.write('data: '+JSON.stringify(event)+'\n\n');res.end();
  }catch(error){failures.push(error);if(!res.headersSent)res.writeHead(500);res.end();}});
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const address=server.address();assert(address&&typeof address!=='string');
  try{
   runtime=await createRuntime({dir,workspaceRoot:dir,files:{} as RuntimeOptions['files'],mounts:[],connections:[],key:'LOCAL-ONLY',runId:'local-run',mode:'plan',model:{id:'arbitrary-model',baseUrl:`http://127.0.0.1:${address.port}/v1`,protocol:'openai-responses',...(scenario==='explicit-optout'?{thinkingRuntime:{reasoning:false,compat:{supportsStrictMode:false}}}:{})},listConnections:()=>[],delta:()=>{},redact:String,log:async(_name,_args,fn)=>{executed++;return fn();},getTaskAcceptanceForModel:async()=>{executed++;return{} as never;}} as RuntimeOptions);
   const proto=runtime.getToolDefinition('get_prototype_acceptance');assert(proto);assert.match(proto.description,/最小已保存调用为\{mountId,path\}/);assert.match(proto.description,/不填写current/);
   assert(prototypeAcceptanceGetSchema.safeParse({mountId:'fixture-mount',path:'index.html'}).success);
   assert(prototypeAcceptanceGetSchema.safeParse({mountId:'fixture-mount',path:'index.html',draft:{changeId:'fixture-change',parentRunId:'fixture-owner',expectedContentHash:'a'.repeat(64)}}).success);
   const tool=runtime.getToolDefinition('get_task_acceptance');assert(tool);assert(runtime.model);
   const result=await runtime.modelRuntime.completeSimple(runtime.model,{messages:[{role:'user',content:'LOCAL ONLY',timestamp:Date.now()}],tools:[tool]},{maxRetries:0,signal:controller.signal,maxTokens:256});
   assert.deepEqual(failures,[]);assert.equal(requests,1);assert.equal(executed,0);
   if(scenario==='http-error')assert.equal(result.stopReason,'error');else if(scenario==='cancel')assert.equal(result.stopReason,'aborted');else{assert.equal(result.stopReason,'toolUse');const call=result.content.find(c=>c.type==='toolCall');assert(call?.type==='toolCall');assert.deepEqual(call.arguments,{});assert.deepEqual(taskModelViewRequestSchema.parse(call.arguments),{section:'summary',limit:10});}
  }finally{if(runtime){await runtime.abort();runtime.dispose();}server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));await fs.rm(dir,{recursive:true,force:true,maxRetries:5,retryDelay:30});}
 }
});
