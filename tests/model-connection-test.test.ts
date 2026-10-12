import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import type {AddressInfo} from 'node:net';
import type {AssistantMessage} from '@earendil-works/pi-ai';
import {testModelTextConnection} from '../main/model-connection-test.js';
import {openAICompatibleProviderConfig,type OpenAICompatibleModel} from '../main/model-runtime.js';
import {runModelTextTest} from '../src/model-test-result.js';

const config:OpenAICompatibleModel={entryId:'fixture-entry',baseUrl:'http://127.0.0.1:1/v1',id:'DeepSeek-V4-Flash-0731',protocol:'openai-completions',contextWindow:65536,maxTokens:12000,thinkingRuntime:{reasoning:false}};
type RuntimeFactory=NonNullable<Parameters<typeof testModelTextConnection>[2]>;
function response(stopReason:AssistantMessage['stopReason'],content:AssistantMessage['content'],errorMessage?:string):AssistantMessage{return{stopReason,content,errorMessage} as AssistantMessage;}
function fixture(message:AssistantMessage,payload:unknown={}){
 let calls=0;let seenConfig:OpenAICompatibleModel|undefined;let options:any;let context:any;
 const create=(async(value:OpenAICompatibleModel)=>{seenConfig=value;return{model:{id:value.id,maxTokens:value.maxTokens},runtime:{completeSimple:async(_model:unknown,input:unknown,opts:any)=>{calls++;options=opts;context=input;assert.equal(await opts.onPayload(payload),undefined);return message;}}};}) as unknown as RuntimeFactory;
 return{create,get calls(){return calls;},get seenConfig(){return seenConfig;},get options(){return options;},get context(){return context;}};
}

test('正常 stop 且非空正文才通过；文字测试明确不证明工具或图片能力',async()=>{
 const value=fixture(response('stop',[{type:'text',text:' 连接成功 '}])) ,snapshot=structuredClone(config);
 const result=await testModelTextConnection(config,'local-fixture-key',value.create);
 assert.equal(result.reply,'连接成功');assert.match(result.notice,/仅验证本次文字回复，不证明工具调用或图片能力/);
 assert.equal(value.calls,1);assert.equal(value.seenConfig,config);assert.deepEqual(config,snapshot);
 assert.equal(value.options.maxTokens,256);assert.equal(value.options.maxRetries,0);assert.equal(value.options.timeoutMs,60000);assert.equal(value.options.signal instanceof AbortSignal,true);assert.equal(value.options.signal.aborted,false);
 assert.deepEqual(Object.keys(value.options).sort(),['maxRetries','maxTokens','onPayload','signal','timeoutMs']);
 assert.equal(value.context.messages.length,1);assert.equal(value.context.messages[0].content,'只回复：连接成功');assert.equal(value.context.tools,undefined);
});

for(const [name,message,pattern] of [
 ['length 有文字',response('length',[{type:'text',text:'部分文字'}]),/输出上限.*已有部分文字/],
 ['length 无文字',response('length',[]),/输出上限.*无文字正文/],
 ['length 只有思考',response('length',[{type:'thinking',thinking:'fixture'}]),/输出上限.*无文字正文/],
 ['stop 只有思考',response('stop',[{type:'thinking',thinking:'fixture'}]),/只返回思考内容，没有文字正文/],
 ['stop 空白正文',response('stop',[{type:'text',text:' \n '}]),/没有返回文字正文/],
 ['error 即使有正文',response('error',[{type:'text',text:'部分文字'}],'本地错误'),/本地错误/],
 ['abort 即使有正文',response('aborted',[{type:'text',text:'部分文字'}]),/取消或超过 60 秒/],
 ['意外 toolUse',response('toolUse',[{type:'text',text:'文字'}]),/意外返回工具调用/],
 ['stop 含工具块',response('stop',[{type:'text',text:'文字'},{type:'toolCall',id:'fixture',name:'fixture',arguments:{}}]),/意外返回工具调用/],
 ['pending',response('pending',[{type:'text',text:'文字'}]),/未正常结束/],
 ['deferred',response('deferred',[{type:'text',text:'文字'}]),/未正常结束/],
] as const)test(`${name} 必须失败且不重试`,async()=>{
 const value=fixture(message);await assert.rejects(testModelTextConnection(config,'local-fixture-key',value.create),pattern);assert.equal(value.calls,1);
});

