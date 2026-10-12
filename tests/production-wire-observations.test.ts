import test from 'node:test';
import {Store} from '../main/store.js';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {randomUUID,createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {analyzeProductionWireObservations,readProductionWireObservations,verifyProductionWireObservations,canonicalProductionWireIdentity,productionWireProjectionHash} from '../main/production-wire-observations.js';
import type {ProductionWireSafeEvent,ProductionWireSafeParameters} from '../shared/production-wire-observations.js';

const runId=randomUUID(),parameters:ProductionWireSafeParameters={source:'pi-on-payload',thinkingType:'absent',reasoningEffort:'absent',maxTokens:'absent',maxCompletionTokens:'absent',maxOutputTokens:12000,nativeContextWindow:65536};
function event(sequence:number,source:ProductionWireSafeEvent['source']='other',extra:Partial<ProductionWireSafeEvent>={}):ProductionWireSafeEvent{return{eventId:randomUUID(),runId,streamId:'run:'+runId,sequence,type:source==='other'?'delta':'status',occurredAt:new Date(Date.UTC(2026,9,11,0,0,0,sequence)).toISOString(),source,activity:source==='other'?'missing':'model',payloadValid:true,...extra};}
const request=(sequence:number,extra:Partial<ProductionWireSafeEvent>={})=>event(sequence,'provider_request',{parameters:{...parameters},...extra});
const start=(sequence:number)=>event(sequence,'compaction_start',{activity:'compacting',compaction:{reason:'threshold',status:'running'}});
const end=(sequence:number)=>event(sequence,'compaction_end',{activity:'model',compaction:{reason:'threshold',status:'completed'}});
const analyze=(events:ProductionWireSafeEvent[])=>analyzeProductionWireObservations({runId,streamId:'run:'+runId,events});
async function sqliteFixture(t:test.TestContext,events:ProductionWireSafeEvent[],changePayload?:(event:ProductionWireSafeEvent,payload:string)=>string){
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'slash-wire-observations-')),databasePath=path.join(dir,'events.sqlite'),db=new DatabaseSync(databasePath);db.exec('CREATE TABLE events(event_id TEXT,stream_id TEXT,sequence INTEGER,type TEXT,run_id TEXT,text TEXT,occurred_at TEXT,payload TEXT)');
 const insert=db.prepare('INSERT INTO events VALUES(?,?,?,?,?,?,?,?)');db.exec('BEGIN');
 for(const item of events){const runtimeStatus={activity:item.activity,...(item.compaction?{compaction:item.compaction}:{}),...(item.parameters?{requestDiagnostics:{source:item.parameters.source,thinkingType:item.parameters.thinkingType,reasoningEffort:item.parameters.reasoningEffort,...Object.fromEntries(['maxTokens','maxCompletionTokens','maxOutputTokens'].filter(key=>typeof(item.parameters as any)[key]==='number').map(key=>[key,(item.parameters as any)[key]]))},context:{contextWindow:item.parameters.nativeContextWindow}}:{})};const payload=JSON.stringify({eventId:item.eventId,streamId:item.streamId,sequence:item.sequence,runId:item.runId,type:item.type,text:item.source==='other'?'PRIVATE_EVENT_TEXT_MUST_NEVER_APPEAR':item.source,occurredAt:item.occurredAt,runtimeStatus,prompt:'PRIVATE_PROMPT_MUST_NEVER_APPEAR',apiKey:'SECRET_KEY_MUST_NEVER_APPEAR',body:{password:'PRIVATE_BODY_MUST_NEVER_APPEAR'}});insert.run(item.eventId,item.streamId,item.sequence,item.type,item.runId,item.source==='other'?'PRIVATE_EVENT_TEXT_MUST_NEVER_APPEAR':item.source,item.occurredAt,changePayload?changePayload(item,payload):payload);}
 db.exec('COMMIT');db.close();t.after(()=>fs.rm(dir,{recursive:true,force:true}));return databasePath;
}
const fileHash=async(file:string)=>createHash('sha256').update(await fs.readFile(file)).digest('hex');

