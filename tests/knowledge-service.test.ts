import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {Document,Packer,Paragraph,TextRun} from 'docx';
import {Service} from '../main/service.js';
import {Store} from '../main/store.js';
import {KnowledgeSettings} from '../main/knowledge-settings.js';
import {createHash} from 'node:crypto';

const hash=(data:Buffer|string)=>createHash('sha256').update(data).digest('hex');
async function fixture(t:test.TestContext){
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'slash-knowledge-')),store=new Store(path.join(dir,'profile')),service=new Service(store,()=>{throw Error('NO_CHAT_OR_CLOUD');},()=>{});await service.workspace(path.join(dir,'project'));for(const permission of ['workspace_read','artifact_write','external_action'] as const)service.setPermission(permission,'allow');
 let hook:(()=>void|Promise<void>)|undefined,calls=0;const server=http.createServer(async(req,res)=>{let raw='';for await(const part of req)raw+=part;const input=JSON.parse(raw);assert.equal(req.headers.authorization,'Bearer dedicated-local-secret');calls++;await hook?.();res.setHeader('content-type','application/json');res.end(JSON.stringify({model:'local-embedding',data:input.input.map((text:string,index:number)=>({index,embedding:text.includes('图商')?[0,1,0]:[1,0,0]}))}));});await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
 const settings=new KnowledgeSettings(store,{isEncryptionAvailable:()=>true,encryptString:value=>Buffer.from('cipher:'+Buffer.from(value).toString('base64')),decryptString:value=>Buffer.from(value.toString().slice(7),'base64').toString()}),connection={endpoint:`http://127.0.0.1:${(server.address() as {port:number}).port}/v1/embeddings`,model:'local-embedding',revision:'fixture-v1',dimensions:3};settings.save({connection,apiKey:'dedicated-local-secret'});service.configureKnowledgeSettings(settings);
 t.after(async()=>{service.dispose();await Promise.allSettled([...(service as any).agentIndex.queues.values()]);await new Promise<void>(resolve=>server.close(()=>resolve()));store.close();assert.equal(path.dirname(dir),path.resolve(os.tmpdir()));await fs.rm(dir,{recursive:true,force:true,maxRetries:5,retryDelay:30});});
 const resource=service.state.mounts.find(m=>m.name==='资源')!,output=service.state.mounts.find(m=>m.name==='成果')!,source={mountId:resource.id,path:'参考资料/审批.md',displayName:'审批.md'};await fs.writeFile(path.join(resource.path,source.path),'定位地址为只读，不允许修改。');
 const ready=async(ref=source)=>{const base=await service.knowledgeCreate({title:'PM知识',sources:[ref]}),built=await service.knowledgeBuild(base.id);await service.knowledgeActivateLocal(base.id,built.lastBuild!.id);return base.id;};
 return{dir,store,service,settings,connection,resource,output,source,ready,get calls(){return calls;},set hook(value:(()=>void|Promise<void>)|undefined){hook=value;}};
}

