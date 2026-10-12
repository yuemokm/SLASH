import {DatabaseSync} from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import type {Event} from '../shared/types.js';
import {migrateStore} from './store-migrations.js';
import {recoveryRecordSchema,type RecoveryRecord} from '../shared/run-recovery.js';

export type DurableEvent=Event&{eventId:string;streamId:string;sequence:number;occurredAt:string};
export type EventReplay={events:DurableEvent[];streamId:string;afterSequence:number;latestSequence:number;earliestSequence:number;gap:boolean;hasMore:boolean};

export class Store {
 db:DatabaseSync;
 private closeHandlers=new Set<()=>void>();
 constructor(public dir:string){
  fs.mkdirSync(dir,{recursive:true});
  this.db=new DatabaseSync(path.join(dir,'slash.sqlite'));
  try{migrateStore(this.db,dir);this.db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;');}catch(error){this.db.close();throw error;}
 }
 get<T>(key:string,fallback:T):T{const r=this.db.prepare('SELECT value FROM kv WHERE key=?').get(key);return r?JSON.parse(String(r.value)):fallback;}
 set(key:string,value:unknown){this.db.prepare('INSERT INTO kv VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key,JSON.stringify(value));}
 /** Host-only: one binding claim and its first Operation/recovery receipt share
  * one transaction. A crashed claimant therefore never leaves a missing receipt. */
 claimOperationBinding(input:{key:string;operationId:string;runId:string;tool:string;initialResult:string;recovery:RecoveryRecord}){
  const recovery=recoveryRecordSchema.parse(input.recovery);
  if(!/^operation-binding:[a-f0-9]{64}$/.test(input.key)||recovery.operationId!==input.operationId||recovery.runId!==input.runId||recovery.tool!==input.tool||recovery.dispatch!=='may_have_run'||recovery.resolution!=='pending'||!recovery.scopeHash||!recovery.requestHash)throw Error('OPERATION_BINDING_IDENTITY');
  JSON.parse(input.initialResult);
  this.db.exec('BEGIN IMMEDIATE');try{
   const owner=this.get<{operationId:string;runId:string;tool:string}|null>(input.key,null);
   if(owner){const operation=this.operationsForRun(owner.runId).find(value=>value.id===owner.operationId);const record=this.recoveryForOperation(owner.operationId);if(!operation||!record||operation.tool!==owner.tool||record.scopeHash!==recovery.scopeHash||record.requestHash!==recovery.requestHash)throw Error('OPERATION_BINDING_CORRUPT');this.db.exec('COMMIT');return{claimed:false,operation};}
   if(this.db.prepare('SELECT id FROM operations WHERE id=?').get(input.operationId)||this.recoveryForOperation(input.operationId))throw Error('OPERATION_ID_ALREADY_USED');
   this.db.prepare('INSERT INTO kv VALUES(?,?)').run(input.key,JSON.stringify({operationId:input.operationId,runId:input.runId,tool:input.tool}));
   this.db.prepare('INSERT INTO operations VALUES(?,?,?,?,?,?)').run(input.operationId,input.runId,input.tool,'executing',input.initialResult,new Date().toISOString());
   this.saveRecovery(recovery);this.db.exec('COMMIT');return{claimed:true,operation:this.operationsForRun(input.runId).find(value=>value.id===input.operationId)!};
  }catch(error){this.db.exec('ROLLBACK');throw error;}
 }
 /** Compare exact old result and all host identities. CAS retries only reread
  * SQLite; this method never dispatches or retries external work. */
 compareAndSwapOperationResult(input:{key:string;operationId:string;runId:string;tool:string;scopeHash:string;requestHash:string;expectedResult:string;nextResult:string;state:'executing'|'outcome_unknown'|'succeeded';verifiedDone?:boolean}){
  JSON.parse(input.nextResult);this.db.exec('BEGIN IMMEDIATE');try{
   const owner=this.get<{operationId:string;runId:string;tool:string}|null>(input.key,null),operation=this.operationsForRun(input.runId).find(value=>value.id===input.operationId),recovery=this.recoveryForOperation(input.operationId);
   if(!owner||owner.operationId!==input.operationId||owner.runId!==input.runId||owner.tool!==input.tool||!operation||operation.tool!==input.tool||!recovery||recovery.scopeHash!==input.scopeHash||recovery.requestHash!==input.requestHash)throw Error('OPERATION_BINDING_IDENTITY');
   if(operation.result!==input.expectedResult||['failed','cancelled'].includes(operation.state)||operation.state==='succeeded'&&input.state!=='succeeded'){this.db.exec('COMMIT');return false;}
   // Like operation(), allow facts to be added to the SAME terminal state;
   // settled recovery identity/resolution is never changed or reopened.
   if(recovery.dispatch==='settled'&&!(operation.state==='succeeded'&&input.state==='succeeded'&&recovery.resolution==='verified_done')||input.state==='succeeded'&&!input.verifiedDone||input.verifiedDone&&input.state!=='succeeded')throw Error('OPERATION_RECOVERY_TERMINAL');
   this.db.prepare('UPDATE operations SET result=?,state=? WHERE id=? AND result=?').run(input.nextResult,input.state,input.operationId,input.expectedResult);
   if(input.verifiedDone&&recovery.dispatch!=='settled')this.saveRecovery({...recovery,dispatch:'settled',resolution:'verified_done',resolvedBy:'host',evidenceRefs:[...recovery.evidenceRefs,'operation:'+input.operationId],updatedAt:new Date().toISOString()});
   this.db.exec('COMMIT');return true;
  }catch(error){this.db.exec('ROLLBACK');throw error;}
 }
 operation(id:string,runId:string,tool:string,state:string,result=''){this.db.prepare("INSERT INTO operations VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET state=excluded.state,result=excluded.result WHERE operations.state NOT IN ('succeeded','failed','cancelled') OR operations.state=excluded.state").run(id,runId,tool,state,result,new Date().toISOString());}
 /** Finish one tool attempt once. General operation() still permits explicit
  * report updates and reconciliation of legacy unknown external outcomes. */
 finishOperation(id:string,runId:string,tool:string,state:'succeeded'|'failed'|'cancelled'|'outcome_unknown',result=''){
  this.db.exec('BEGIN IMMEDIATE');try{
   this.db.prepare("INSERT INTO operations VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET state=excluded.state,result=CASE WHEN excluded.result='' THEN operations.result ELSE excluded.result END WHERE operations.state NOT IN ('succeeded','failed','cancelled','outcome_unknown')").run(id,runId,tool,state,result,new Date().toISOString());
   const record=this.recoveryForOperation(id),actual=this.operationsForRun(runId).find(item=>item.id===id);
   // A failure after dispatch is not proof of no effect. Keep the failure
   // receipt, while separately retaining the unresolved side-effect barrier.
   if(record&&actual&&actual.state!=='outcome_unknown'&&(actual.state==='succeeded'||(['failed','cancelled'].includes(actual.state)&&(record.dispatch==='not_sent'||record.effect==='read'))))this.saveRecovery({...record,dispatch:'settled',resolution:actual.state==='succeeded'?'verified_done':'verified_not_done',resolvedBy:'host',updatedAt:new Date().toISOString()});
   this.db.exec('COMMIT');
  }catch(error){this.db.exec('ROLLBACK');throw error;}
 }
 saveRecovery(input:RecoveryRecord){const record=recoveryRecordSchema.parse(input),existing=this.recoveryForOperation(record.operationId);if(existing&&(existing.runId!==record.runId||existing.tool!==record.tool||existing.effect!==record.effect))throw Error('RECOVERY_IDENTITY_MISMATCH');if(existing?.dispatch==='settled'&&(record.dispatch!=='settled'||existing.resolution!==record.resolution))throw Error('RECOVERY_TERMINAL_STATE: 已核对事实不能倒退');this.db.prepare('INSERT INTO operation_recovery VALUES(?,?,?,?,?,?,?) ON CONFLICT(operation_id) DO UPDATE SET dispatch=excluded.dispatch,resolution=excluded.resolution,evidence_json=excluded.evidence_json,updated_at=excluded.updated_at').run(record.operationId,record.runId,record.effect,record.dispatch,record.resolution,JSON.stringify(record),record.updatedAt);return record;}
 recoveryForOperation(id:string):RecoveryRecord|undefined{const row=this.db.prepare('SELECT evidence_json FROM operation_recovery WHERE operation_id=?').get(id);return row?recoveryRecordSchema.parse(JSON.parse(String(row.evidence_json))):undefined;}
 recoveryForRun(id:string):RecoveryRecord[]{return this.db.prepare('SELECT evidence_json FROM operation_recovery WHERE run_id=? ORDER BY updated_at').all(id).map(row=>recoveryRecordSchema.parse(JSON.parse(String(row.evidence_json))));}
 operationsForRun(runId:string){return this.db.prepare('SELECT id,run_id as runId,tool,state,result,created_at as createdAt FROM operations WHERE run_id=? ORDER BY created_at DESC').all(runId) as Array<{id:string;runId:string;tool:string;state:string;result:string;createdAt:string}>;}

 /** Append one event atomically and assign a monotonic sequence per stream. */
 appendEvent(event:Event):DurableEvent{
  const streamId=event.streamId||(event.runId?`run:${event.runId}`:'global');
  const occurredAt=event.occurredAt||new Date().toISOString();
  const eventId=event.eventId||randomUUID();
  const row=this.db.prepare('SELECT COALESCE(MAX(sequence),0) + 1 AS next FROM events WHERE stream_id=?').get(streamId) as {next:number};
  const sequence=Number(row.next)||1;
  const durable={...event,eventId,streamId,sequence,occurredAt} as DurableEvent;
  this.db.prepare('INSERT INTO events(event_id,stream_id,sequence,type,run_id,text,occurred_at,payload) VALUES(?,?,?,?,?,?,?,?)').run(eventId,streamId,sequence,durable.type,durable.runId||null,durable.text||null,occurredAt,JSON.stringify(durable));
  // Keep a bounded replay window per stream. A reconnect older than this
  // window receives gap=true and must refresh the state snapshot first.
  this.db.prepare('DELETE FROM events WHERE stream_id=? AND sequence <= (SELECT MAX(sequence)-5000 FROM events WHERE stream_id=?)').run(streamId,streamId);
  return durable;
 }

 replayEvents(streamId:string,afterSequence=0,limit=500):EventReplay{
  const safeLimit=Math.max(1,Math.min(1000,Math.trunc(limit)||500));
  const latestRow=this.db.prepare('SELECT COALESCE(MAX(sequence),0) AS latest FROM events WHERE stream_id=?').get(streamId) as {latest:number};
  const earliestRow=this.db.prepare('SELECT COALESCE(MIN(sequence),0) AS earliest FROM events WHERE stream_id=?').get(streamId) as {earliest:number};
  const latest=Number(latestRow.latest)||0;const earliest=Number(earliestRow.earliest)||0;const after=Math.max(0,Math.trunc(afterSequence)||0);
  const gap=earliest>0&&after<earliest-1;
  const rows=this.db.prepare('SELECT event_id as eventId,stream_id as streamId,sequence,type,run_id as runId,text,occurred_at as occurredAt,payload FROM events WHERE stream_id=? AND sequence>? ORDER BY sequence ASC LIMIT ?').all(streamId,after,safeLimit) as Array<Record<string,unknown>>;
  const events=rows.map(row=>{try{return JSON.parse(String(row.payload)) as DurableEvent;}catch{return{eventId:String(row.eventId),streamId:String(row.streamId),sequence:Number(row.sequence),type:String(row.type) as Event['type'],runId:row.runId?String(row.runId):undefined,text:row.text?String(row.text):undefined,occurredAt:String(row.occurredAt)};}});
  const last=events.at(-1)?.sequence??after;
  return{events,streamId,afterSequence:after,latestSequence:latest,earliestSequence:earliest,gap,hasMore:last<latest};
 }

 eventCursor(streamId:string){const row=this.db.prepare('SELECT COALESCE(MAX(sequence),0) AS latest FROM events WHERE stream_id=?').get(streamId) as {latest:number};return Number(row.latest)||0;}
 onClose(handler:()=>void){this.closeHandlers.add(handler);return()=>this.closeHandlers.delete(handler);}
 close(){for(const handler of this.closeHandlers)handler();this.closeHandlers.clear();this.db.close();}
}
