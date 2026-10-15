import assert from 'node:assert/strict';
import test from 'node:test';
import type {State} from '../shared/types.js';
import {connectionSchema,requestSchema} from '../shared/types.js';
import {modelProxyUrlSchema} from '../shared/model-proxy.js';
import {DEFAULT_BAISHAN_MODEL,ModelSettings,discoverInstalledClis} from '../main/settings.js';
import {ModelThinkingResolver} from '../main/model-thinking.js';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {Store} from '../main/store.js';

class MemoryStore {
 values=new Map<string,unknown>();
 get<T>(key:string,fallback:T):T{return(this.values.has(key)?this.values.get(key):fallback) as T;}
 set(key:string,value:unknown){this.values.set(key,value);}
}
const cipher={isEncryptionAvailable:()=>true,encryptString:(value:string)=>Buffer.from('protected:'+value),decryptString:(value:Buffer)=>value.toString().replace(/^protected:/,'')};
function legacyState(model:State['model']={baseUrl:'https://api.edgefn.net/v1',id:'DeepSeek-V4-Flash-0731',hasKey:true}):State{return{root:'',mounts:[],conversations:[],changes:[],runs:[],connections:[],model};}
function fixture(state=legacyState()){
 const store=new MemoryStore();let saves=0;
 return{store,state,get saves(){return saves;},settings:new ModelSettings(store,cipher,{get:()=>state,save:()=>{saves++;}})};
}
test('真实SQLite事务在state写入失败时同时回滚密钥与模型，保留原配置并可重试',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'slash-settings-transaction-')),store=new Store(dir),state=legacyState();
 t.after(async()=>{store.close();assert.equal(path.dirname(dir),os.tmpdir());assert(path.basename(dir).startsWith('slash-settings-transaction-'));await fs.rm(dir,{recursive:true,force:true});});
 const settings=new ModelSettings(store,cipher,{get:()=>state,save:()=>{store.set('state',state);store.set('save-companion','written');}});settings.initialize();
 const model=settings.upsert({provider:'fixture',name:'Original',baseUrl:'https://fixture.invalid/v1',modelId:'a'},'original-key'),before=structuredClone(state);
 store.db.exec("CREATE TRIGGER fail_state BEFORE UPDATE ON kv WHEN NEW.key='state' BEGIN SELECT RAISE(ABORT,'fixture state write failure'); END");
 assert.throws(()=>settings.upsert({...model,name:'Changed'},'replacement-key'),/fixture state write failure/);
 assert.deepEqual(state,before);assert.deepEqual(store.get('state',null),JSON.parse(JSON.stringify(before)));assert.equal(settings.credential(model.id),'original-key');
 assert.throws(()=>settings.upsert({provider:'fixture',name:'New',baseUrl:model.baseUrl,modelId:'b'},'new-key'),/fixture state write failure/);
 assert.equal(store.db.prepare("SELECT count(*) AS total FROM kv WHERE key LIKE 'model-secret:%' AND value!='\"\"'").get()!.total,1);
 store.db.exec('DROP TRIGGER fail_state');settings.upsert({...model,name:'Changed'},'replacement-key');assert.equal(settings.credential(model.id),'replacement-key');assert.equal(store.get<State>('state',state).models?.find(entry=>entry.id===model.id)?.name,'Changed');
 assert.throws(()=>store.transaction(()=>{store.set('nested-fixture','outer');assert.throws(()=>store.transaction(()=>{store.set('nested-fixture','inner');throw Error('inner failure');}),/inner failure/);assert.equal(store.get('nested-fixture',''),'outer');throw Error('outer failure');}),/outer failure/);
 assert.equal(store.get('nested-fixture','missing'),'missing');
});

test('保存后按每个模型GET能力并缓存，普通列表不调用推理，检测失败不撤销保存',async()=>{
 const f=fixture();f.settings.initialize();const urls:string[]=[];
 const resolver=new ModelThinkingResolver(async(url,options)=>{assert.equal(options?.method,undefined);urls.push(String(url));const id=decodeURIComponent(new URL(String(url)).pathname.split('/').at(-1)!);return new Response(JSON.stringify({id,capabilities:{thinking:{types:{enabled:{supported:true},adaptive:{supported:false}}},effort:{low:{supported:id==='a'},high:{supported:true}}}}));},f.store);
 const detect=async(id:string)=>{const model=f.settings.model(id);return resolver.resolve({entryId:id,baseUrl:model.baseUrl,id:model.modelId,protocol:model.protocol},{refresh:true,key:f.settings.credential(id)});};
 const a=await f.settings.upsertWithCapabilities({provider:'same',name:'A',baseUrl:'https://fixture.invalid/v1',modelId:'a'},'fixture-a',detect);
 const b=await f.settings.upsertWithCapabilities({provider:'same',name:'B',baseUrl:a.baseUrl,modelId:'b'},'fixture-b',detect);
 const cached=await resolver.resolve({entryId:a.id,baseUrl:a.baseUrl,id:'a',protocol:a.protocol});assert.deepEqual(cached.capability.levels,['low','high']);
 const other=await resolver.resolve({entryId:b.id,baseUrl:b.baseUrl,id:'b',protocol:b.protocol});assert.deepEqual(other.capability.levels,['high']);assert.deepEqual(urls,['https://fixture.invalid/v1/models/a','https://fixture.invalid/v1/models/b']);
 const saved=await f.settings.upsertWithCapabilities({...a,name:'检测失败仍保存'},undefined,async()=>{throw Error('fixture timeout');});assert.equal(saved.name,'检测失败仍保存');assert.equal(f.settings.credential(a.id),'fixture-a');assert(f.settings.list().flatMap(g=>g.models).some(model=>model.id===b.id));
});

