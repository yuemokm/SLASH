import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createProviders} from '../lib/providers';
import {modelConfig,fingerprintOf} from '../lib/config';
import {ApiError} from '../lib/contracts';
const env={NODE_ENV:'test' as const,EMBEDDING_ENDPOINT:'https://example.invalid/v1/embeddings/',EMBEDDING_API_KEY:'fixture-key',EMBEDDING_MODEL:'embed-test',EMBEDDING_REVISION:'r1',EMBEDDING_DIMENSIONS:'2',EMBEDDING_SEND_DIMENSIONS:'true',ANSWER_BASE_URL:'https://example.invalid/v1',ANSWER_API_KEY:'fixture-answer',ANSWER_MODEL:'answer-test',RETRIEVAL_MIN_SIMILARITY:'0.7'};
test('provider指纹与desktop完整endpoint规范一致，尾斜杠保留',()=>{assert.equal(modelConfig(env).fingerprint,fingerprintOf({provider:'openai-compatible:https://example.invalid/v1/embeddings/',model:'embed-test',revision:'r1',dimensions:2}));assert.throws(()=>modelConfig({...env,EMBEDDING_DIMENSIONS:'8193'}));});
test('真实adapter发送显式endpoint/model/维度，校验结果模型身份和顺序',async()=>{let seen:unknown;const provider=createProviders(env,async(url,init)=>{assert.equal(url,env.EMBEDDING_ENDPOINT);seen=JSON.parse(String(init?.body));return Response.json({model:'embed-test',data:[{index:0,embedding:[1,0]}]});});assert.deepEqual(await provider.embed('地址'),[1,0]);assert.deepEqual(seen,{model:'embed-test',input:['地址'],encoding_format:'float',dimensions:2});});
test('不同模型、顺序、维度不得冒充向量成功',async()=>{for(const result of [{model:'other',data:[{index:0,embedding:[1,0]}]},{model:'embed-test',data:[{index:1,embedding:[1,0]}]},{model:'embed-test',data:[{index:0,embedding:[1]}]}]){const provider=createProviders(env,async()=>Response.json(result));await assert.rejects(provider.embed('q'));}});
test('上游失败不泄露正文/密钥且不自动重试',async()=>{let count=0;const provider=createProviders(env,async()=>{count++;return new Response('private upstream debug fixture-key',{status:500});});await assert.rejects(provider.embed('q'),e=>e instanceof Error&&!e.message.includes('fixture-key')&&!e.message.includes('private'));assert.equal(count,1);});
test('HTTP fetch继承请求取消信号',async()=>{const controller=new AbortController();const provider=createProviders(env,async(_url,init)=>{controller.abort();assert.equal(init?.signal?.aborted,true);throw new Error('aborted');});await assert.rejects(provider.embed('q',controller.signal),/已取消/);});
test('模型诊断区分向量/回答、HTTP状态/超时/网络，不泄露body或密钥且不重试',async()=>{
 for(const stage of ['embedding','answer'] as const) {
  for(const reason of ['http','timeout','network','invalid_json'] as const) {
   let count=0;
   const provider=createProviders(env,async()=>{count++;if(reason==='http')return new Response('private upstream fixture-key',{status:429});if(reason==='invalid_json')return new Response('private invalid JSON fixture-key');if(reason==='timeout')throw new DOMException('private timeout fixture-key','TimeoutError');throw new Error('private network fixture-key');});
   const call=stage==='embedding'?provider.embed('synthetic'):provider.answer('synthetic',[]);
   await assert.rejects(call,error=>{assert.ok(error instanceof ApiError);assert.equal(error.code,stage==='embedding'?'EMBEDDING_UNAVAILABLE':'ANSWER_UNAVAILABLE');assert.deepEqual(error.diagnostic,{stage,reason,...(reason==='http'?{upstreamStatus:429}:{})});assert.doesNotMatch(JSON.stringify(error),/private|fixture-key/);return true;});
   assert.equal(count,1);
  }
 }
});
test('可解析JSON仍须finish_reason为stop，截断/工具/过滤/未知结束均不显示',async()=>{
 const answer={status:'insufficient',paragraphs:[]};
 for(const finish_reason of ['length','tool_calls','content_filter',null,undefined,'stop']) {
  const provider=createProviders(env,async()=>Response.json({choices:[{finish_reason,message:{content:JSON.stringify(answer)}}]}));
  if(finish_reason==='stop')assert.deepEqual(await provider.answer('synthetic',[]),answer);
  else await assert.rejects(provider.answer('synthetic',[]),error=>error instanceof ApiError&&error.code==='INCOMPLETE_ANSWER');
 }
});
