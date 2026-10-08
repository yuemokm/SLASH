import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createServer} from 'node:http';
import type {AddressInfo} from 'node:net';
import Anthropic from '@anthropic-ai/sdk';
import {getBuiltinModels} from '@earendil-works/pi-ai/providers/all';
import {ModelThinkingResolver,describeThinkingModel,parseThinkingMetadata,thinkingFingerprint,type ThinkingModelConfig} from '../main/model-thinking.js';
import {openAICompatibleProviderConfig,createOpenAICompatibleModelRuntime} from '../main/model-runtime.js';
import {Service} from '../main/service.js';
import {Store} from '../main/store.js';
import {requestSchema,type ThinkingLevel} from '../shared/types.js';
import type {RuntimeOptions} from '../main/agent.js';

const input:ThinkingModelConfig={entryId:'custom-a',baseUrl:'https://proxy.invalid/v1',id:'gpt-5.4',protocol:'openai-completions'};
const metadata=(id:string,levels:ThinkingLevel[],thinking=true)=>({id,capabilities:{effort:Object.fromEntries(['low','medium','high','xhigh','max'].map(level=>[level,{supported:levels.includes(level as ThinkingLevel)}])),thinking:{types:{adaptive:{supported:false},enabled:{supported:thinking}}}}});
const json=(value:unknown)=>new Response(JSON.stringify(value),{headers:{'content-type':'application/json'}});
const waitFor=async(predicate:()=>boolean)=>{const until=Date.now()+3000;while(Date.now()<until){if(predicate())return;await new Promise(resolve=>setTimeout(resolve,10));}throw Error('等待运行超时');};

test('官方完整端点与Pi目录匹配，不能关闭思考的o3没有off；中转同名模型保持未知',async()=>{
 let fetches=0;const resolver=new ModelThinkingResolver(async()=>{fetches++;throw Error('不应访问网络');});
 const o3=await resolver.resolve({...input,baseUrl:'https://api.openai.com/v1',id:'o3',protocol:'openai-responses'});assert.equal(o3.capability.status,'supported');assert.deepEqual(o3.capability.levels,['low','medium','high']);assert.equal(o3.capability.defaultLevel,'medium');
 const proxy=await resolver.resolve({...input,protocol:'openai-responses'});assert.equal(proxy.capability.status,'unknown');assert.deepEqual(proxy.capability.levels,[]);
 const evil=await resolver.resolve({...input,baseUrl:'https://api.openai.com.evil.invalid/v1',protocol:'openai-responses'});assert.equal(evil.capability.status,'unknown');assert.equal(fetches,0);
 const wrongProtocol=await resolver.resolve({...input,baseUrl:'https://api.openai.com/v1'});assert.equal(wrongProtocol.capability.status,'unknown');
});

test('真实元数据声明取接口交集，忽略任意compat与sampling参数；普通models结果无档位',async()=>{
 const resolver=new ModelThinkingResolver(async()=>json({...metadata(input.id,['low','high']),compat:{forceAdaptiveThinking:true},samplingParams:{shell:'evil'}}));
 const resolved=await resolver.resolve(input,{refresh:true,key:'fixture-key'});assert.deepEqual(resolved.capability.levels,['low','high']);assert.equal(resolved.capability.defaultLevel,'high');assert.equal(resolved.runtime?.reasoning,true);assert.deepEqual(resolved.runtime?.compat,{supportsReasoningEffort:true,thinkingFormat:'openai'});
 const config=openAICompatibleProviderConfig({...input,supportsVision:false,thinkingRuntime:resolved.runtime});assert.equal(config.models?.[0].reasoning,true);assert.equal(config.models?.[0].thinkingLevelMap?.high,'high');assert.equal(config.models?.[0].thinkingLevelMap?.medium,null);assert.equal('samplingParams' in (config.models?.[0]??{})?config.models?.[0].samplingParams:undefined,undefined);
 assert.equal(parseThinkingMetadata(input,{id:input.id,owned_by:'openai'}),undefined);assert.equal(parseThinkingMetadata(input,{...metadata(input.id,['low']),id:'other'}),undefined);
 const unsupported=parseThinkingMetadata(input,metadata(input.id,[],false));assert.equal(unsupported?.capability.status,'unsupported');assert.deepEqual(unsupported?.capability.levels,[]);
});