test('模型手动代理可持久化、旧调用省略保留、null清除；不会改默认模型或密钥',()=>{
 const f=fixture();f.settings.initialize();const originalDefault=f.state.defaultModelId;const input={provider:'custom',name:'proxy',baseUrl:'https://gateway.invalid/v1',modelId:'proxy-fixture',proxyUrl:' http://127.0.0.1:7897 '};
 const saved=f.settings.upsert(input,'fixture-original-secret');assert.equal(saved.proxyUrl,'http://127.0.0.1:7897');assert.equal(f.settings.list().flatMap(g=>g.models).find(m=>m.id===saved.id)?.proxyUrl,saved.proxyUrl);
 const {proxyUrl:_,...withoutProxy}=saved;const retained=f.settings.upsert({...withoutProxy,name:'edited'});assert.equal(retained.proxyUrl,saved.proxyUrl);assert.equal(f.settings.credential(saved.id),'fixture-original-secret');
 const cleared=f.settings.upsert({...withoutProxy,proxyUrl:null});assert.equal(cleared.proxyUrl,undefined);assert.equal(f.settings.credential(saved.id),'fixture-original-secret');assert.equal(f.state.defaultModelId,originalDefault);assert.doesNotMatch(JSON.stringify(f.state),/fixture-original-secret/);
});

test('非法模型代理先拒绝，保留已有配置和密钥，renderer与IPC复用同一校验',()=>{
 const f=fixture();f.settings.initialize();const saved=f.settings.upsert({provider:'custom',name:'proxy',baseUrl:'https://gateway.invalid/v1',modelId:'proxy-fixture'},'fixture-original-secret');const before=JSON.stringify(f.state),secrets=[...f.store.values.entries()];
 for(const proxyUrl of ['socks5://localhost:1080','http://user:password@localhost:8080','http://localhost/path','http://localhost?token=private']){assert(!modelProxyUrlSchema.safeParse(proxyUrl).success);assert(!requestSchema.safeParse({type:'modelUpsert',model:{...saved,proxyUrl}}).success);assert.throws(()=>f.settings.upsert({...saved,proxyUrl},'fixture-replacement-secret'),/代理地址/);assert.equal(JSON.stringify(f.state),before);assert.deepEqual([...f.store.values.entries()],secrets);}
});

test('旧单模型和 safeStorage 密文迁移为独立 Baishan 模型条目',()=>{
 const f=fixture();f.store.set('key',Buffer.from('protected:legacy-secret').toString('base64'));
 const groups=f.settings.initialize();
 assert.equal(groups[0].provider,'baishan');assert.equal(groups[0].models[0].id,DEFAULT_BAISHAN_MODEL.id);
 assert.equal(groups[0].models[0].name,'Baishan DeepSeek-V4-Flash-0731');assert.equal(f.state.defaultModelId,DEFAULT_BAISHAN_MODEL.id);
 assert.equal(f.settings.credential(DEFAULT_BAISHAN_MODEL.id),'legacy-secret');assert.equal(f.store.get('key','missing'),'');
 assert.equal(JSON.stringify(f.state).includes('legacy-secret'),false);assert.ok(f.saves>=1);
});

test('迁移在新密文已写入而旧键尚未清理时可幂等恢复',()=>{
 const f=fixture();const encrypted=Buffer.from('protected:survives').toString('base64');
 f.store.set('key',encrypted);f.store.set('model-secret:'+DEFAULT_BAISHAN_MODEL.id,encrypted);
 f.settings.initialize();assert.equal(f.settings.credential(DEFAULT_BAISHAN_MODEL.id),'survives');assert.equal(f.store.get('key','x'),'');
});

