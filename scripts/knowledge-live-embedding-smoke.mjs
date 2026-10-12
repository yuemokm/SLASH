import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {Store} from '../dist/main/store.js';
import {Service} from '../dist/main/service.js';
import {KnowledgeSettings} from '../dist/main/knowledge-settings.js';
import {createOpenAICompatibleEmbeddingProvider} from '../dist/main/knowledge-base.js';

// Explicitly authorized, bounded provider evaluation on synthetic PM material.
// No QA/chat request, retries, deployment, or real user documents are involved.
const apiKey=process.env.SLASH_TEST_EMBEDDING_KEY;
if(!apiKey?.trim())throw Error('SLASH_TEST_EMBEDDING_KEY_REQUIRED');
delete process.env.SLASH_TEST_EMBEDDING_KEY;
const connection={endpoint:'https://api.edgefn.net/v1/embeddings',model:'BAAI/bge-m3',revision:'provider-unversioned-2026-10-08',dimensions:1024};
const limits={requests:8,characters:12000},fixture=JSON.parse(await fs.readFile(new URL('../tests/fixtures/knowledge-pm-rules.json',import.meta.url),'utf8'));
const projectedCharacters=fixture.text.length*2+fixture.cases.reduce((sum,item)=>sum+item.question.length,0),projectedRequests=1+fixture.cases.length;
assert.equal(fixture.cases.length,5);assert(projectedRequests<=limits.requests);assert(projectedCharacters<=limits.characters); // Before constructing any network operation.
const output=path.resolve('.test-data',`knowledge-live-${Date.now()}`),profile=path.join(output,'profile'),workspace=path.join(output,'synthetic-project');await fs.mkdir(output,{recursive:true});
const report={status:'running',output,model:connection.model,dimensions:connection.dimensions,revision:connection.revision,limits,requests:0,sentCharacters:0,elapsedMs:0,cases:[],calls:[],userDocuments:0,qaCalls:0,deployments:0,retries:0,limitations:['Provider exposes an unversioned model name. The dated revision is a local test fingerprint, not a guarantee that the provider pins identical model weights.','Five synthetic PM retrieval cases do not certify full knowledge QA quality, real-user-document behavior, or deployment.']};
const started=Date.now(),provider=createOpenAICompatibleEmbeddingProvider({...connection,apiKey});
const budgeted={fingerprint:provider.fingerprint,async embed(texts,signal){
 const characters=texts.reduce((sum,text)=>sum+text.length,0);
 if(report.requests+1>limits.requests||report.sentCharacters+characters>limits.characters)throw Error('LIVE_EMBEDDING_BUDGET_EXCEEDED');
 report.requests++;report.sentCharacters+=characters;const at=Date.now();
 try{const result=await provider.embed(texts,signal);report.calls.push({request:report.requests,texts:texts.length,characters,dimensions:result.fingerprint.dimensions,elapsedMs:Date.now()-at,status:'succeeded'});return result;}
 catch(error){report.calls.push({request:report.requests,texts:texts.length,characters,elapsedMs:Date.now()-at,status:'failed'});throw error;}
}};
// Configuration and provider key remain in memory. The real Store persists only
// synthetic source/index state; no fake encryption is used for the live key.
class EphemeralSettings extends KnowledgeSettings{
 constructor(){super({get:(_key,fallback)=>fallback,set:()=>{throw Error('LIVE_CREDENTIAL_PERSISTENCE_FORBIDDEN');}},{isEncryptionAvailable:()=>false,encryptString:()=>{throw Error('LIVE_CREDENTIAL_PERSISTENCE_FORBIDDEN');},decryptString:()=>{throw Error('LIVE_CREDENTIAL_PERSISTENCE_FORBIDDEN');}});}
 view(){return{connection:{...connection},hasKey:true,encryptionAvailable:false};}
 authorizationRevision(){return 1;}
 provider(){return budgeted;}
}
let store,service;
try{
 store=new Store(profile);service=new Service(store,()=>{throw Error('LIVE_QA_MODEL_FORBIDDEN');},()=>{});service.configureKnowledgeSettings(new EphemeralSettings());await service.workspace(workspace);
 for(const capability of ['workspace_read','artifact_write','external_action'])service.setPermission(capability,'allow');
 const resource=service.state.mounts.find(mount=>mount.name==='资源');assert(resource);const source={mountId:resource.id,path:'参考资料/'+fixture.filename,displayName:fixture.filename};await fs.writeFile(path.join(resource.path,source.path),fixture.text);
 const base=await service.knowledgeCreate({title:'合成PM向量检索评测',sources:[source]}),built=await service.knowledgeBuild(base.id);assert.equal(built.lastBuild.status,'ready');assert.equal(built.lastBuild.fingerprint.dimensions,1024);report.chunkCount=built.lastBuild.totalChunks;await service.knowledgeActivateLocal(base.id,built.lastBuild.id);
 for(const [index,item] of fixture.cases.entries()){
  const at=Date.now(),result=await service.knowledgeSearch(base.id,item.question),rank=result.hits.findIndex(hit=>hit.text.includes(item.includes)&&!hit.text.includes(item.excludes))+1;
  report.cases.push({case:index+1,question:item.question,expectedRank:rank||null,returnedHits:result.hits.length,elapsedMs:Date.now()-at,sourceVersion:result.hits[0]?.document.originalHash,rankedSources:result.hits.map((hit,offset)=>({rank:offset+1,displayName:hit.document.source.displayName,locator:hit.locator,expectedEvidence:hit.text.includes(item.includes)&&!hit.text.includes(item.excludes)}))});
  assert.equal(rank,1,`LIVE_PM_EVIDENCE_RANK_FAILED_CASE_${index+1}`);
 }
 assert.equal(report.requests,6);assert(report.sentCharacters<=limits.characters);assert(!store.db.prepare('SELECT value FROM kv').all().some(row=>String(row.value).includes(apiKey)));report.status='passed';
}catch(error){report.status='failed';// Only stable codes/assertion labels, never provider body, headers or key.
 report.errorCode=error instanceof assert.AssertionError?String(error.message).split('\n')[0]:String(error instanceof Error?error.message:'LIVE_EMBEDDING_FAILED').split(':')[0];process.exitCode=1;
}finally{
 if(service){service.dispose();await Promise.allSettled([...service.agentIndex.queues.values()]);}if(store)store.close();report.elapsedMs=Date.now()-started;report.closed=true;await fs.writeFile(path.join(output,'result.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({status:report.status,output,model:report.model,dimensions:report.dimensions,requests:report.requests,sentCharacters:report.sentCharacters,cases:report.cases.map(item=>({case:item.case,expectedRank:item.expectedRank,elapsedMs:item.elapsedMs})),elapsedMs:report.elapsedMs,errorCode:report.errorCode}));
}