test('Anthropic官方根地址与/v1识别一致，GET有正确路径、限时及拒绝重定向',async()=>{
 const seen:Array<{url:string;options?:RequestInit}>=[];const resolver=new ModelThinkingResolver(async(url,options)=>{seen.push({url:String(url),options});return json({id:'claude-sonnet-4-6',capabilities:{effort:Object.fromEntries(['low','medium','high','xhigh','max'].map(level=>[level,{supported:['low','high'].includes(level)}])),thinking:{types:{adaptive:{supported:true},enabled:{supported:false}}}}});});
 for(const baseUrl of ['https://api.anthropic.com','https://api.anthropic.com/v1']){
  const resolved=await resolver.resolve({...input,baseUrl,id:'claude-sonnet-4-6',protocol:'anthropic-messages'},{refresh:true,key:'fixture-key'});assert.equal(resolved.capability.status,'supported');assert.ok(resolved.capability.levels.includes('high'));assert.equal(resolved.runtime?.compat&&'forceAdaptiveThinking' in resolved.runtime.compat?resolved.runtime.compat.forceAdaptiveThinking:undefined,true);
 }
 assert.ok(seen.every(item=>item.url==='https://api.anthropic.com/v1/models/claude-sonnet-4-6'));assert.ok(seen.every(item=>item.options?.redirect==='error'&&item.options.signal));assert.equal((seen[0].options?.headers as Record<string,string>)['x-api-key'],'fixture-key');
});

test('Anthropic官方/v1别名的实际SDK消息请求只有一个/v1，custom路径与其他协议保留',async()=>{
 const seen:string[]=[];
 for(const baseUrl of ['https://api.anthropic.com','https://api.anthropic.com/v1','https://api.anthropic.com/v1/']){
  const config=openAICompatibleProviderConfig({...input,baseUrl,protocol:'anthropic-messages'});
  const client=new Anthropic({apiKey:'fixture-key',baseURL:config.baseUrl,fetch:async(url)=>{
   seen.push(String(url));return json({id:'fixture',type:'message',role:'assistant',model:input.id,content:[{type:'text',text:'ok'}],stop_reason:'end_turn',stop_sequence:null,usage:{input_tokens:1,output_tokens:1}});
  }});
  await client.messages.create({model:input.id,max_tokens:10,messages:[{role:'user',content:'路径检查'}]});
 }
 assert.deepEqual(seen,Array(3).fill('https://api.anthropic.com/v1/messages'));
 for(const baseUrl of ['https://gateway.invalid/v1','https://api.anthropic.com.evil.invalid/v1','https://api.anthropic.com/proxy/v1','https://api.anthropic.com/v1?route=x','https://user@api.anthropic.com/v1'])assert.equal(openAICompatibleProviderConfig({...input,baseUrl,protocol:'anthropic-messages'}).baseUrl,baseUrl);
 assert.equal(openAICompatibleProviderConfig({...input,baseUrl:'https://api.anthropic.com/v1',protocol:'openai-completions'}).baseUrl,'https://api.anthropic.com/v1');
});

test('去重后的默认档位保持在可选集合中，Claude minimal/low共用原生low只显示一次',()=>{
 const model=getBuiltinModels('anthropic').find(model=>model.id==='claude-sonnet-4-6')!;const mapped={...model,thinkingLevelMap:{off:null,minimal:null,low:'high',medium:'high',high:'high',xhigh:null,max:null}};
 const collapsed=describeThinkingModel({...input,protocol:'anthropic-messages'},mapped,'fixture','fixture');assert.deepEqual(collapsed.capability.levels,['high']);assert.equal(collapsed.capability.defaultLevel,'high');
 const normal=describeThinkingModel({...input,protocol:'anthropic-messages'},model,'fixture','fixture');assert.equal(normal.capability.levels.includes('minimal'),false);assert.equal(normal.capability.levels.includes('low'),true);
});