test('无效的已保存模型配置会中止迁移并保留旧密文',()=>{
 const state=legacyState();state.models=[{...DEFAULT_BAISHAN_MODEL,baseUrl:'file:///not-an-api'}];
 const f=fixture(state);f.store.set('key','encrypted-before-migration');
 assert.throws(()=>f.settings.initialize(),/SETTINGS_MIGRATION_FAILED/);assert.equal(f.store.get('key',''),'encrypted-before-migration');
});

test('同一模型可配置不同 endpoint，条目 ID 独立且切换 endpoint 不复用旧密钥',()=>{
 const f=fixture({...legacyState(),model:{baseUrl:'https://one.example/v1',id:'same-model',hasKey:false}});f.settings.initialize();
 const first=f.settings.upsert({provider:'custom',name:'Endpoint A',baseUrl:'https://a.example/v1',modelId:'same-model'},'key-a');
 const second=f.settings.upsert({provider:'custom',name:'Endpoint B',baseUrl:'https://b.example/v1',modelId:'same-model'},'key-b');
 assert.notEqual(first.id,second.id);assert.equal(f.settings.credential(first.id),'key-a');
 const moved=f.settings.upsert({...first,baseUrl:'https://new.example/v1'});assert.equal(moved.hasKey,false);assert.throws(()=>f.settings.credential(first.id),/未配置密钥/);
});

test('不能删除最后一个模型，默认模型始终指向现存条目',()=>{
 const f=fixture();f.settings.initialize();assert.throws(()=>f.settings.remove(DEFAULT_BAISHAN_MODEL.id),/至少保留一个/);
 const extra=f.settings.upsert({provider:'openai',name:'GPT',baseUrl:'https://api.openai.com/v1',modelId:'gpt-test'});
 f.settings.setDefault(extra.id);f.settings.remove(DEFAULT_BAISHAN_MODEL.id);assert.equal(f.state.defaultModelId,extra.id);
});

test('官方 CLI 发现从 PATH 返回通用连接候选与能力',async()=>{
 const calls:string[]=[];
 const result=await discoverInstalledClis(async(executable,args)=>{
  calls.push([executable,...args].join(' '));
  if(executable==='where.exe')return{stdout:String(args[0]).startsWith('lark')?'C:\\Tools\\lark-cli.exe\n':'D:\\Tools\\dws.exe\n'};
  return{stdout:executable.includes('lark')?'lark 1.2.3':'dws 2.0.0'};
 });
 assert.equal(result.length,2);assert.ok(result.every(item=>item.available&&item.command.endsWith('.exe')));assert.ok(result.every(item=>item.capabilities.length>0));assert.ok(calls.some(item=>item.includes('--version')));
});

test('连接与设置 IPC schema 接受通用 CLI 和新的模型权限接口',()=>{
 const connection=connectionSchema.parse({id:'github-cli',name:'GitHub CLI',kind:'cli',command:'C:\\Tools\\gh.exe',args:[],enabled:true,provider:'github',capabilities:['repository.read']});
 assert.equal(connection.provider,'github');
 assert.equal(requestSchema.parse({type:'modelUpsert',model:{provider:'custom',name:'内部模型',baseUrl:'https://models.example/v1',modelId:'same-model'}}).type,'modelUpsert');
 assert.equal(requestSchema.parse({type:'permissionSet',capability:'process_execute',decision:'ask'}).type,'permissionSet');
 assert.equal(requestSchema.parse({type:'shareSetup'}).type,'shareSetup');
 const automatic=requestSchema.parse({type:'modelRoute',taskType:'writing'});assert.equal(automatic.type,'modelRoute');if(automatic.type==='modelRoute')assert.equal(automatic.strategy,undefined);
 const explicit=requestSchema.parse({type:'modelRoute',strategy:'fixed',taskType:'general',preferredEntryId:'endpoint-b'});assert.equal(explicit.type,'modelRoute');if(explicit.type==='modelRoute')assert.equal(explicit.preferredEntryId,'endpoint-b');
 assert.throws(()=>requestSchema.parse({type:'modelUpsert',model:{provider:'custom',name:'危险配置',baseUrl:'https://user:secret@models.example/v1',modelId:'m'}}));
 assert.throws(()=>connectionSchema.parse({id:'bad',name:'缺失 CLI',kind:'cli',command:'',args:[],enabled:true,available:false}));
});

test('旧格式无 protocol 条目 initialize 后自动补齐 openai-completions',()=>{
 const state=legacyState();
 const legacyModel=JSON.parse(JSON.stringify(DEFAULT_BAISHAN_MODEL)) as Record<string,unknown>;
 delete legacyModel.protocol;
 state.models=[legacyModel as unknown as NonNullable<State['models']>[number]];
 const f=fixture(state);
 const groups=f.settings.initialize();
 assert.equal(groups[0].models[0].protocol,'openai-completions');
 assert.equal(f.settings.model(DEFAULT_BAISHAN_MODEL.id).protocol,'openai-completions');
});

