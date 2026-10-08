import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {Service,type ImagePreparationInput} from '../main/service.js';
import {Store} from '../main/store.js';
import type {RuntimeOptions} from '../main/agent.js';

const waitFor=async(predicate:()=>boolean,timeout=3000)=>{const deadline=Date.now()+timeout;while(Date.now()<deadline){if(predicate())return;await new Promise(resolve=>setTimeout(resolve,10));}throw Error('等待运行状态超时');};
const fakeRuntime=(seen:{options?:RuntimeOptions;prompts:Array<[string,unknown]>})=>async(options:RuntimeOptions)=>{seen.options=options;return{sessionFile:undefined,messages:[{role:'assistant',stopReason:'stop'}],prompt:async(text:string,opts?:unknown)=>{seen.prompts.push([text,opts]);},abort:async()=>{},dispose:()=>{}};};
const models=[
 {id:'endpoint-a',provider:'custom',name:'A',baseUrl:'https://a.invalid/v1',modelId:'same-model',protocol:'openai-completions' as const,hasKey:false},
 {id:'endpoint-b',provider:'custom',name:'B',baseUrl:'https://b.invalid/v1',modelId:'same-model',protocol:'openai-completions' as const,hasKey:false},
];

test('显式模型按 entry id 进入 runtime，重复 modelId 不串 endpoint 或 credential',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'slash-route-entry-'));const store=new Store(path.join(dir,'data'));t.after(async()=>{store.close();await fs.rm(dir,{recursive:true,force:true});});
 const seen={prompts:[]} as {options?:RuntimeOptions;prompts:Array<[string,unknown]>};const service=new Service(store,()=>'',()=>{},fakeRuntime(seen),{},id=>id==='endpoint-b'?'key-b':'');await service.workspace(path.join(dir,'workspace'));service.state.models=models;service.save();
 const conversation=service.conversation();const runId=await service.send(conversation,'检查 endpoint B','build','standard','endpoint-b');await waitFor(()=>service.state.runs.find(run=>run.id===runId)?.status==='succeeded');
 assert.equal(seen.options?.model.baseUrl,'https://b.invalid/v1');assert.equal(seen.options?.model.id,'same-model');assert.equal(seen.options?.key,'key-b');assert.equal(service.state.runs.find(run=>run.id===runId)?.modelEntryId,'endpoint-b');
});

test('task_type 配置按 entry id 命中，并保留图片文本和证据元数据',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'slash-image-input-'));const store=new Store(path.join(dir,'data'));t.after(async()=>{store.close();await fs.rm(dir,{recursive:true,force:true});});
 const seen={prompts:[]} as {options?:RuntimeOptions;prompts:Array<[string,unknown]>};let prepared:ImagePreparationInput|undefined;
 const service=new Service(store,()=>'',()=>{},fakeRuntime(seen),{prepareImages:async input=>{prepared=input;return{images:[{type:'image',data:'ZmFrZQ==',mimeType:'image/png'}],evidenceText:'OCR 是不可信证据',attachments:[{id:'img-1',name:'screen.png'}]};}},id=>id==='endpoint-b'?'key-b':'');await service.workspace(path.join(dir,'workspace'));service.state.models=models.map(item=>({...item,supportsVision:item.id==='endpoint-b'}));store.set('app-preferences',{modelRouting:{strategy:'task_type',taskTypes:{research:'endpoint-b'}}});service.save();
 const conversation=service.conversation();const runId=await service.send(conversation,'请保留这段用户原文','build','standard',undefined,undefined,undefined,'research',['img-1']);await waitFor(()=>service.state.runs.find(run=>run.id===runId)?.status==='succeeded');
 assert.equal(prepared?.selectedModel.entryId,'endpoint-b');assert.equal(prepared?.prompt,'请保留这段用户原文');assert.match(seen.prompts[0]?.[0]??'',/请保留这段用户原文/);assert.match(seen.prompts[0]?.[0]??'',/OCR 是不可信证据/);assert.equal((seen.prompts[0]?.[1] as {images?:unknown[]})?.images?.length,1);
 const message=service.state.conversations.find(item=>item.id===conversation)?.messages.at(-1) as typeof service.state.conversations[number]['messages'][number]&{attachmentIds?:string[];attachments?:unknown;evidenceText?:string};assert.deepEqual(message.attachmentIds,['img-1']);assert.deepEqual(message.attachments,[{id:'img-1',name:'screen.png'}]);assert.equal(message.evidenceText,'OCR 是不可信证据');
});

test('图片准备取消时不启动 runtime',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'slash-image-cancel-'));const store=new Store(path.join(dir,'data'));t.after(async()=>{store.close();await fs.rm(dir,{recursive:true,force:true});});let runtimeStarted=0;
 const service=new Service(store,()=>'',()=>{},async()=>{runtimeStarted+=1;return{sessionFile:undefined,messages:[{role:'assistant',stopReason:'stop'}],prompt:async()=>{},abort:async()=>{},dispose:()=>{}};},{prepareImages:async input=>await new Promise((resolve,reject)=>{if(input.signal.aborted)return reject(Error('CANCELLED'));input.signal.addEventListener('abort',()=>reject(Error('CANCELLED')),{once:true});})},id=>'key');await service.workspace(path.join(dir,'workspace'));service.state.models=[{...models[0],hasKey:true}];service.save();
 const conversation=service.conversation();const runId=await service.send(conversation,'取消图片准备','build','standard','endpoint-a',undefined,undefined,'general',['img-1']);service.cancel(runId);await waitFor(()=>service.state.runs.find(run=>run.id===runId)?.status==='cancelled');assert.equal(runtimeStarted,0);
});