test('明确effort元数据保留已知DeepSeek transport与native映射，真实Pi请求同时发送thinking和effort',async t=>{
 let seen:Record<string,unknown>|undefined;const server=createServer(async(request,response)=>{
  const chunks:Buffer[]=[];for await(const chunk of request)chunks.push(Buffer.from(chunk));seen=JSON.parse(Buffer.concat(chunks).toString());
  response.writeHead(200,{'content-type':'text/event-stream'});const event=(choices:unknown)=>response.write(`data: ${JSON.stringify({id:'fixture',object:'chat.completion.chunk',created:1,model:input.id,choices})}\n\n`);
  event([{index:0,delta:{role:'assistant',content:'ok'},finish_reason:null}]);event([{index:0,delta:{},finish_reason:'stop'}]);response.end('data: [DONE]\n\n');
 });await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise<void>(resolve=>server.close(()=>resolve())));const baseUrl=`http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`;
 const known={...getBuiltinModels('openai').find(model=>model.id==='o3')!,id:input.id,provider:'deepseek',api:'openai-completions' as const,baseUrl,thinkingLevelMap:{off:null,minimal:null,low:'low',medium:null,high:'native-high',xhigh:null,max:null},compat:{thinkingFormat:'deepseek' as const,maxTokensField:'max_tokens' as const,requiresReasoningContentOnAssistantMessages:true,supportsReasoningEffort:true}};
 const resolution=parseThinkingMetadata({...input,baseUrl},metadata(input.id,['low','high']),known)!;assert.equal(resolution.runtime?.thinkingLevelMap?.high,'native-high');assert.deepEqual(resolution.runtime?.compat,known.compat);
 const {runtime,model}=await createOpenAICompatibleModelRuntime({...input,baseUrl,thinkingRuntime:resolution.runtime},'fixture-key');const result=await runtime.completeSimple(model,{messages:[{role:'user',content:'检查档位',timestamp:Date.now()}]},{reasoning:'high'});assert.equal(result.stopReason,'stop');assert.deepEqual(seen?.thinking,{type:'enabled'});assert.equal(seen?.reasoning_effort,'native-high');assert.equal(typeof seen?.max_tokens,'number');assert.equal(seen?.max_completion_tokens,undefined);
});

test('元数据响应超限和HTTP失败保持unknown；刷新失败保留已验证快照，不判不支持',async()=>{
 const tooLarge=new ModelThinkingResolver(async()=>new Response('x',{headers:{'content-length':String(300000)}}));const capped=await tooLarge.resolve(input,{refresh:true,key:'fixture-key'});assert.equal(capped.capability.status,'unknown');assert.match(capped.capability.reason,/响应过大/);
 let failing=false;const resolver=new ModelThinkingResolver(async()=>failing?new Response('',{status:401}):json(metadata(input.id,['low','high'])));await resolver.resolve(input,{refresh:true,key:'fixture-key'});failing=true;
 const previous=await resolver.resolve(input,{refresh:true,key:'fixture-key'});assert.equal(previous.capability.status,'supported');assert.deepEqual(previous.capability.levels,['low','high']);assert.equal(previous.capability.stale,true);assert.match(previous.capability.reason,/HTTP 401/);
 const failed=new ModelThinkingResolver(async()=>new Response('',{status:302}));assert.equal((await failed.resolve(input,{refresh:true,key:'fixture-key'})).capability.status,'unknown');
});

