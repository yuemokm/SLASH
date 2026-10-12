import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import http from 'node:http';
import fs from 'node:fs';
const pmFixture=JSON.parse(fs.readFileSync(new URL('./fixtures/knowledge-pm-rules.json',import.meta.url),'utf8'));
import {KnowledgeBaseDomain,createOpenAICompatibleEmbeddingProvider,type EmbeddingProvider} from '../main/knowledge-base.js';
import {KnowledgeSettings} from '../main/knowledge-settings.js';
import {requestSchema} from '../shared/types.js';
import type {KnowledgeSourceRead} from '../shared/knowledge-base.js';

const hash=(text:string)=>createHash('sha256').update(text).digest('hex');
const source={mountId:'authorized',path:'规则.md',displayName:'规则'};
const read=(text:string):KnowledgeSourceRead=>({text,originalHash:hash(text),extractedHash:hash(text),versionId:hash(text),parserVersion:'local-text-v1',coverage:{status:'complete',limitations:[]}});
function memory(){const values=new Map<string,unknown>();return{values,get<T>(key:string,fallback:T):T{return structuredClone(values.has(key)?values.get(key):fallback) as T;},set(key:string,value:unknown){values.set(key,structuredClone(value));}};}
const fingerprint={provider:'fixture',model:'explicit-embedding',revision:'fixture-v1',dimensions:5};
const vector=(text:string)=>{if(text.includes('火星'))return[-1,0,0,0,0];const index=text.includes('定位地址')?0:text.includes('图商地址')?1:text.includes('首次录入')?2:text.includes('后续变更')?3:text.includes('空值')?4:-1;return Array.from({length:5},(_,n)=>index<0?-1:n===index?1:0);};
function fixture(){
 const store=memory(),texts=new Map([[source.path,'定位地址只读，图商地址可编辑。']]);let access=true,write=true,calls=0,hook:(()=>void)|undefined;
 const provider:EmbeddingProvider={fingerprint,async embed(texts){calls++;hook?.();return{fingerprint,vectors:texts.map(vector)};}};
 const domain=()=>new KnowledgeBaseDomain({store,projectId:()=>'project',assertAccess:(_id,w)=>{if(!access||w&&!write)throw Error('PERMISSION_DENIED');},assertSourceAccess:()=>{if(!access)throw Error('PERMISSION_DENIED');},readSource:async ref=>read(texts.get(ref.path)!),embedding:provider});
 return{store,texts,provider,domain,get calls(){return calls;},set access(value:boolean){access=value;},set write(value:boolean){write=value;},set hook(value:(()=>void)|undefined){hook=value;}};
}
async function ready(f:ReturnType<typeof fixture>,sources=[source]){const domain=f.domain(),base=await domain.create({title:'PM规则',sources}),built=await domain.build(base.id);await domain.activateLocalIndex(base.id,built.lastBuild!.id);return{domain,id:base.id};}

