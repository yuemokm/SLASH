import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {getBuiltinModels} from '@earendil-works/pi-ai/providers/all';
import {ModelThinkingResolver,thinkingFingerprint} from '../main/model-thinking.js';
import {findCatalogModel,parseModelLimitMetadata,resolveModelLimits} from '../main/model-limits.js';
import {openAICompatibleProviderConfig} from '../main/model-runtime.js';
import {requestSchema} from '../shared/types.js';
import {Service} from '../main/service.js';
import {Store} from '../main/store.js';
import type {RuntimeOptions} from '../main/agent.js';

const input={entryId:'capacity-a',baseUrl:'https://proxy.invalid/v1',id:'o3',protocol:'openai-responses' as const};
const json=(value:unknown)=>new Response(JSON.stringify(value),{headers:{'content-type':'application/json'}});
class MemoryStore{values=new Map<string,unknown>();get<T>(key:string,fallback:T):T{return (this.values.get(key)??fallback) as T;}set(key:string,value:unknown){this.values.set(key,value);}}

test('Pi capacity requires endpoint, transport and exact model identity; unknown values remain visibly unverified',async()=>{
 const known=getBuiltinModels('openai').find(model=>model.id==='o3')!;
 const official={...input,baseUrl:known.baseUrl};
 assert.equal(findCatalogModel(official)?.contextWindow,known.contextWindow);
 const resolved=resolveModelLimits(official,'fixture');assert.equal(resolved.contextWindow,known.contextWindow);assert.equal(resolved.maxTokens,known.maxTokens);assert.equal(resolved.source,'pi-catalog:openai');assert.equal(resolved.status,'verified');
 const provider=openAICompatibleProviderConfig(official);assert.equal(provider.models?.[0].contextWindow,known.contextWindow);assert.equal(provider.models?.[0].maxTokens,known.maxTokens);
 for(const candidate of [input,{...official,baseUrl:'https://api.openai.com.evil.invalid/v1'},{...official,baseUrl:'https://api.openai.com/v1?route=official'},{...official,protocol:'openai-completions' as const}]){
  const result=resolveModelLimits(candidate,'fixture');assert.equal(result.status,'unverified');assert.equal(result.contextWindow,65536);assert.equal(result.maxTokens,12000);assert.match(result.reason,/不代表上游真实能力/);
 }
});

test('metadata validates identity and numeric limits without coercion or inferring capacity from model listings',()=>{
 const valid=parseModelLimitMetadata(input,{id:input.id,context_window:200000,max_output_tokens:32000});assert.deepEqual(valid,{contextWindow:200000,maxTokens:32000});
 for(const value of [null,[],{id:'other',context_window:200000,max_tokens:32000},{id:input.id,owned_by:'openai'},{id:input.id,context_window:'200000',max_tokens:32000},{id:input.id,context_window:Infinity,max_tokens:32000},{id:input.id,context_window:32000,max_tokens:32000},{id:input.id,context_window:200000,max_tokens:-1}])assert.equal(parseModelLimitMetadata(input,value),undefined);
 assert.equal(parseModelLimitMetadata(input,{id:input.id,max_input_tokens:200000}),undefined);
 const anthropic={...input,protocol:'anthropic-messages' as const};const declared=parseModelLimitMetadata(anthropic,{id:input.id,max_input_tokens:200000,max_tokens:64000})!;
 const limited=resolveModelLimits(anthropic,'fixture',declared);assert.equal(limited.contextWindow,200000);assert.match(limited.reason,/输入上下文上限/);
 assert.equal(parseModelLimitMetadata(anthropic,{id:input.id,context_window:150000,max_input_tokens:200000,max_tokens:32000})?.contextWindow,150000);
});

test('explicit overrides take precedence per field and final contradictions are rejected',()=>{
 const metadata={contextWindow:200000,maxTokens:32000};
 const context=resolveModelLimits({...input,contextWindow:180000},'fixture',metadata);assert.equal(context.contextWindow,180000);assert.equal(context.maxTokens,32000);assert.equal(context.contextWindowSource,'user-override');assert.equal(context.maxTokensSource,'provider-model-metadata');
 const output=resolveModelLimits({...input,maxTokens:16000},'fixture',metadata);assert.equal(output.contextWindow,200000);assert.equal(output.maxTokens,16000);
 assert.throws(()=>resolveModelLimits({...input,contextWindow:16000},'fixture',metadata),/MODEL_LIMITS_INVALID/);
 assert.throws(()=>resolveModelLimits({...input,maxTokens:100000},'fixture'),/同时明确配置/);
 assert.throws(()=>resolveModelLimits({...input,contextWindow:NaN},'fixture'),/有限正整数/);
 assert.equal(resolveModelLimits({...input,contextWindow:8000},'fixture').maxTokens,7999);
});

