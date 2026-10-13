import assert from 'node:assert/strict';
import test from 'node:test';
import {createServer} from 'node:http';
import {connect,type AddressInfo,type Socket} from 'node:net';
import type {Duplex} from 'node:stream';
import {closeModelProxyTransports} from '../main/model-proxy.js';
import {discoverModels} from '../main/model-discovery.js';
import {requestSchema,type State} from '../shared/types.js';
import {ModelSettings} from '../main/settings.js';
import {parseModelIds} from '../src/ModelPicker.js';

test('OpenAI 两个协议共用模型目录；Bearer、禁止重定向、去重且不推断能力',async()=>{
 for(const protocol of ['openai-completions','openai-responses'] as const){
  const result=await discoverModels({baseUrl:'https://fixture.invalid/v1/',protocol},'fixture-key',async(url,init)=>{
   assert.equal(String(url),'https://fixture.invalid/v1/models');assert.equal(init?.redirect,'error');assert.deepEqual(init?.headers,{Authorization:'Bearer fixture-key'});assert(init?.signal);
   return new Response(JSON.stringify({data:[{id:'b',capabilities:{vision:true}},{id:'a'},{id:'b'},null,{id:'bad space'}]}));
  });
  assert.deepEqual(result.models,[{id:'a',name:'a'},{id:'b',name:'b'}]);assert.match(result.notice,/单独测试/);
 }
});
test('Anthropic 根地址补v1、专用headers与after_id分页',async()=>{
 const requests:string[]=[];
 const result=await discoverModels({baseUrl:'https://fixture.invalid',protocol:'anthropic-messages'},'fixture-key',async(url,init)=>{
  requests.push(String(url));assert.deepEqual(init?.headers,{'x-api-key':'fixture-key','anthropic-version':'2023-06-01'});
  return new Response(JSON.stringify(requests.length===1?{data:[{id:'claude-a',display_name:'Claude A'}],has_more:true,last_id:'claude-a'}:{data:[{id:'claude-b'}],has_more:false,last_id:'claude-b'}));
 });
 assert.deepEqual(requests,['https://fixture.invalid/v1/models','https://fixture.invalid/v1/models?after_id=claude-a']);assert.equal(result.models.length,2);assert.equal(result.models[0].name,'Claude A');
});
test('模型发现真实GET沿用显式CONNECT代理，不向不可直连的域名回退',async t=>{
 const sockets=new Set<Socket|Duplex>(),requests:string[]=[],tunnels:string[]=[];
 const origin=createServer((req,res)=>{requests.push(req.url!);assert.equal(req.headers.authorization,'Bearer fixture-key');res.end('{"data":[{"id":"proxy-model"}]}');});
 await new Promise<void>(resolve=>origin.listen(0,'127.0.0.1',resolve));
 const proxy=createServer();proxy.on('connect',(req,socket,head)=>{tunnels.push(req.url!);sockets.add(socket);const upstream=connect((origin.address() as AddressInfo).port,'127.0.0.1',()=>{socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');if(head.length)upstream.write(head);socket.pipe(upstream);upstream.pipe(socket);});sockets.add(upstream);socket.on('error',()=>upstream.destroy());upstream.on('error',()=>socket.destroy());});
 await new Promise<void>(resolve=>proxy.listen(0,'127.0.0.1',resolve));
 t.after(async()=>{for(const socket of sockets)socket.destroy();await closeModelProxyTransports();origin.closeAllConnections();proxy.closeAllConnections();await Promise.all([new Promise<void>(resolve=>origin.close(()=>resolve())),new Promise<void>(resolve=>proxy.close(()=>resolve()))]);});
 const result=await discoverModels({baseUrl:'http://model-discovery-only.invalid:9999/v1',protocol:'openai-responses',proxyUrl:`http://127.0.0.1:${(proxy.address() as AddressInfo).port}`},'fixture-key');
 assert.deepEqual(result.models,[{id:'proxy-model',name:'proxy-model'}]);assert.deepEqual(requests,['/v1/models']);assert.deepEqual(tunnels,['model-discovery-only.invalid:9999']);
});
test('目录失败/无密钥/坏地址不冒充成功；错误正文不回显密钥；超大和死循环分页拒绝',async()=>{
 const config={baseUrl:'https://fixture.invalid/v1',protocol:'openai-responses' as const};let calls=0;
 await assert.rejects(discoverModels(config,'',async()=>{calls++;return new Response();}),/密钥/);assert.equal(calls,0);
 await assert.rejects(discoverModels({...config,baseUrl:'https://fixture.invalid/v1?key=x'},'k'),/API 地址/);
 await assert.rejects(discoverModels(config,'secret',async()=>new Response('secret',{status:404})),error=>error instanceof Error&&/手动/.test(error.message)&&!error.message.includes('secret'));
 await assert.rejects(discoverModels(config,'k',async()=>new Response('<html/>')),/JSON/);
 await assert.rejects(discoverModels(config,'k',async()=>new Response(JSON.stringify({models:[]}))),/格式不兼容/);
 await assert.rejects(discoverModels(config,'k',async()=>new Response('x',{headers:{'content-length':'2000001'}})),/过大/);
 await assert.rejects(discoverModels(config,'k',async()=>new Response(JSON.stringify({data:[{id:'a'}],has_more:true,last_id:'a'}))),/分页无效/);
 const empty=await discoverModels(config,'k',async()=>new Response('{"data":[]}'));assert.deepEqual(empty.models,[]);assert.match(empty.notice,/空列表/);
});
const fixture=()=>{
 const values=new Map<string,unknown>();let failEncryptionAt=0,encryptions=0;
 const state:State={root:'',mounts:[],conversations:[],changes:[],runs:[],connections:[],model:{baseUrl:'https://old.invalid/v1',id:'old',hasKey:false}};
 const settings=new ModelSettings({get:<T>(key:string,fallback:T)=>(values.get(key)??fallback) as T,set:(key,value)=>{values.set(key,value);}},{isEncryptionAvailable:()=>true,encryptString:value=>{if(++encryptions===failEncryptionAt)throw Error('fixture-key encryption failed');return Buffer.from(value);},decryptString:value=>value.toString()},{get:()=>state,save:()=>{}});
 settings.initialize();return{state,values,settings,failEncryptionAfter:(count:number)=>{failEncryptionAt=encryptions+count;}};
};
const batch=(overrides:Record<string,unknown>={})=>requestSchema.parse({type:'modelBatchAdd',connection:{provider:'fixture',baseUrl:'https://fixture.invalid/v1/',protocol:'openai-responses'},models:[{modelId:'a',name:'A'},{modelId:'b',name:'B'}],key:'fixture-key',...overrides}) as Extract<ReturnType<typeof requestSchema.parse>,{type:'modelBatchAdd'}>;
test('批量添加/重试去重保留旧项id密钥默认与Subagent引用；不同供应商保留',()=>{
 const f=fixture(),original=f.state.defaultModelId;
 const first=f.settings.batchAdd(batch());assert.deepEqual(first.items.map(item=>item.status),['added','added']);
 const a=f.settings.model(first.items[0].id!),before={...a};
 const subagentReference=a.id;
 const retry=f.settings.batchAdd(batch({key:'replacement-key'}));assert.deepEqual(retry.items.map(item=>item.status),['existing','existing']);assert.deepEqual(f.settings.model(a.id),before);assert.equal(f.settings.credential(a.id),'fixture-key');assert.equal(f.state.defaultModelId,original);assert.equal(f.settings.model(subagentReference).modelId,'a');
 const other=f.settings.batchAdd(batch({connection:{provider:'other',baseUrl:a.baseUrl,protocol:a.protocol}}));assert(other.items.every(item=>item.status==='added'));
 const repeated=f.settings.batchAdd(batch({models:[{modelId:'c',name:'C'},{modelId:'c',name:'C'}]}));assert.deepEqual(repeated.items.map(item=>item.status),['added','existing']);
});
test('保存密钥引用只允许原endpoint及协议，无需明文返UI；前置验证无写入',()=>{
 const f=fixture(),a=f.settings.batchAdd(batch()).items[0].id!;
 assert.equal(f.settings.connectionCredential({baseUrl:'https://fixture.invalid/v1',protocol:'openai-responses',credentialSourceId:a}),'fixture-key');
 for(const patch of [{baseUrl:'https://other.invalid/v1'},{protocol:'openai-completions' as const}])assert.throws(()=>f.settings.connectionCredential({baseUrl:'https://fixture.invalid/v1',protocol:'openai-responses',credentialSourceId:a,...patch}),/已变化/);
 const same=f.settings.batchAdd(batch({key:undefined,credentialSourceId:a,models:[{modelId:'c',name:'C'}]}));assert.equal(f.settings.credential(same.items[0].id!),'fixture-key');
 const before=JSON.stringify(f.state),secrets=[...f.values];
 const invalid={...batch(),models:[{modelId:'d',name:'D'},{modelId:'',name:'invalid'}]};assert.throws(()=>f.settings.batchAdd(invalid));assert.equal(JSON.stringify(f.state),before);assert.deepEqual([...f.values],secrets);
 assert.throws(()=>f.settings.batchAdd(batch({connection:{provider:'fixture',baseUrl:'https://fixture.invalid/v1',protocol:'openai-responses',maxTokens:100000}})),/同时明确配置/);assert.equal(JSON.stringify(f.state),before);
});
test('逐项保存失败回执可重试，成功项保留，草稿密钥不会出现在错误中',()=>{
 const f=fixture();f.failEncryptionAfter(2);const result=f.settings.batchAdd(batch());assert.deepEqual(result.items.map(item=>item.status),['added','failed']);assert(!result.items[1].error?.includes('fixture-key'));
 assert(f.settings.model(result.items[0].id!).hasKey);
 const retry=f.settings.batchAdd(batch());assert.deepEqual(retry.items.map(item=>item.status),['existing','added']);
});
test('多个手工ID按常见分隔符合并，不截断ID；batch schema限定100项',()=>{
 assert.deepEqual(parseModelIds('a\nb, c，a；d; e\t f'),['a','b','c','d','e','f']);assert.throws(()=>batch({models:Array.from({length:101},(_,i)=>({modelId:String(i),name:String(i)}))}));
});