test('PM field evidence stays in its business row; read-only local retrieval binds source version and no-evidence',async()=>{
 const f=fixture();f.texts.set(source.path,pmFixture.text);
 const {domain,id}=await ready(f);f.write=false;
 const location=await domain.search(id,'定位地址能修改吗');assert.equal(location.status,'evidence');assert.match(location.hits[0].text,/定位地址.*只读/);assert.doesNotMatch(location.hits[0].text,/图商地址/);assert.equal(location.hits[0].document.originalHash,hash(f.texts.get(source.path)!));assert.equal(location.hits[0].locator.kind,'table_row');assert.equal(location.hits[0].locator.headerLine,1);
 for(const [question,expected,excluded] of [['图商地址能编辑吗','可编辑','定位地址'],['F首次录入是什么','首次登记','P后续变更'],['P后续变更是什么','更新已登记记录','F首次录入'],['空值就是否吗','不等于否','可编辑']]){const result=await domain.search(id,question);assert(result.hits[0].text.includes(expected));assert(!result.hits[0].text.includes(excluded));}
 assert.equal((await domain.search(id,'火星气候')).status,'no_evidence');assert.deepEqual(await domain.sourceForChunk(id,location.hits[0].chunkId),source);await assert.rejects(domain.sourceForChunk(id,'fabricated'),/CITATION_INVALID/);
 const snapshot=await domain.publishedSnapshot(id),bundle=await domain.exportBundle(id);assert.equal(bundle.manifestHash,hash(JSON.stringify({schemaVersion:1,title:'PM规则',snapshot})));assert(!JSON.stringify(bundle).includes('apiKey'));
});
test('changed source, revocation and index replacement during async embedding cannot return old evidence',async()=>{
 const f=fixture(),{domain,id}=await ready(f);f.hook=()=>{f.texts.set(source.path,'定位地址现已修改规则。');};await assert.rejects(domain.search(id,'定位地址'),/SOURCE_CHANGED/);assert.equal((await domain.list())[0].status,'blocked');assert.equal((await domain.get(id)).index,undefined);
 const g=fixture(),active=await ready(g);g.hook=()=>{g.access=false;};await assert.rejects(active.domain.search(active.id,'定位地址'),/PERMISSION_DENIED/);
 const h=fixture(),replacement=await ready(h);h.hook=()=>{void replacement.domain.stopSharing(replacement.id);};await assert.rejects(replacement.domain.search(replacement.id,'定位地址'),/RETRIEVAL_BLOCKED|SELECTION_CHANGED/);
});
test('failed batches persist completed vectors; explicit resume after restart reuses them and keeps old index until activation',async()=>{
 const f=fixture();f.texts.set(source.path,Array.from({length:70},(_,index)=>`第${index}条定位地址规则。`).join('\n\n'));let batches=0;f.provider.embed=async texts=>{batches++;if(batches===2)throw Error('EMBEDDING_RESULT_UNKNOWN');return{fingerprint,vectors:texts.map(vector)};};
 const domain=f.domain(),base=await domain.create({title:'可恢复',sources:[source]});await assert.rejects(domain.build(base.id),/RESULT_UNKNOWN/);const failed=(await domain.list())[0].lastBuild!;assert.equal(failed.status,'unknown');assert.equal(failed.completedChunks,32);assert.equal(failed.totalChunks,70);assert.equal((await domain.list())[0].currentIndexId,undefined);
 let resumedCount=0;f.provider.embed=async texts=>{resumedCount+=texts.length;return{fingerprint,vectors:texts.map(vector)};};const restarted=f.domain(),built=await restarted.build(base.id,{resumeBuildId:failed.id});assert.equal(resumedCount,38);assert.equal(built.lastBuild!.status,'ready');assert.equal(built.currentIndexId,undefined);await restarted.activateLocalIndex(base.id,failed.id);const calls=resumedCount;await restarted.build(base.id);assert.equal(resumedCount,calls);
 const key=[...f.store.values.keys()][0],state=f.store.get<any>(key,null);state.items[0].builds.at(-1).summary.status='staging';state.items[0].base.lastBuild.status='staging';f.store.set(key,state);const recovered=(await f.domain().list())[0];assert.equal(recovered.lastBuild!.status,'unknown');assert.equal(recovered.lastBuild!.errorCode,'KNOWLEDGE_BUILD_INTERRUPTED');
});
test('cancel, source change, mismatched model, invalid vectors and changed resume selection fail closed',async()=>{
 const f=fixture(),domain=f.domain(),base=await domain.create({title:'取消',sources:[source]});const controller=new AbortController();f.hook=()=>controller.abort();await assert.rejects(domain.build(base.id,{signal:controller.signal}),/CANCELLED/);assert.equal((await domain.list())[0].lastBuild!.status,'failed');f.hook=undefined;
 const failed=(await domain.list())[0].lastBuild!;f.texts.set(source.path,'定位地址改版。');await assert.rejects(domain.build(base.id,{resumeBuildId:failed.id}),/RESUME_SOURCE_CHANGED/);
 f.provider.embed=async texts=>({fingerprint:{...fingerprint,model:'other'},vectors:texts.map(vector)});await assert.rejects(domain.build(base.id),/FINGERPRINT_MISMATCH/);
 f.provider.embed=async texts=>({fingerprint,vectors:texts.map(()=>[0,0,0,0,0])});await assert.rejects(domain.build(base.id),/VECTOR_INVALID/);await domain.setSources(base.id,[]);await assert.rejects(domain.build(base.id,{resumeBuildId:failed.id}),/NO_SOURCES/);
 await assert.rejects(domain.create({title:'重复',sources:[source,source]}),/DUPLICATE_SOURCE/);assert.throws(()=>requestSchema.parse({type:'knowledgeCreate',title:'越界',sources:[{mountId:'m',path:'../secret'}]}));
});
test('CSV multiline records keep separate row provenance; malformed and oversized rows reject',async()=>{
 const f=fixture(),csv={...source,path:'规则.csv'};f.texts.set(csv.path,'字段,规则\n定位地址,"只读\n禁止修改"\n图商地址,可编辑');const {domain,id}=await ready(f,[csv]);const snapshot=await domain.publishedSnapshot(id);assert.equal(snapshot.chunks.length,3);assert.equal(snapshot.chunks[1].locator.row,2);assert.equal(snapshot.chunks[1].locator.startLine,2);assert.equal(snapshot.chunks[1].locator.endLine,3);assert.doesNotMatch(snapshot.chunks[1].text,/图商地址/);
 const bad=fixture();bad.texts.set(csv.path,'字段,规则\n定位地址,"未闭合');const base=await bad.domain().create({title:'坏CSV',sources:[csv]});await assert.rejects(bad.domain().build(base.id),/CSV_INVALID/);bad.texts.set(csv.path,'字段,规则\n定位地址,'+'字'.repeat(2000));await assert.rejects(bad.domain().build(base.id),/TABLE_ROW_LIMIT/);
});
test('real localhost HTTP embeddings enforces auth, exact model/dimension and response indices without cloud claims',async t=>{
 const requests:any[]=[];let mode='valid';const server=http.createServer(async(req,res)=>{let body='';for await(const part of req)body+=part;const input=JSON.parse(body);requests.push({url:req.url,auth:req.headers.authorization,body:input});res.setHeader('content-type','application/json');res.end(JSON.stringify({model:mode==='wrong-model'?'alias':'explicit-embedding',data:input.input.map((text:string,index:number)=>({index:mode==='duplicate'?0:index,embedding:mode==='wrong-dimension'?[1]:vector(text)})).reverse()}));});
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise<void>(resolve=>server.close(()=>resolve())));const address=server.address() as {port:number},provider=createOpenAICompatibleEmbeddingProvider({endpoint:`http://127.0.0.1:${address.port}/v1/embeddings`,apiKey:'dedicated-fixture-secret',model:fingerprint.model,revision:fingerprint.revision,dimensions:5});
 const result=await provider.embed(['定位地址','图商地址']);assert.deepEqual(result.vectors,[[1,0,0,0,0],[0,1,0,0,0]]);assert.equal(requests[0].auth,'Bearer dedicated-fixture-secret');assert.equal(requests[0].url,'/v1/embeddings');assert.equal(requests[0].body.dimensions,5);
 mode='wrong-model';await assert.rejects(provider.embed(['定位地址']),/MODEL_MISMATCH/);mode='wrong-dimension';await assert.rejects(provider.embed(['定位地址']),/VECTOR_INVALID/);mode='duplicate';await assert.rejects(provider.embed(['定位地址','图商地址']),/RESPONSE_INVALID/);const controller=new AbortController();controller.abort();await assert.rejects(provider.embed(['定位地址'],controller.signal),/CANCELLED/);
 assert.throws(()=>createOpenAICompatibleEmbeddingProvider({endpoint:'http://example.com/embeddings',apiKey:'x',model:'m',revision:'v',dimensions:5}),/ENDPOINT_INVALID/);
});
test('embedding credentials have a dedicated encrypted scope, endpoint changes clear old key and no chat fallback exists',()=>{
 const store=memory(),cipher={isEncryptionAvailable:()=>true,encryptString:(value:string)=>Buffer.from('cipher:'+Buffer.from(value).toString('base64')),decryptString:(value:Buffer)=>Buffer.from(value.toString().slice(7),'base64').toString()},settings=new KnowledgeSettings(store,cipher),connection={endpoint:'http://localhost:1234/embeddings',model:'m',revision:'v',dimensions:5};store.set('chat-secret','chat-only-secret');assert.equal(settings.provider(),undefined);settings.save({connection,apiKey:'embedding-only-secret'});assert.equal(settings.view().hasKey,true);assert(!JSON.stringify(settings.view()).includes('embedding-only-secret'));assert(!JSON.stringify([...store.values]).includes('embedding-only-secret'));assert(settings.provider());const revision=settings.authorizationRevision();settings.save({connection:{...connection,endpoint:'http://localhost:2345/embeddings'}});assert.equal(settings.view().hasKey,false);assert.equal(settings.provider(),undefined);assert(settings.authorizationRevision()>revision);assert.throws(()=>new KnowledgeSettings(store,{...cipher,isEncryptionAvailable:()=>false}).save({connection,apiKey:'x'}),/ENCRYPTION_UNAVAILABLE/);
});