test('本次测试输出取 256 与原模型上限的较小值，模型配置和思考映射保持不变',async()=>{
 for(const maxTokens of [128,256,12000]){
  const input={...config,maxTokens,thinkingRuntime:{reasoning:true,thinkingLevelMap:{off:'none' as const,high:'high' as const}}},snapshot=structuredClone(input);
  const value=fixture(response('stop',[{type:'text',text:'成功'}]));await testModelTextConnection(input,'local-fixture-key',value.create);
  assert.equal(value.options.maxTokens,Math.min(256,maxTokens));assert.equal(value.options.maxRetries,0);assert.equal(value.options.reasoning,undefined);assert.deepEqual(input,snapshot);
 }
});

test('实际请求声明关闭思考却返回思考时如实提示未核实，不把模型永久判为不支持',async()=>{
 const input=structuredClone(config),before=structuredClone(input);
 for(const payload of [{thinking:{type:'disabled'}},{reasoning_effort:'none'},{reasoning:{effort:'none'}}]){
  const mixed=fixture(response('stop',[{type:'thinking',thinking:'fixture'},{type:'text',text:'成功'}]),payload);
  const result=await testModelTextConnection(input,'local-fixture-key',mixed.create);assert.match(result.notice,/请求声明关闭思考.*仍包含思考内容.*尚未核实/);assert.doesNotMatch(result.notice,/不支持思考|思考已关闭/);
  const only=fixture(response('stop',[{type:'thinking',thinking:'fixture'}]),payload);await assert.rejects(testModelTextConnection(input,'local-fixture-key',only.create),/只返回思考内容.*关闭思考尚未核实/);
 }
 const notDeclared=fixture(response('stop',[{type:'thinking',thinking:'fixture'},{type:'text',text:'成功'}]));assert.doesNotMatch((await testModelTextConnection(input,'local-fixture-key',notDeclared.create)).notice,/请求声明关闭思考/);assert.deepEqual(input,before);
});

test('自定义供应商错误显示实际条目身份与协议，不把内部baishan标识当供应商',async()=>{
 const input={...config,provider:'wangshu',name:'望舒 GPT',id:'gpt-6-astra',protocol:'openai-responses' as const},before=structuredClone(input);
 for(const [raw,pattern] of [
  ['baishan API error (522): 522 status code (no body)',/HTTP 522.*未提供错误正文.*请求未完成.*不能据此判定模型无效/],
  ['baishan API error (401): invalid credential',/上游 API 错误 \(401\): invalid credential/],
  ['baishan API error (400): unsupported parameter',/上游 API 错误 \(400\): unsupported parameter/],
  ['baishan API error (522): upstream connection detail',/上游 API 错误 \(522\): upstream connection detail/],
 ] as const){
  const value=fixture(response('error',[],raw));
  await assert.rejects(testModelTextConnection(input,'local-fixture-key',value.create),error=>{
   assert(error instanceof Error);assert.match(error.message,/wangshu · 望舒 GPT（gpt-6-astra · responses）/);assert.match(error.message,pattern);assert.doesNotMatch(error.message,/baishan|local-fixture-key/);return true;
  });assert.equal(value.calls,1);
 }
 const truncated=fixture(response('length',[]));await assert.rejects(testModelTextConnection(input,'local-fixture-key',truncated.create),/wangshu.*responses.*输出上限.*无文字正文/);assert.deepEqual(input,before);
});

test('真实 Pi responses → 本机 HTTP 522 无正文：保留状态、真实供应商且只请求一次',async t=>{
 let calls=0,body:Record<string,unknown>|undefined;
 const server=createServer(async(req,res)=>{calls++;const chunks:Buffer[]=[];for await(const chunk of req)chunks.push(Buffer.from(chunk));body=JSON.parse(Buffer.concat(chunks).toString());assert.equal(req.url,'/v1/responses');res.writeHead(522);res.end();});
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(async()=>{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));});
 const input={...config,baseUrl:`http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`,provider:'wangshu',name:'gpt-6-astra',id:'gpt-6-astra',protocol:'openai-responses' as const};
 await assert.rejects(testModelTextConnection(input,'local-fixture-key'),error=>{assert(error instanceof Error);assert.match(error.message,/wangshu · gpt-6-astra（responses）.*HTTP 522.*未提供错误正文.*不能据此判定模型无效/);assert.doesNotMatch(error.message,/baishan|local-fixture-key/);return true;});
 assert.equal(calls,1);assert.equal(body?.model,input.id);assert.equal(body?.max_output_tokens,256);assert.equal(body?.stream,true);assert.equal(body?.store,false);assert.equal(body?.reasoning,undefined);
});