test('upsert 保存 protocol 并可读回',()=>{
 const f=fixture();f.settings.initialize();
 const saved=f.settings.upsert({provider:'anthropic',name:'Claude 兼容',baseUrl:'https://api.anthropic.com/v1',modelId:'claude-test',protocol:'anthropic-messages'});
 assert.equal(saved.protocol,'anthropic-messages');
 assert.equal(f.settings.model(saved.id).protocol,'anthropic-messages');
 const responses=f.settings.upsert({provider:'custom',name:'Responses 模型',baseUrl:'https://api.openai.com/v1',modelId:'gpt-responses',protocol:'openai-responses',supportsVision:true});
 assert.equal(f.settings.model(responses.id).protocol,'openai-responses');
 assert.equal(f.settings.model(responses.id).supportsVision,true);
});

test('modelUpsert schema 拒绝非法 protocol 且接受合法值默认补齐',()=>{
 assert.throws(()=>requestSchema.parse({type:'modelUpsert',model:{provider:'custom',name:'坏协议',baseUrl:'https://models.example/v1',modelId:'m',protocol:'grpc'}}));
 const parsed=requestSchema.parse({type:'modelUpsert',model:{provider:'custom',name:'默认协议',baseUrl:'https://models.example/v1',modelId:'m'}});
 assert.equal((parsed as {model:{protocol:string}}).model.protocol,'openai-completions');
 const claude=requestSchema.parse({type:'modelUpsert',model:{provider:'custom',name:'Claude',baseUrl:'https://models.example/v1',modelId:'m',protocol:'anthropic-messages'}});
 assert.equal((claude as {model:{protocol:string}}).model.protocol,'anthropic-messages');
});

test('模型手动限额保存后保留；旧caller遗漏不删除，null恢复自动且重启迁移不丢失',()=>{
 const f=fixture();f.settings.initialize();const saved=f.settings.upsert({provider:'custom',name:'容量',baseUrl:'https://capacity.invalid/v1',modelId:'capacity',contextWindow:200000,maxTokens:32000},'original-key');
 const renamed=f.settings.upsert({id:saved.id,provider:saved.provider,name:'新名称',baseUrl:saved.baseUrl,modelId:saved.modelId});assert.equal(renamed.contextWindow,200000);assert.equal(renamed.maxTokens,32000);assert.equal(f.settings.credential(saved.id),'original-key');
 f.settings.initialize();assert.equal(f.settings.model(saved.id).contextWindow,200000);
 const reset=f.settings.upsert({...renamed,contextWindow:null,maxTokens:null});assert.equal(reset.contextWindow,undefined);assert.equal(reset.maxTokens,undefined);assert.equal(f.settings.credential(saved.id),'original-key');
 f.settings.initialize();assert.equal(f.settings.model(saved.id).maxTokens,undefined);
});

test('解析限额冲突须在写密钥和state之前拒绝，独立字段对最终自动值校验',()=>{
 const f=fixture();f.settings.initialize();const saved=f.settings.upsert({provider:'custom',name:'容量',baseUrl:'https://capacity.invalid/v1',modelId:'capacity',contextWindow:200000,maxTokens:32000},'original-key');
 const before=JSON.stringify(f.state),secrets=[...f.store.values.entries()];
 assert.throws(()=>f.settings.upsert({...saved,contextWindow:16000,maxTokens:32000},'replacement-key'),/最大输出/);assert.equal(JSON.stringify(f.state),before);assert.deepEqual([...f.store.values.entries()],secrets);assert.equal(f.settings.credential(saved.id),'original-key');
 assert.throws(()=>f.settings.upsert({...saved,contextWindow:null,maxTokens:100000},'replacement-key'),/同时明确配置/);assert.equal(f.settings.credential(saved.id),'original-key');
});

test('模型identity改变不隐式继承遗漏覆盖，明确传值仍可保留',()=>{
 const f=fixture();f.settings.initialize();const saved=f.settings.upsert({provider:'custom',name:'容量',baseUrl:'https://capacity.invalid/v1',modelId:'capacity',contextWindow:200000,maxTokens:32000},'original-key');
 const moved=f.settings.upsert({id:saved.id,provider:saved.provider,name:saved.name,baseUrl:'https://other.invalid/v1',modelId:saved.modelId});assert.equal(moved.contextWindow,undefined);assert.equal(moved.maxTokens,undefined);assert.equal(moved.hasKey,false);
 const explicit=f.settings.upsert({...moved,modelId:'capacity-new',contextWindow:180000,maxTokens:24000});assert.equal(explicit.contextWindow,180000);assert.equal(explicit.maxTokens,24000);
});
