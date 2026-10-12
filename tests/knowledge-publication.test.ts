import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {KnowledgePublication} from '../main/knowledge-publication.js';
import type {KnowledgeExportBundle} from '../shared/knowledge-base.js';
import {requestSchema} from '../shared/types.js';
import {Service} from '../main/service.js';
import {Store} from '../main/store.js';
import {projectIdentity} from '../main/project-tree.js';
import {knowledgeCloudConfigSchema} from '../shared/knowledge-publication.js';

const sha=(value:string)=>createHash('sha256').update(value).digest('hex');
const member=randomUUID(),email='pm@example.test',kb=randomUUID(),project='project-fixture';
const cipher={isEncryptionAvailable:()=>true,encryptString:(value:string)=>Buffer.from('cipher:'+Buffer.from(value).toString('base64')),decryptString:(value:Buffer)=>Buffer.from(value.toString().slice(7),'base64').toString()};
function bundle():KnowledgeExportBundle {const text='审批规则：定位地址只读。',index=randomUUID(),document=randomUUID(),snapshot:KnowledgeExportBundle['snapshot']={knowledgeBaseId:kb,projectId:project,indexId:index,fingerprint:{provider:'openai-compatible:https://embedding.example.test/v1/embeddings',model:'fixture-vector',revision:'v1',dimensions:3},documents:[{id:document,source:{mountId:'private-mount',path:'private/审批.md',displayName:'审批.md'},originalHash:sha(text),textHash:sha(text),versionId:sha(text),parserVersion:'text-v1',coverage:{status:'complete',limitations:[]}}],chunks:[{id:randomUUID(),documentId:document,source:{mountId:'private-mount',path:'private/审批.md'},indexId:index,text,textHash:sha(text),locator:{kind:'lines',startLine:1,endLine:1,startCharacter:0,endCharacter:text.length},embedding:[1,0,0]}],coverage:{status:'complete',limitations:[]},createdAt:new Date().toISOString()};return{schemaVersion:1,title:'审批',snapshot,manifestHash:sha(JSON.stringify({schemaVersion:1,title:'审批',snapshot}))};}
async function fixture(t:test.TestContext){
 const values=new Map<string,unknown>(),store={get<T>(key:string,fallback:T):T{return structuredClone(values.has(key)?values.get(key):fallback) as T;},set(key:string,value:unknown){values.set(key,structuredClone(value));}};
 const receipts=new Map<string,Record<string,unknown>>(),requests:Array<{method:string;route:string;body?:any}>=[];let active:string|null=null,mode='ok',currentProject=project,sourceAvailable=true,currentBundle=bundle(),bundleCalls=0,hook:(()=>void)|undefined;
 const server=http.createServer(async(req,res)=>{assert.equal(req.headers.apikey,'fixture-publication-secret');assert.equal(req.headers.authorization,'Bearer fixture-publication-secret');let raw='';for await(const part of req)raw+=part;const body=raw?JSON.parse(raw):undefined,url=new URL(req.url!,'http://local');requests.push({method:req.method!,route:req.url!,body});res.setHeader('content-type','application/json');
  if(url.pathname==='/rest/v1/knowledge_bases'){hook?.();res.end(JSON.stringify(active?[{id:kb,active_version:active,sharing_enabled:true}]:[]));return;}
  if(url.pathname==='/auth/v1/admin/users'){res.end(JSON.stringify({users:[{id:member,email}]}));return;}
  if(url.pathname==='/auth/v1/admin/users/'+member){res.end(JSON.stringify({id:member,email}));return;}
  if(url.pathname==='/rest/v1/knowledge_publications'){const operation=url.searchParams.get('operation_id')?.slice(3),receipt=operation?receipts.get(operation):undefined;res.end(JSON.stringify(receipt?[receipt]:[]));return;}
  if(url.pathname.startsWith('/rest/v1/rpc/knowledge_')){if(['401','sql400','502'].includes(mode)){res.statusCode=mode==='sql400'?400:Number(mode);res.end(JSON.stringify({code:mode==='sql400'?'P0001':'gateway',message:'Fixture rejection'}));return;}const publish=url.pathname.endsWith('publish'),receipt={operation_id:body.p_operation,kb_id:publish?body.p_bundle.kb_id:body.p_kb,index_id:publish?body.p_bundle.index_id:active,manifest_hash:publish?body.p_bundle.manifest_hash:null,action:publish?'publish':'revoke',expected_active:body.p_expected_active,member_ids:publish?body.p_members:[]};receipts.set(body.p_operation,receipt);if(publish)active=body.p_bundle.index_id;if(mode==='disconnect'){req.socket.destroy();return;}res.end(JSON.stringify(mode==='mismatch'?{...receipt,member_ids:[randomUUID()]}:receipt));return;}
  res.statusCode=404;res.end('{}');
 });await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise<void>(resolve=>server.close(()=>resolve())));const target=`http://127.0.0.1:${(server.address() as {port:number}).port}`,config={supabaseUrl:target,webUrl:'https://knowledge.example.test',memberIds:[email]};
 const create=()=>new KnowledgePublication(store,cipher,{assertAccess:id=>{if(id!==currentProject)throw Error('PROJECT_CHANGED');},bundle:async()=>{bundleCalls++;if(!sourceAvailable)throw Error('SOURCE_CHANGED');return structuredClone(currentBundle);}});
 let domain=create();domain.save({config,apiKey:'fixture-publication-secret'});
 return{store,values,requests,receipts,config,get domain(){return domain;},restart(){domain=create();},get bundleCalls(){return bundleCalls;},get writeCount(){return requests.filter(r=>r.method==='POST').length;},set mode(v:string){mode=v;},set active(v:string|null){active=v;},set currentProject(v:string){currentProject=v;},set sourceAvailable(v:boolean){sourceAvailable=v;},set bundle(v:KnowledgeExportBundle){currentBundle=v;},set hook(v:(()=>void)|undefined){hook=v;}};
}
test('localhost official REST preflight resolves email, confirms RPC receipt and uploads only whitelisted cloud fields',async t=>{const f=await fixture(t),plan=await f.domain.preflight(project,kb,'publish');assert.equal(f.writeCount,0);assert.deepEqual(plan.memberAccounts,[email]);assert.deepEqual(plan.memberIds,[member]);const record=await f.domain.commit(project,kb,plan.token);assert.equal(record.status,'succeeded');assert.equal(f.writeCount,1);const payload=f.requests.find(r=>r.method==='POST')!.body.p_bundle;assert(!JSON.stringify(payload).includes('private-mount'));assert(!JSON.stringify(payload).includes('private/'));assert.equal(payload.chunks[0].keywords,'审批 批规 规则 定位 位地 地址 址只 只读');assert(!JSON.stringify(f.domain.settings()).includes('fixture-publication-secret'));assert(!JSON.stringify([...f.values]).includes('fixture-publication-secret'));await assert.rejects(f.domain.preflight(project,kb,'publish'),/ALREADY_PUBLISHED/);});
test('durable unknown survives restart; new writes blocked; reconcile reads original receipt and never repeats RPC',async t=>{const f=await fixture(t),plan=await f.domain.preflight(project,kb,'publish');f.mode='disconnect';const record=await f.domain.commit(project,kb,plan.token);assert.equal(record.status,'outcome_unknown');f.restart();await assert.rejects(f.domain.preflight(project,kb,'revoke'),/UNKNOWN/);await assert.rejects(f.domain.commit(project,kb,plan.token),/UNKNOWN/);assert.equal((await f.domain.reconcile(project,kb,record.operationId)).status,'succeeded');assert.equal(f.writeCount,1);});
test('missing/mismatched receipts remain unknown and member/operation binding rejects false confirmation',async t=>{const f=await fixture(t),plan=await f.domain.preflight(project,kb,'publish');f.mode='mismatch';const record=await f.domain.commit(project,kb,plan.token);assert.equal(record.status,'outcome_unknown');const correct=f.receipts.get(record.operationId)!;f.receipts.delete(record.operationId);assert.equal((await f.domain.reconcile(project,kb,record.operationId)).status,'outcome_unknown');f.receipts.set(record.operationId,{...correct,operation_id:randomUUID()});await assert.rejects(f.domain.reconcile(project,kb,record.operationId),/MISMATCH/);f.receipts.set(record.operationId,{...correct,member_ids:[randomUUID()]});await assert.rejects(f.domain.reconcile(project,kb,record.operationId),/MISMATCH/);assert.equal(f.writeCount,1);});
test('target, member configuration, local version, remote version and project changes invalidate publication before writes',async t=>{const f=await fixture(t);let plan=await f.domain.preflight(project,kb,'publish');f.domain.save({config:{...f.config,memberIds:[member]}});await assert.rejects(f.domain.commit(project,kb,plan.token),/EXPIRED/);plan=await f.domain.preflight(project,kb,'publish');f.bundle=bundle();await assert.rejects(f.domain.commit(project,kb,plan.token),/SOURCE_CHANGED/);plan=await f.domain.preflight(project,kb,'publish');f.active='another-version';await assert.rejects(f.domain.commit(project,kb,plan.token),/REMOTE_CHANGED/);f.active=null;plan=await f.domain.preflight(project,kb,'publish');f.currentProject='other-project';await assert.rejects(f.domain.commit(project,kb,plan.token),/PROJECT_CHANGED/);assert.equal(f.writeCount,0);});
test('source changed during final remote check blocks upload; confirmed revoke works after source deletion without reading original',async t=>{const f=await fixture(t);let plan=await f.domain.preflight(project,kb,'publish');f.hook=()=>{f.sourceAvailable=false;};await assert.rejects(f.domain.commit(project,kb,plan.token),/SOURCE_CHANGED/);assert.equal(f.writeCount,0);f.hook=undefined;f.sourceAvailable=true;plan=await f.domain.preflight(project,kb,'publish');await f.domain.commit(project,kb,plan.token);f.sourceAvailable=false;const before=f.bundleCalls,revoke=await f.domain.preflight(project,kb,'revoke'),record=await f.domain.commit(project,kb,revoke.token);assert.equal(record.status,'succeeded');assert.equal(record.action,'revoke');assert.equal(f.bundleCalls,before);assert.equal(f.writeCount,2);await assert.rejects(f.domain.preflight(project,kb,'revoke'),/NOT_PUBLISHED/);});
test('retired cloud and vector IPC reject every formerly valid operation while local collection IPC remains available',()=>{
 assert.throws(()=>knowledgeCloudConfigSchema.parse({supabaseUrl:'https://secret@example.test',webUrl:'https://example.test',memberIds:[email]}));
 const requests=[
  {type:'knowledgeBuild',id:kb},
  {type:'knowledgeCancelBuild',id:kb},
  {type:'knowledgeSearch',id:kb,question:'定位地址'},
  {type:'knowledgeExport',id:kb},
  {type:'knowledgeActivateLocal',id:kb,buildId:randomUUID()},
  {type:'knowledgeEmbeddingGet'},
  {type:'knowledgeEmbeddingSave',connection:{endpoint:'https://embedding.example.test/v1/embeddings',model:'fixture',revision:'v1',dimensions:3},apiKey:'fixture-key'},
  {type:'knowledgeCloudGet',id:kb},
  {type:'knowledgeCloudSave',config:{supabaseUrl:'https://cloud.example.test',webUrl:'https://knowledge.example.test',memberIds:[email]},apiKey:'fixture-key'},
  {type:'knowledgeCloudPreflight',id:kb,action:'publish'},
  {type:'knowledgeCloudPreflight',id:kb,action:'revoke'},
  {type:'knowledgeCloudCommit',id:kb,token:randomUUID(),confirmed:true},
  {type:'knowledgeCloudReconcile',id:kb,operationId:randomUUID()},
 ];
 for(const request of requests)assert.equal(requestSchema.safeParse(request).success,false,request.type);
 for(const type of ['knowledgeGet','knowledgeRemove','knowledgeInspectLocal'])assert.equal(requestSchema.safeParse({type,id:kb}).success,true,type);
 assert.equal(requestSchema.safeParse({type:'knowledgeList'}).success,true);
});
test('proven authentication/SQL rejection permits explicit repaired preflight; gateway failure remains unknown',async t=>{const f=await fixture(t);for(const mode of ['401','sql400']){f.mode=mode;const plan=await f.domain.preflight(project,kb,'publish'),record=await f.domain.commit(project,kb,plan.token);assert.equal(record.status,'failed');assert.match(record.errorCode!,/^HTTP_/);}f.mode='502';const plan=await f.domain.preflight(project,kb,'publish'),record=await f.domain.commit(project,kb,plan.token);assert.equal(record.status,'outcome_unknown');await assert.rejects(f.domain.preflight(project,kb,'publish'),/UNKNOWN/);assert.equal(f.writeCount,3);});
test('reconciling historical publication preserves the later stop-sharing record; wrong target cannot confirm an operation',async t=>{const f=await fixture(t),plan=await f.domain.preflight(project,kb,'publish'),published=await f.domain.commit(project,kb,plan.token),stop=await f.domain.preflight(project,kb,'revoke');await f.domain.commit(project,kb,stop.token);await f.domain.reconcile(project,kb,published.operationId);assert.equal(f.domain.records(project,kb)[0].action,'revoke');f.domain.save({config:{...f.config,supabaseUrl:'https://another.example.test'}});assert.equal(f.domain.settings().hasKey,false);await assert.rejects(f.domain.reconcile(project,kb,published.operationId),/TARGET_CHANGED/);assert.equal(f.writeCount,2);});
test('retired cloud publication cannot block local collection removal and its stored data remains intact',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'slash-cloud-local-')),store=new Store(path.join(dir,'profile')),service=new Service(store,()=>{throw Error('NO_MODEL');},()=>{});
 try{
  const workspace=path.join(dir,'workspace');await service.workspace(workspace);service.setPermission('external_action','deny');
  const base=await service.knowledgeCreate({title:'仅本机集合',sources:[]});
  const records=[{operationId:randomUUID(),projectId:projectIdentity(workspace),knowledgeBaseId:base.id,action:'publish',target:'https://cloud.example.test',status:'outcome_unknown'}];
  const config={supabaseUrl:'https://cloud.example.test',webUrl:'https://knowledge.example.test',memberIds:[email]};
  store.set('knowledge-cloud:records',records);store.set('knowledge-cloud:config',config);store.set('knowledge-cloud:secret','historical-encrypted-value');
  for(const method of ['configureKnowledgePublication','knowledgeCloudGet','knowledgeCloudSave','knowledgeCloudPreflight','knowledgeCloudCommit','knowledgeCloudReconcile'])assert.equal(method in service,false,method);
  assert.equal((await service.knowledgeList()).some(item=>item.id===base.id),true);
  await service.knowledgeRemove(base.id);
  assert.equal((await service.knowledgeList()).some(item=>item.id===base.id),false);
  assert.deepEqual(store.get('knowledge-cloud:records',[]),records);assert.deepEqual(store.get('knowledge-cloud:config',null),config);assert.equal(store.get('knowledge-cloud:secret',''),'historical-encrypted-value');
 }finally{service.dispose();await Promise.allSettled([...(service as any).agentIndex.queues.values()]);store.close();assert.equal(path.dirname(dir),path.resolve(os.tmpdir()));await fs.rm(dir,{recursive:true,force:true,maxRetries:5,retryDelay:30});}
});
