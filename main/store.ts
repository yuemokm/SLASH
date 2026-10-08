import {DatabaseSync} from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import type {Event} from '../shared/types.js';

export type DurableEvent=Event&{eventId:string;streamId:string;sequence:number;occurredAt:string};
export type EventReplay={events:DurableEvent[];streamId:string;afterSequence:number;latestSequence:number;earliestSequence:number;gap:boolean;hasMore:boolean};

export class Store {
 db:DatabaseSync;
 private closeHandlers=new Set<()=>void>();
 constructor(public dir:string){
  fs.mkdirSync(dir,{recursive:true});
  this.db=new DatabaseSync(path.join(dir,'slash.sqlite'));
  // CREATE IF NOT EXISTS keeps existing v1 databases readable while adding
  // the event stream without requiring a destructive migration.
  this.db.exec('PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY,value TEXT NOT NULL); CREATE TABLE IF NOT EXISTS operations(id TEXT PRIMARY KEY, run_id TEXT, tool TEXT, state TEXT, result TEXT, created_at TEXT); CREATE TABLE IF NOT EXISTS events(event_id TEXT PRIMARY KEY, stream_id TEXT NOT NULL, sequence INTEGER NOT NULL, type TEXT NOT NULL, run_id TEXT, text TEXT, occurred_at TEXT NOT NULL, payload TEXT NOT NULL); CREATE UNIQUE INDEX IF NOT EXISTS events_stream_sequence ON events(stream_id,sequence); CREATE INDEX IF NOT EXISTS events_stream_occurred ON events(stream_id,occurred_at); PRAGMA user_version=2;');
 }
 get<T>(key:string,fallback:T):T{const r=this.db.prepare('SELECT value FROM kv WHERE key=?').get(key);return r?JSON.parse(String(r.value)):fallback;}
 set(key:string,value:unknown){this.db.prepare('INSERT INTO kv VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key,JSON.stringify(value));}
 operation(id:string,runId:string,tool:string,state:string,result=''){this.db.prepare('INSERT INTO operations VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET state=excluded.state,result=excluded.result').run(id,runId,tool,state,result,new Date().toISOString());}
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