test('formal Service uses real localhost embedding, immutable export, restart and restricted source locating',async t=>{
 const f=await fixture(t),id=await f.ready(),result=await f.service.knowledgeSearch(id,'定位地址能修改吗');assert.equal(result.status,'evidence');assert.match(result.hits[0].text,/只读/);assert.equal(await f.service.knowledgeSource(id,result.hits[0].chunkId),path.join(f.resource.path,f.source.path));
 const output={mountId:f.output.id,path:'待发布.knowledge.json'},receipt=await f.service.knowledgeExport(id,output),bundle=JSON.parse(await fs.readFile(path.join(f.output.path,output.path),'utf8'));assert.equal(bundle.manifestHash,receipt.manifestHash);assert(bundle.snapshot.chunks[0].embedding);assert(!JSON.stringify(bundle).includes('dedicated-local-secret'));assert.equal(f.store.operationsForRun('knowledge-export').length,1);
 await assert.rejects(f.service.knowledgeExport(id,output),/OUTPUT_EXISTS/);await assert.rejects(f.service.knowledgeExport(id,{mountId:f.source.mountId,path:f.source.path}),/REFERENCE_READ_ONLY/);assert.equal(await fs.readFile(path.join(f.resource.path,f.source.path),'utf8'),'定位地址为只读，不允许修改。');
 const reloaded=new Service(f.store,()=>{throw Error('NO_CLOUD');},()=>{});reloaded.configureKnowledgeSettings(f.settings);try{assert.equal((await reloaded.knowledgeInspectLocal(id)).totalChunks,1);assert.equal((await reloaded.knowledgeSearch(id,'定位地址')).indexId,result.indexId);}finally{reloaded.dispose();await Promise.allSettled([...(reloaded as any).agentIndex.queues.values()]);}
 f.service.setPermission('workspace_read','deny');await assert.rejects(f.service.knowledgeSource(id,result.hits[0].chunkId),/PERMISSION_DENIED/);await assert.rejects(f.service.knowledgeInspectLocal(id),/PERMISSION_DENIED/);
});
test('Office indexing uses protected registered copy once; query with write denied creates no new copy and original is unchanged',async t=>{
 const f=await fixture(t),source={...f.source,path:'参考资料/审批.docx'},buffer=await Packer.toBuffer(new Document({sections:[{children:[new Paragraph({children:[new TextRun('定位地址为只读，不允许修改。')]})]}]}));await fs.writeFile(path.join(f.resource.path,source.path),buffer);
 const id=await f.ready(source),before=JSON.stringify(f.store.db.prepare("SELECT key,value FROM kv WHERE key LIKE 'processing-copy:%' ORDER BY key").all()),changes=f.service.state.changes.length;assert.notEqual(before,'[]');f.service.setPermission('artifact_write','deny');const result=await f.service.knowledgeSearch(id,'定位地址能修改吗');assert.match(result.hits[0].text,/只读/);assert.equal(result.coverage.status,'partial');assert.equal(JSON.stringify(f.store.db.prepare("SELECT key,value FROM kv WHERE key LIKE 'processing-copy:%' ORDER BY key").all()),before);assert.equal(f.service.state.changes.length,changes);assert.equal(hash(await fs.readFile(path.join(f.resource.path,source.path))),hash(buffer));
 await fs.writeFile(path.join(f.resource.path,source.path),Buffer.concat([buffer,Buffer.from('changed')]));await assert.rejects(f.service.knowledgeSearch(id,'定位地址'),/SOURCE_CHANGED/);assert.equal((await f.service.knowledgeList())[0].status,'blocked');
});
test('service rechecks external permission, key rotation and mount revocation after query response; project isolation persists',async t=>{
 const f=await fixture(t),id=await f.ready();f.hook=()=>{f.service.setPermission('external_action','deny');};await assert.rejects(f.service.knowledgeSearch(id,'定位地址'),/PERMISSION_DENIED/);f.service.setPermission('external_action','allow');f.hook=()=>{f.settings.save({connection:f.connection,apiKey:'rotated-secret'});};await assert.rejects(f.service.knowledgeSearch(id,'定位地址'),/PERMISSION_DENIED/);f.settings.save({connection:f.connection,apiKey:'dedicated-local-secret'});f.hook=()=>{f.service.state.mounts.find(m=>m.id===f.source.mountId)!.enabled=false;};await assert.rejects(f.service.knowledgeSearch(id,'定位地址'),/AUTHORIZATION_CHANGED|PERMISSION_DENIED/);f.hook=undefined;f.service.state.mounts.find(m=>m.id===f.source.mountId)!.enabled=true;
 await f.service.workspace(path.join(f.dir,'other-project'));assert.deepEqual(await f.service.knowledgeList(),[]);await assert.rejects(f.service.knowledgeInspectLocal(id),/NOT_FOUND/);
});
test('cancel aborts an actual in-flight HTTP rebuild even when the previously active source changed; concurrent edits stay blocked',async t=>{
 const f=await fixture(t),id=await f.ready();await fs.appendFile(path.join(f.resource.path,f.source.path),'\n新规则：定位地址保持只读。');let received!:()=>void,release!:()=>void;const pending=new Promise<void>(resolve=>received=resolve),held=new Promise<void>(resolve=>release=resolve);f.hook=async()=>{received();await held;};const build=f.service.knowledgeBuild(id);try{await pending;await assert.rejects(f.service.knowledgeSetSources(id,[]),/BUILD_BUSY/);await assert.rejects(f.service.knowledgeRemove(id),/BUILD_BUSY/);await f.service.knowledgeCancelBuild(id);await assert.rejects(build,/CANCELLED/);const base=(await f.service.knowledgeList())[0];assert.equal(base.lastBuild!.status,'failed');assert(base.currentIndexId);await assert.rejects(f.service.knowledgeInspectLocal(id),/SOURCE_CHANGED/);}finally{release();}
});