test('档位进入RuntimeOptions并持久化，Plan/恢复继承；配置改变拒用旧快照且不发费用探测',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'slash-thinking-runtime-'));const store=new Store(path.join(dir,'data'));t.after(async()=>{store.close();await fs.rm(dir,{recursive:true,force:true});});const seen:RuntimeOptions[]=[];let fetches=0;let shouldFail=false;
 const runtime=async(options:RuntimeOptions)=>{seen.push(options);return{sessionFile:undefined,messages:[{role:'assistant' as const,stopReason:'stop' as const}],prompt:async()=>{if(shouldFail)throw Error('fixture-failure');options.delta(options.mode==='plan'?'方案 1：处理来源\n步骤：输出结果':'完成');},abort:async()=>{},dispose:()=>{}};};
 const service=new Service(store,()=>'',()=>{},runtime,{fetchModelMetadata:async()=>{fetches++;return json(metadata(input.id,['low','high']));}},()=> 'fixture-key');await service.workspace(path.join(dir,'workspace'));service.state.models=[{id:input.entryId!,provider:'custom',name:'思考模型',baseUrl:input.baseUrl,modelId:input.id,protocol:input.protocol,hasKey:true}];service.state.defaultModelId=input.entryId;service.save();
 const cap=await service.modelThinkingCapability({refresh:true});assert.deepEqual(cap.levels,['low','high']);const conversation=service.conversation();
 const planId=await service.send(conversation,'先计划','plan','standard',input.entryId,undefined,undefined,'coding',undefined,undefined,'high');await waitFor(()=>service.state.runs.find(run=>run.id===planId)?.status==='awaiting_plan');
 assert.equal(seen.at(-1)?.thinkingLevel,'high');assert.equal(seen.at(-1)?.model.thinkingRuntime?.reasoning,true);assert.equal(service.state.runs.find(run=>run.id===planId)?.reasoning?.effectiveLevel,'high');
 const build=await service.confirmPlan(planId,['option-1'],'');await waitFor(()=>service.state.runs.find(run=>run.id===build)?.status==='succeeded');assert.equal(seen.at(-1)?.thinkingLevel,'high');assert.equal(service.state.runs.find(run=>run.id===build)?.modelRoute?.taskType,'coding');assert.equal(fetches,1);
 const secondPlan=await service.send(conversation,'再次计划','plan','standard',input.entryId,undefined,undefined,'coding',undefined,undefined,'low');await waitFor(()=>service.state.runs.find(run=>run.id===secondPlan)?.status==='awaiting_plan');const resetBuild=await service.confirmPlan(secondPlan,['option-1'],'','standard',undefined,null);await waitFor(()=>service.state.runs.find(run=>run.id===resetBuild)?.status==='succeeded');assert.equal(service.state.runs.find(run=>run.id===resetBuild)?.reasoning?.requestedLevel,undefined);assert.equal(service.state.runs.find(run=>run.id===resetBuild)?.reasoning?.effectiveLevel,'high');
 await assert.rejects(service.send(conversation,'非法档位','build','standard',input.entryId,undefined,undefined,'general',undefined,undefined,'medium'),/THINKING_LEVEL_UNAVAILABLE/);
 shouldFail=true;const failed=await service.send(conversation,'可恢复','build','standard',input.entryId,undefined,undefined,'general',undefined,undefined,'low');await waitFor(()=>service.state.runs.find(run=>run.id===failed)?.status==='failed');shouldFail=false;
 const cacheKey=`model-thinking:v1:${cap.fingerprint}`;const snapshot=store.get<{expiresAt:number;resolution:unknown}>(cacheKey,null as never);snapshot.expiresAt=0;store.set(cacheKey,snapshot);
 const reopened=new Service(store,()=>'',()=>{},runtime,{fetchModelMetadata:async()=>{throw Error('重启恢复不能隐式联网');}},()=> 'fixture-key');const stale=await reopened.modelThinkingCapability();assert.equal(stale.stale,true);assert.equal(stale.status,'supported');const resumed=await reopened.resumeRun(failed);await waitFor(()=>reopened.state.runs.find(run=>run.id===resumed)?.status==='succeeded');assert.equal(seen.at(-1)?.thinkingLevel,'low');
 reopened.state.models![0].baseUrl='https://other-proxy.invalid/v1';assert.notEqual(thinkingFingerprint({...input,baseUrl:'https://other-proxy.invalid/v1'}),cap.fingerprint);await assert.rejects(reopened.send(conversation,'旧能力不适用','build','standard',input.entryId,undefined,undefined,'general',undefined,undefined,'high'),/THINKING_LEVEL_UNAVAILABLE/);
 assert.equal(requestSchema.parse({type:'planConfirm',id:planId,selectedOptionIds:[],customText:'',permissionMode:'standard',thinkingLevel:null}).type,'planConfirm');assert.throws(()=>requestSchema.parse({type:'send',id:conversation,text:'bad',thinkingLevel:'ultra'}));
});