test('one metadata GET resolves capacity and thinking, persists snapshot and never re-fetches for ordinary runtime reads',async()=>{
 const store=new MemoryStore();let calls=0;
 const resolver=new ModelThinkingResolver(async()=>{calls++;return json({id:input.id,context_window:200000,max_output_tokens:32000,capabilities:{thinking:{types:{adaptive:{supported:false},enabled:{supported:true}}},effort:{low:{supported:true},high:{supported:true}}}});},store);
 const first=await resolver.resolve(input,{refresh:true,key:'fixture-key'});assert.equal(calls,1);assert.equal(first.capability.limits?.source,'provider-model-metadata');assert.deepEqual(first.capability.levels,['low','high']);
 for(let index=0;index<4;index++){const read=await resolver.resolve({...input,maxTokens:16000});assert.equal(read.capability.limits?.maxTokens,16000);assert.equal(read.capability.limits?.contextWindow,200000);}
 assert.equal(calls,1);
 const restarted=new ModelThinkingResolver(async()=>{throw Error('must not fetch');},store);assert.equal((await restarted.resolve(input)).capability.limits?.maxTokens,32000);
 assert.equal((await restarted.resolve({...input,baseUrl:'https://different.invalid/v1'})).capability.limits?.status,'unverified');
 const cacheKey=`model-thinking:v1:${thinkingFingerprint(input)}`;const snapshot=store.get<{expiresAt:number}>(cacheKey,null as never);snapshot.expiresAt=0;store.set(cacheKey,snapshot);
 const stale=await new ModelThinkingResolver(async()=>{throw Error('must not fetch');},store).resolve(input);assert.equal(stale.capability.limits?.stale,true);assert.equal(stale.capability.limits?.contextWindow,200000);
});

test('refresh failures and invalid declarations keep prior capacities and mark snapshots stale',async()=>{
 let response:unknown={id:input.id,context_window:200000,max_output_tokens:32000};let failure=false;
 const resolver=new ModelThinkingResolver(async()=>failure?new Response('',{status:401}):json(response));
 await resolver.resolve(input,{refresh:true,key:'fixture'});failure=true;const failed=await resolver.resolve(input,{refresh:true,key:'fixture'});assert.equal(failed.capability.limits?.maxTokens,32000);assert.equal(failed.capability.limits?.stale,true);assert.match(failed.capability.limits?.reason??'',/HTTP 401/);
 failure=false;response={id:'other',context_window:900000,max_tokens:60000};const wrong=await resolver.resolve(input,{refresh:true,key:'fixture'});assert.equal(wrong.capability.limits?.contextWindow,200000);
 response={id:input.id,context_window:15000,max_tokens:14000};const conflict=await resolver.resolve({...input,maxTokens:16000},{refresh:true,key:'fixture'});assert.equal(conflict.capability.limits?.contextWindow,200000);assert.match(conflict.capability.limits?.reason??'',/MODEL_LIMITS_INVALID/);
});

test('legacy thinking cache without limits remains usable and malformed or mismatched snapshots cannot establish capacity',async()=>{
 const store=new MemoryStore(),fingerprint=thinkingFingerprint(input),key=`model-thinking:v1:${fingerprint}`;
 store.set(key,{expiresAt:Date.now()+60000,resolution:{capability:{fingerprint,modelId:input.id,status:'supported',levels:['low'],reason:'legacy',source:'provider-model-metadata',defaultLevel:'low'},runtime:{reasoning:true}}});
 const resolver=new ModelThinkingResolver(async()=>{throw Error('must not fetch');},store);const legacy=await resolver.resolve(input);assert.equal(legacy.capability.status,'supported');assert.equal(legacy.capability.limits?.status,'unverified');
 store.set(key,{expiresAt:Date.now()+60000,resolution:{capability:{fingerprint:'wrong',status:'supported',levels:['low']},metadataLimits:{contextWindow:200000,maxTokens:32000}}});
 assert.equal((await new ModelThinkingResolver(fetch,store).resolve(input)).capability.limits?.status,'unverified');
 assert.equal(resolveModelLimits(input,fingerprint,{contextWindow:-100,maxTokens:NaN}).contextWindow,65536);
});

test('IPC rejects nonfinite/nonpositive/contradictory limits and allows explicit null reset',()=>{
 const model={provider:'custom',name:'Capacity fixture',baseUrl:input.baseUrl,modelId:input.id};
 for(const patch of [{contextWindow:0},{maxTokens:Infinity},{contextWindow:200000.5},{contextWindow:2000,maxTokens:3000},{maxTokens:'16000'}])assert.throws(()=>requestSchema.parse({type:'modelUpsert',model:{...model,...patch}}));
 const reset=requestSchema.parse({type:'modelUpsert',model:{...model,contextWindow:null,maxTokens:null}});assert.equal(reset.type,'modelUpsert');
});

