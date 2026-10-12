import type {DatabaseSync} from 'node:sqlite';
import path from 'node:path';
import {randomUUID} from 'node:crypto';

export const STORE_SCHEMA_VERSION=3;
export function migrateStore(db:DatabaseSync,dir:string){
 const version=Number(db.prepare('PRAGMA user_version').get()!.user_version);
 if(version>STORE_SCHEMA_VERSION)throw Error(`STORE_VERSION_UNSUPPORTED: 数据库版本 ${version} 高于当前支持版本 ${STORE_SCHEMA_VERSION}`);
 if(version===STORE_SCHEMA_VERSION){
  // Version metadata is not proof that a partially copied database has the
  // required schema. Refuse it without silently creating empty replacement data.
  for(const table of ['kv','operations','events','operation_recovery']){
   const found=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(table);
   if(!found)throw Error('STORE_SCHEMA_INVALID: 缺少数据库表 '+table);
  }
  db.prepare('SELECT operation_id,run_id,effect,dispatch,resolution,evidence_json,updated_at FROM operation_recovery LIMIT 0').all();
  db.prepare('SELECT id,run_id,tool,state,result,created_at FROM operations LIMIT 0').all();
  db.prepare('SELECT key,value FROM kv LIMIT 0').all();
  db.prepare('SELECT event_id,stream_id,sequence,type,run_id,text,occurred_at,payload FROM events LIMIT 0').all();
  return;
 }
 const existing=Number(db.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type='table' AND name IN ('kv','operations')").get()!.count)>0;
 // VACUUM INTO includes WAL content and produces a consistent standalone copy.
 // Backups are never replaced; a failed migration leaves the source untouched.
 if(existing){const target=path.join(dir,`slash-before-v3-${Date.now()}-${randomUUID().slice(0,8)}.sqlite`);db.exec(`VACUUM INTO '${target.replace(/'/g,"''")}'`);}
 db.exec('BEGIN IMMEDIATE');
 try{
  db.exec("CREATE TABLE IF NOT EXISTS kv(key TEXT PRIMARY KEY,value TEXT NOT NULL); CREATE TABLE IF NOT EXISTS operations(id TEXT PRIMARY KEY,run_id TEXT,tool TEXT,state TEXT,result TEXT,created_at TEXT); CREATE TABLE IF NOT EXISTS events(event_id TEXT PRIMARY KEY,stream_id TEXT NOT NULL,sequence INTEGER NOT NULL,type TEXT NOT NULL,run_id TEXT,text TEXT,occurred_at TEXT NOT NULL,payload TEXT NOT NULL); CREATE UNIQUE INDEX IF NOT EXISTS events_stream_sequence ON events(stream_id,sequence); CREATE INDEX IF NOT EXISTS events_stream_occurred ON events(stream_id,occurred_at); CREATE TABLE IF NOT EXISTS operation_recovery(operation_id TEXT PRIMARY KEY,run_id TEXT NOT NULL,effect TEXT NOT NULL,dispatch TEXT NOT NULL CHECK(dispatch IN ('not_sent','may_have_run','settled')),resolution TEXT NOT NULL CHECK(resolution IN ('pending','verified_done','verified_not_done')),evidence_json TEXT NOT NULL,updated_at TEXT NOT NULL); CREATE INDEX IF NOT EXISTS recovery_run ON operation_recovery(run_id); PRAGMA user_version=3;");
  if(Number(db.prepare('PRAGMA user_version').get()!.user_version)!==STORE_SCHEMA_VERSION)throw Error('STORE_MIGRATION_VERIFICATION_FAILED');
  db.exec('COMMIT');
 }catch(error){db.exec('ROLLBACK');throw error;}
}