test('SQLite reader is truly read-only and binds a complete window without selecting any private body',async t=>{
 const file=await sqliteFixture(t,[request(1),event(2)]),before=await fileHash(file),evidence=readProductionWireObservations({databasePath:file,runId});assert.equal(await fileHash(file),before);assert.equal(evidence.window.complete,true);assert.equal(evidence.comparable,true);assert.equal(evidence.window.count,2);assert.equal(verifyProductionWireObservations(evidence),true);assert.equal(evidence.latestRequestParameters?.maxOutputTokens,12000);assert.equal(evidence.providerInternalCapability,'unknown');assert.doesNotMatch(JSON.stringify(evidence),/PRIVATE_|SECRET_KEY|password|apiKey|prompt/);assert.deepEqual(canonicalProductionWireIdentity(evidence).mainProfile,parameters);
});
test('actual native compaction window separates auxiliary budget from main profile with exact event binding',async t=>{
 const events=[request(1),start(2),request(3,{activity:'compacting',compaction:{reason:'threshold',status:'running'},parameters:{...parameters,maxOutputTokens:8192}}),end(4),request(5)];const file=await sqliteFixture(t,events),before=await fileHash(file),evidence=readProductionWireObservations({databasePath:file,runId});assert.equal(await fileHash(file),before);assert.equal(evidence.comparable,true);assert.equal(evidence.mainProfileSignatures.length,1);assert.equal(evidence.mainProfileSignatures[0].count,2);assert.equal(evidence.observations[1].stage,'native_compaction');assert.equal(evidence.observations[1].compactionStartSequence,2);assert.deepEqual(evidence.nativeCompactionWindows[0],{startSequence:2,endSequence:4,reason:'threshold',endStatus:'completed',requestSequences:[3]});assert.equal(canonicalProductionWireIdentity(evidence).mainProfile.maxOutputTokens,12000);assert.equal(evidence.phaseBasis,'event_window_correlation');
});
test('counts, event IDs, timestamps and Run identities do not enter canonical configuration identity',()=>{
 const one=analyze([request(1)]),otherId=randomUUID(),other=analyzeProductionWireObservations({runId:otherId,streamId:'run:'+otherId,events:[request(1),request(2)].map(row=>({...row,runId:otherId,streamId:'run:'+otherId,eventId:randomUUID()}))});assert.notEqual(one.window.projectionHash,other.window.projectionHash);assert.equal(productionWireProjectionHash(canonicalProductionWireIdentity(one)),productionWireProjectionHash(canonicalProductionWireIdentity(other)));assert.notEqual(one.mainProfileSignatures[0].count,other.mainProfileSignatures[0].count);
});
test('known main-session drift preserves full coverage but rejects fixed comparable identity',()=>{
 const evidence=analyze([request(1),request(2,{parameters:{...parameters,maxOutputTokens:8192}})]);assert.equal(evidence.window.complete,true);assert.equal(evidence.comparable,false);assert.ok(evidence.comparisonReasons.includes('MAIN_PROFILE_DRIFT'));assert.throws(()=>canonicalProductionWireIdentity(evidence),/PRODUCTION_WIRE_IDENTITY_UNKNOWN/);
});
test('actual SQLite 5000-row retained window beginning at sequence 2 is incomplete, never repaired by counting',async t=>{
 const events=Array.from({length:5000},(_,index)=>index===0?request(2):event(index+2)),file=await sqliteFixture(t,events),before=await fileHash(file),evidence=readProductionWireObservations({databasePath:file,runId});assert.equal(await fileHash(file),before);assert.equal(evidence.window.count,5000);assert.equal(evidence.window.minSequence,2);assert.equal(evidence.window.maxSequence,5001);assert.equal(evidence.window.complete,false);assert.ok(evidence.window.reasons.includes('SEQUENCE_GAP'));assert.throws(()=>canonicalProductionWireIdentity(evidence));
});
test('SQLite duplicates and a different Run binding remain present and fail coverage',async t=>{
 const first=request(1),file=await sqliteFixture(t,[first,{...first},{...request(2),runId:randomUUID()}]),evidence=readProductionWireObservations({databasePath:file,runId});assert.equal(evidence.safeEvents.length,3);assert.ok(evidence.window.reasons.includes('DUPLICATE_EVENT'));assert.ok(evidence.window.reasons.includes('DUPLICATE_SEQUENCE'));assert.ok(evidence.window.reasons.includes('EVENT_BINDING_MISMATCH'));assert.equal(evidence.comparable,false);
});
test('bad or missing SQLite payload is retained as invalid without printing raw malformed content',async t=>{
 for(const payload of ['BROKEN_SECRET_PRIVATE_BODY','{}']){const file=await sqliteFixture(t,[request(1)],()=>payload),before=await fileHash(file),evidence=readProductionWireObservations({databasePath:file,runId});assert.equal(await fileHash(file),before);assert.equal(evidence.safeEvents.length,1);assert.equal(evidence.window.complete,false);assert.ok(evidence.window.reasons.includes('INVALID_PAYLOAD'));assert.doesNotMatch(JSON.stringify(evidence),/BROKEN_SECRET|PRIVATE_BODY/);}
});
test('unknown diagnostic projection and missing actual provider context cannot become fixed identity',()=>{
 for(const partial of [{reasoningEffort:'unrecognized'},{source:'unknown'},{nativeContextWindow:'unknown'},{maxOutputTokens:'unknown'}] as Partial<ProductionWireSafeParameters>[]){const evidence=analyze([request(1,{parameters:{...parameters,...partial}})]);assert.equal(evidence.window.complete,false);assert.ok(evidence.window.reasons.includes('UNKNOWN_PARAMETERS'));assert.throws(()=>canonicalProductionWireIdentity(evidence));}
});
test('an open native compaction or an unpaired/overlapping window is never inferred from budget',()=>{
 for(const events of [[request(1),start(2),request(3,{activity:'compacting',compaction:{reason:'threshold',status:'running'}})],[request(1),end(2)],[request(1),start(2),start(3),end(4)]]){const evidence=analyze(events);assert.equal(evidence.window.complete,false);assert.equal(evidence.comparable,false);assert.throws(()=>canonicalProductionWireIdentity(evidence));}
});
test('unknown activity and mismatched compaction phase reject ambiguous request classification',()=>{
 for(const events of [[request(1,{activity:'tool'})],[request(1,{activity:'compacting',compaction:{reason:'threshold',status:'running'}})],[request(1),start(2),request(3,{activity:'model'}),end(4)],[request(1),start(2),event(3,'compaction_end',{activity:'model',compaction:{reason:'manual',status:'completed'}})]])assert.equal(analyze(events).comparable,false);
});
test('forged summary/hash, observations or comparability fail self consistency verification',()=>{
 const evidence=analyze([request(1)]);for(const mutate of [(value:any)=>value.window.projectionHash='a'.repeat(64),(value:any)=>value.observations[0].safeParameters.maxOutputTokens=777,(value:any)=>value.window.complete=false]){const forged=structuredClone(evidence);mutate(forged);assert.equal(verifyProductionWireObservations(forged),false);assert.throws(()=>canonicalProductionWireIdentity(forged));}
});
test('self-consistent forged JSON does not bind a different actual SQLite projection',async t=>{
 const file=await sqliteFixture(t,[request(1)]),actual=readProductionWireObservations({databasePath:file,runId}),forged=analyze([request(1,{parameters:{...parameters,maxOutputTokens:777}})]);assert.equal(verifyProductionWireObservations(forged),true,'Self verification proves only internal consistency.');assert.notEqual(actual.window.projectionHash,forged.window.projectionHash);assert.notEqual(productionWireProjectionHash(actual.observations),productionWireProjectionHash(forged.observations));
});

 test('SQLite text classification is bound to payload text without returning either arbitrary text',async t=>{
  for(const side of ['column','payload']){
   const file=await sqliteFixture(t,[request(1)]),db=new DatabaseSync(file);
   if(side==='column')db.exec("UPDATE events SET text='PRIVATE_CHANGED_TEXT'");
   else db.exec("UPDATE events SET payload=json_set(payload,'$.text','PRIVATE_CHANGED_TEXT')");
   db.close();const before=await fileHash(file),evidence=readProductionWireObservations({databasePath:file,runId});
   assert.equal(await fileHash(file),before);assert.equal(evidence.window.complete,false);assert.ok(evidence.window.reasons.includes('INVALID_PAYLOAD'));assert.doesNotMatch(JSON.stringify(evidence),/PRIVATE_CHANGED_TEXT/);
  }
  const file=await sqliteFixture(t,[request(1),event(2)]),db=new DatabaseSync(file);db.exec("UPDATE events SET text=NULL,payload=json_set(payload,'$.text',NULL) WHERE sequence=2");db.close();assert.equal(readProductionWireObservations({databasePath:file,runId}).window.complete,true);
 });

test('real Store appendEvent normalizes empty text to NULL without losing complete identity',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'slash-wire-real-store-')),store=new Store(dir);t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 store.appendEvent({type:'status',runId,text:'provider_request',runtimeStatus:{activity:'model',requestDiagnostics:{source:'pi-on-payload',thinkingType:'absent',reasoningEffort:'absent',maxOutputTokens:12000},context:{contextWindow:65536}} as any});
 store.appendEvent({type:'delta',runId,text:''});store.appendEvent({type:'delta',runId});
 assert.equal(store.db.prepare('SELECT text IS NULL AS columnNull FROM events WHERE sequence=2').get()!.columnNull,1);store.close();
 const databasePath=path.join(dir,'slash.sqlite'),before=await fileHash(databasePath),evidence=readProductionWireObservations({databasePath,runId});
 assert.equal(await fileHash(databasePath),before);assert.equal(evidence.window.count,3);assert.equal(evidence.window.complete,true);assert.equal(evidence.comparable,true);assert.equal(verifyProductionWireObservations(evidence),true);
});