test('Anthropic budget labels follow effective output capacity without the former 12000 cap and recover after manual changes',async()=>{
 const model=getBuiltinModels('anthropic').find(model=>model.id==='claude-haiku-4-5')!;
 const config={entryId:'anthropic-capacity',baseUrl:model.baseUrl,id:model.id,protocol:'anthropic-messages' as const};
 const resolver=new ModelThinkingResolver(async()=>{throw Error('must not fetch');});
 const full=await resolver.resolve(config);assert.equal(full.capability.nativeLevels?.high,'budget_tokens:16384');
 const manual=await resolver.resolve({...config,maxTokens:9000});assert.equal(manual.capability.nativeLevels?.medium,'budget_tokens:7976');assert.equal(manual.capability.levels.includes('high'),false);
 const restored=await resolver.resolve(config);assert.equal(restored.capability.nativeLevels?.high,'budget_tokens:16384');
});

test('service routes and hands resolved capacities to runtime; invalid unrelated configuration does not block usable entries',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'slash-model-capacity-'));const store=new Store(path.join(dir,'data'));t.after(async()=>{store.close();await fs.rm(dir,{recursive:true,force:true});});let seen:RuntimeOptions|undefined,calls=0;
 const service=new Service(store,()=>'',()=>{},async options=>{seen=options;return{sessionFile:undefined,messages:[{role:'assistant' as const,stopReason:'stop' as const}],prompt:async()=>{},abort:async()=>{},dispose:()=>{}};},{fetchModelMetadata:async()=>{calls++;return json({id:input.id,context_window:200000,max_output_tokens:32000});}},()=> 'fixture-key');
 await service.workspace(path.join(dir,'workspace'));service.state.models=[{id:input.entryId,provider:'custom',name:'A',baseUrl:input.baseUrl,modelId:input.id,protocol:input.protocol,hasKey:true},{id:'broken',provider:'custom',name:'B',baseUrl:'https://broken.invalid/v1',modelId:input.id,protocol:input.protocol,hasKey:true,contextWindow:16000,maxTokens:32000}];service.state.defaultModelId=input.entryId;
 await service.modelThinkingCapability({modelEntryId:input.entryId,refresh:true});const route=service.selectModelRoute({strategy:'fixed',taskType:'general',preferredEntryId:input.entryId});assert.equal(route.entryId,input.entryId);
 const id=await service.send(service.conversation(),'Fixture run','build','standard',input.entryId);const deadline=Date.now()+4000;while(service.state.runs.find(run=>run.id===id)?.status!=='succeeded'&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,10));
 assert.equal(service.state.runs.find(run=>run.id===id)?.status,'succeeded');assert.equal(seen?.model.contextWindow,200000);assert.equal(seen?.model.maxTokens,32000);assert.equal(calls,1);
});

test('settings inspect known and unknown saved entries without credentials; refresh stays local and actual execution still requires a key',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'slash-model-capacity-no-key-'));const store=new Store(path.join(dir,'data'));t.after(async()=>{store.close();await fs.rm(dir,{recursive:true,force:true});});let calls=0;
 const service=new Service(store,()=>'',()=>{},undefined,{fetchModelMetadata:async()=>{calls++;throw Error('Missing credentials must not cause metadata requests');}},()=>undefined);
 await service.workspace(path.join(dir,'workspace'));const catalog=getBuiltinModels('openai').find(model=>model.api==='openai-responses'&&model.contextWindow>model.maxTokens)!;
 service.state.models=[{id:'catalog-no-key',provider:'fixture-pi',name:'Pi catalog',baseUrl:catalog.baseUrl,modelId:catalog.id,protocol:'openai-responses',hasKey:false},{id:'proxy-no-key',provider:'fixture-proxy',name:'Same-name proxy',baseUrl:input.baseUrl,modelId:catalog.id,protocol:'openai-responses',hasKey:false}];
 service.state.defaultModelId='catalog-no-key';
 const local=await service.modelThinkingCapability({modelEntryId:'catalog-no-key'});assert.equal(local.limits?.contextWindow,catalog.contextWindow);assert.equal(local.limits?.maxTokens,catalog.maxTokens);assert.equal(local.limits?.source,'pi-catalog:openai');
 const refreshed=await service.modelThinkingCapability({modelEntryId:'catalog-no-key',refresh:true});assert.equal(refreshed.limits?.source,'pi-catalog:openai');assert.match(refreshed.limits?.reason??'',/尚未配置密钥/);
 const proxy=await service.modelThinkingCapability({modelEntryId:'proxy-no-key',refresh:true});assert.equal(proxy.limits?.status,'unverified');assert.equal(proxy.limits?.source,'unverified-compatibility');assert.equal(calls,0);
 await assert.rejects(service.modelThinkingCapability({modelEntryId:'missing-no-key'}),/MODEL_ENTRY_NOT_FOUND/);
 await assert.rejects(service.send(service.conversation(),'Execution must require credentials','build','standard','catalog-no-key'),/MODEL_ROUTE_(?:FIXED_)?UNAVAILABLE/);
 assert.equal(service.state.runs.length,0);
});