test('真实 Pi → 127.0.0.1 HTTP：length 有/无正文均失败，正常文字才通过，参数不变且零重试',async t=>{
 let stopReason='length',visible=false,calls=0;const payloads:Record<string,any>[]=[];
 const server=createServer(async(req,res)=>{
  calls++;const chunks:Buffer[]=[];for await(const chunk of req)chunks.push(Buffer.from(chunk));payloads.push(JSON.parse(Buffer.concat(chunks).toString()));
  assert.equal(req.url,'/v1/chat/completions');
  res.writeHead(200,{'content-type':'text/event-stream'});const base={id:'local-text-test',object:'chat.completion.chunk',created:1,model:config.id};
  res.write('data: '+JSON.stringify({...base,choices:[{index:0,delta:{role:'assistant',reasoning_content:'LOCAL_FIXTURE_THINKING',...(visible?{content:'连接成功'}:{})},finish_reason:null}]})+'\n\n');
  res.end('data: '+JSON.stringify({...base,choices:[{index:0,delta:{},finish_reason:stopReason}],usage:{prompt_tokens:5,completion_tokens:256,total_tokens:261}})+'\n\ndata: [DONE]\n\n');
 });await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
 t.after(async()=>{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));});
 const input={...config,baseUrl:`http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`},snapshot=structuredClone(input),providerBefore=openAICompatibleProviderConfig(input);
 await assert.rejects(testModelTextConnection(input,'local-fixture-key'),/输出上限.*无文字正文.*请求声明关闭思考.*尚未核实/);assert.equal(calls,1);
 visible=true;await assert.rejects(testModelTextConnection(input,'local-fixture-key'),/输出上限.*已有部分文字/);assert.equal(calls,2);
 stopReason='stop';const result=await testModelTextConnection(input,'local-fixture-key');assert.equal(result.reply,'连接成功');assert.match(result.notice,/文字连接测试通过.*尚未核实/);assert.equal(calls,3);
 for(const body of payloads){assert.equal(body.model,input.id);assert.equal(body.max_completion_tokens,256);assert.deepEqual(body.thinking,{type:'disabled'});assert.equal(body.reasoning_effort,undefined);assert.equal(body.tools,undefined);assert.equal(body.messages.length,1);}
 assert.deepEqual(input,snapshot);assert.deepEqual(openAICompatibleProviderConfig(input),providerBefore);assert.equal(providerBefore.models?.[0].maxTokens,12000);
});

test('设置文字测试开始清除旧成功，成功结果为可读正文且不暴露 JSON',async()=>{
 const seen:string[]=['旧成功'];let resolve!:(value:unknown)=>void;
 const pending=runModelTextTest(()=>new Promise(done=>{resolve=done;}),text=>seen.push(text));assert.equal(seen.at(-1),'');
 resolve({modelId:'fixture',model:'fixture-model',reply:'连接成功',notice:'仅验证文字，不证明工具和图片能力。',privateField:'DO_NOT_SHOW'});await pending;
 assert.equal(seen.at(-1),'仅验证文字，不证明工具和图片能力。 模型回复：连接成功');assert.doesNotMatch(seen.at(-1)!,/DO_NOT_SHOW|modelId|\{|\}/);
});

test('设置失败替换旧成功并继续交给已有错误提示；无效结果不能显示成功',async()=>{
 for(const result of [Error('本地 HTTP 400'),Error('文字测试未通过：输出上限'),undefined,{reply:'  '},{reply:42}]){
  const seen=['旧成功'];const error=result instanceof Error?result:undefined;
  await assert.rejects(runModelTextTest(async()=>{if(error)throw error;return result;},text=>seen.push(text)));
  assert.equal(seen[1],'');assert.match(seen.at(-1)!,/^文字测试未通过：/);assert.doesNotMatch(seen.at(-1)!,/旧成功/);
 }
});