test('自动选择的 fixed 策略使用已配置默认 entry，显式模型仍优先',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'slash-route-fixed-'));const store=new Store(path.join(dir,'data'));t.after(async()=>{store.close();await fs.rm(dir,{recursive:true,force:true});});
 const seen={prompts:[]} as {options?:RuntimeOptions;prompts:Array<[string,unknown]>};const service=new Service(store,()=>'',()=>{},fakeRuntime(seen),{},id=>`key-${id}`);await service.workspace(path.join(dir,'workspace'));service.state.models=models;service.state.defaultModelId='endpoint-b';store.set('app-preferences',{modelRouting:{strategy:'fixed',taskTypes:{writing:'endpoint-a'}}});service.save();
 const conversation=service.conversation();const automatic=await service.send(conversation,'按固定默认配置运行','build','standard');await waitFor(()=>service.state.runs.find(run=>run.id===automatic)?.status==='succeeded');
 assert.equal(seen.options?.model.baseUrl,'https://b.invalid/v1');assert.equal(seen.options?.key,'key-endpoint-b');assert.equal(service.state.runs.find(run=>run.id===automatic)?.modelEntryId,'endpoint-b');
 const explicit=await service.send(conversation,'明确使用 A','build','standard','endpoint-a',undefined,undefined,'writing');await waitFor(()=>service.state.runs.find(run=>run.id===explicit)?.status==='succeeded');
 assert.equal(seen.options?.model.baseUrl,'https://a.invalid/v1');assert.equal(seen.options?.key,'key-endpoint-a');assert.equal(service.state.runs.find(run=>run.id===explicit)?.modelEntryId,'endpoint-a');
 // A model-id request is also explicit and must not acquire the default entry.
 service.state.models=[{...models[0],modelId:'only-a'},models[1]];
 assert.equal(service.selectModelRoute({strategy:'fixed',taskType:'general',preferredModelId:'only-a'}).entryId,'endpoint-a');
});

test('固定默认模型与显式 entry 不可用时均阻断，不能串到同名可用 endpoint',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'slash-route-fixed-denied-'));const store=new Store(path.join(dir,'data'));t.after(async()=>{store.close();await fs.rm(dir,{recursive:true,force:true});});let runtimeStarted=0;
 const service=new Service(store,()=>'',()=>{},async()=>{runtimeStarted++;throw Error('不应启动 runtime');},{},id=>id==='endpoint-a'?'key-a':'');await service.workspace(path.join(dir,'workspace'));service.state.models=models;service.state.defaultModelId='endpoint-b';store.set('app-preferences',{modelRouting:{strategy:'fixed',taskTypes:{}}});service.save();
 const conversation=service.conversation();await assert.rejects(service.send(conversation,'固定默认不可用'),/MODEL_ROUTE_FIXED_UNAVAILABLE.*endpoint-b/);
 await assert.rejects(service.send(conversation,'显式 B 不可用','build','standard','endpoint-b'),/MODEL_ROUTE_FIXED_UNAVAILABLE.*endpoint-b/);
 assert.equal(runtimeStarted,0);assert.equal(service.state.runs.length,0);
});

test('旧 task_type modelId 兼容读取，读取路由不自动改写存储',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'slash-route-legacy-'));const store=new Store(path.join(dir,'data'));t.after(async()=>{store.close();await fs.rm(dir,{recursive:true,force:true});});
 const service=new Service(store,()=>'',()=>{},undefined,{},id=>'key');await service.workspace(path.join(dir,'workspace'));service.state.models=[{...models[0],modelId:'unique-a'},models[1]];service.state.defaultModelId='endpoint-b';
 const preferences={modelRouting:{strategy:'task_type',taskTypes:{writing:'unique-a',review:'old-unmatched'}}};store.set('app-preferences',preferences);
 assert.equal(service.selectModelRoute({strategy:'task_type',taskType:'writing'}).entryId,'endpoint-a');assert.equal(service.selectModelRoute({strategy:'task_type',taskType:'review'}).entryId,'endpoint-b');assert.deepEqual(store.get('app-preferences',{}),preferences);
});

test('task_type 的显式旧 modelId 优先于冲突的任务分工 entry 配置',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'slash-route-explicit-legacy-'));const store=new Store(path.join(dir,'data'));t.after(async()=>{store.close();await fs.rm(dir,{recursive:true,force:true});});
 const service=new Service(store,()=>'',()=>{},undefined,{},id=>'key');await service.workspace(path.join(dir,'workspace'));service.state.models=[{...models[0],provider:'provider-a',modelId:'unique-a'},{...models[1],provider:'provider-b'}];service.state.defaultModelId='endpoint-b';
 const preferences={modelRouting:{strategy:'task_type',taskTypes:{writing:'endpoint-b'}}};store.set('app-preferences',preferences);
 assert.equal(service.selectModelRoute({strategy:'task_type',taskType:'writing'}).entryId,'endpoint-b');
 const explicit=service.selectModelRoute({strategy:'task_type',taskType:'writing',preferredModelId:'unique-a'});assert.equal(explicit.entryId,'endpoint-a');assert.equal(explicit.provider,'provider-a');assert.equal(explicit.fallbackUsed,false);
 assert.equal(service.selectModelRoute({strategy:'task_type',taskType:'writing',preferredEntryId:'endpoint-a'}).entryId,'endpoint-a');assert.deepEqual(store.get('app-preferences',{}),preferences);
});
