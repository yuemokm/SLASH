import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {requestSchema} from '../shared/types.js';
import {Service} from '../main/service.js';
import {Store} from '../main/store.js';
import {projectIdentity} from '../main/project-tree.js';

const email='pm@example.test',kb=randomUUID();

test('retired cloud and vector IPC reject every formerly valid operation while local collection IPC remains available',()=>{
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
