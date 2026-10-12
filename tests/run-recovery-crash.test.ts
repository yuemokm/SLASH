import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {DatabaseSync} from 'node:sqlite';
import {Store} from '../main/store.js';
import {Service} from '../main/service.js';
import {classifyInterruptedOperations,assertReconciled} from '../main/run-recovery.js';
import type {RuntimeOptions} from '../main/agent.js';
import {hash} from '../main/files.js';

const cleanup=new Map<string,()=>void>();
async function fixture(t:test.TestContext){const dir=await fs.mkdtemp(path.join(os.tmpdir(),'slash-crash-window-'));t.after(async()=>{cleanup.get(dir)?.();await fs.rm(dir,{recursive:true,force:true,maxRetries:6,retryDelay:40});});return dir;}
async function crash(dir:string,tool:string,window:string){
 return new Promise<number>((resolve,reject)=>{
  const child=spawn(process.execPath,['--import','tsx','tests/run-recovery-crash-fixture.ts',dir,tool,window],{cwd:process.cwd(),windowsHide:true,stdio:['ignore','pipe','pipe']});let output='';
  const timeout=setTimeout(()=>{child.kill();reject(Error('crash fixture timeout '+output));},30000);
  child.stdout.on('data',chunk=>output+=chunk);child.stderr.on('data',chunk=>output+=chunk);child.on('error',reject);
  child.on('close',code=>{clearTimeout(timeout);if(![31,32,33].includes(code??0))reject(Error(`crash fixture ${code}: ${output}`));else resolve(code!);});
 });
}

for(const tool of ['powershell','run_process','process_processing_copy'])for(const window of ['before_dispatch','after_effect_before_receipt','after_receipt'])test(`${tool} / ${window}: real child exit, reopen actual Store, no replay`,async t=>{
 const dir=await fixture(t);const code=await crash(dir,tool,window);assert.equal(code,{before_dispatch:31,after_effect_before_receipt:32,after_receipt:33}[window]);
 const store=new Store(path.join(dir,'profile'));const service=new Service(store,()=> 'fixture-only',()=>{});cleanup.set(dir,()=>store.close());
 const run=service.state.runs.find(item=>store.operationsForRun(item.id).some(operation=>operation.tool===tool))!,operation=store.operationsForRun(run.id).find(item=>item.tool===tool)!;
 const count=await fs.readFile(path.join(dir,'counter.txt'),'utf8').catch(()=> '');assert.equal(count,window==='before_dispatch'?'':'effect\n');
 assert.equal(run.status,'interrupted');
 if(window==='after_effect_before_receipt'){
  assert.equal(operation.state,'outcome_unknown');let sends=0;service.send=async()=>{sends++;return 'forbidden';};
  await assert.rejects(service.resumeRun(run.id),/RUN_REQUIRES_RECONCILIATION/);assert.equal(sends,0);
  const view=await service.listRunRecovery(run.id),record=view.records.find(item=>item.operationId===operation.id)!;
  await service.reconcileRunOperation({runId:run.id,operationId:operation.id,expectedUpdatedAt:record.updatedAt,contextToken:view.contextToken,resolution:'verified_done',evidence:'隔离计数器已核对：恰好执行一次'});
  assert.equal((await service.listRunRecovery(run.id)).blocked,false);assert.equal(store.operationsForRun(run.id).find(item=>item.id===operation.id)!.state,'outcome_unknown','original unknown receipt is retained');
  assert.doesNotThrow(()=>assertReconciled(store,run.id));
 }else{assert.equal(operation.state,window==='after_receipt'?'succeeded':'cancelled');assert.doesNotThrow(()=>assertReconciled(store,run.id));}
 assert.equal(await fs.readFile(path.join(dir,'counter.txt'),'utf8').catch(()=> ''),count);
});

test('legacy effects fail closed; read-only and never-dispatched approval do not lock; terminal fact cannot regress',async t=>{
 const dir=await fixture(t),store=new Store(dir);cleanup.set(dir,()=>store.close());
 for(const tool of ['powershell','run_process','process_processing_copy','unknown_legacy_tool'])store.operation(tool,'legacy',tool,'executing','old evidence');
 store.operation('read','legacy','read_file','executing');store.operation('approval','legacy','powershell','executing');
 store.saveRecovery({operationId:'approval',runId:'legacy',tool:'powershell',effect:'process',dispatch:'not_sent',resolution:'pending',evidenceRefs:[],updatedAt:'before'});
 store.operation('done','legacy','powershell','succeeded','actual receipt');classifyInterruptedOperations(store,'legacy');
 for(const tool of ['powershell','run_process','process_processing_copy','unknown_legacy_tool'])assert.equal(store.operationsForRun('legacy').find(item=>item.id===tool)!.state,'outcome_unknown');
 for(const id of ['read','approval'])assert.equal(store.operationsForRun('legacy').find(item=>item.id===id)!.state,'cancelled');
 store.operation('done','legacy','powershell','executing');store.finishOperation('done','legacy','powershell','cancelled','later cancel');
 assert.equal(store.operationsForRun('legacy').find(item=>item.id==='done')!.state,'succeeded');assert.equal(store.operationsForRun('legacy').find(item=>item.id==='done')!.result,'actual receipt');
});

for(const version of [0,1,2])test(`old SQLite v${version}: backups retain kv/operations and migration reopens without erasure`,async t=>{
 const dir=await fixture(t),file=path.join(dir,'slash.sqlite'),old=new DatabaseSync(file);
 old.exec(`CREATE TABLE kv(key TEXT PRIMARY KEY,value TEXT NOT NULL); CREATE TABLE operations(id TEXT PRIMARY KEY,run_id TEXT,tool TEXT,state TEXT,result TEXT,created_at TEXT); INSERT INTO kv VALUES('user','{"original":true}'); INSERT INTO operations VALUES('old','run','powershell','executing','retained evidence','old time'); PRAGMA user_version=${version};`);old.close();
 const store=new Store(dir);assert.deepEqual(store.get('user',null),{original:true});assert.equal(store.operationsForRun('run')[0].result,'retained evidence');assert.equal(Number(store.db.prepare('PRAGMA user_version').get()!.user_version),3);store.close();
 const backup=(await fs.readdir(dir)).find(file=>file.startsWith('slash-before-v3-'))!;assert.ok(backup);const restored=new DatabaseSync(path.join(dir,backup));assert.equal(Number(restored.prepare('PRAGMA user_version').get()!.user_version),version);assert.equal(restored.prepare('SELECT result FROM operations').get()!.result,'retained evidence');restored.close();
 const reopened=new Store(dir);assert.equal(reopened.operationsForRun('run').length,1);reopened.close();assert.equal((await fs.readdir(dir)).filter(file=>file.startsWith('slash-before-v3-')).length,1);
});

test('future schema and incomplete v3 are refused without resetting version or writing empty tables',async t=>{
 for(const version of [3,4]){
  const dir=await fixture(t),db=new DatabaseSync(path.join(dir,'slash.sqlite'));db.exec(`CREATE TABLE kv(key TEXT PRIMARY KEY,value TEXT NOT NULL); INSERT INTO kv VALUES('user','"retained"'); PRAGMA user_version=${version};`);db.close();
  assert.throws(()=>new Store(dir),/STORE_VERSION_UNSUPPORTED|STORE_SCHEMA_INVALID/);const actual=new DatabaseSync(path.join(dir,'slash.sqlite'));assert.equal(Number(actual.prepare('PRAGMA user_version').get()!.user_version),version);assert.equal(actual.prepare('SELECT value FROM kv').get()!.value,'"retained"');actual.close();
 }
});

async function serviceFixture(t:test.TestContext,prompt:(options:RuntimeOptions,service:Service,dir:string)=>Promise<void>){
 const dir=await fixture(t),store=new Store(path.join(dir,'profile'));
 const service=new Service(store,()=> 'fixture-only',()=>{},async options=>({messages:[{role:'assistant',stopReason:'stop'}],abort:async()=>{},dispose:()=>{},prompt:async()=>prompt(options,service,dir)} as never),{fetchModelMetadata:async()=>{throw Error('OFFLINE_RECOVERY_FIXTURE');}});
 cleanup.set(dir,()=>store.close());await service.workspace(path.join(dir,'project'));
 service.setPermission('workspace_read','allow');service.setPermission('artifact_write','allow');service.setPermission('process_execute','allow');
 return{service,store,dir,done:async(id:string)=>{for(let i=0;i<1000;i++){const run=service.state.runs.find(item=>item.id===id)!;if(run.finishedAt&&!service.active.has(id)&&!service.starting.has(id))return run;await new Promise(resolve=>setTimeout(resolve,10));}throw Error('isolated run did not stop');}};
}

for(const failure of ['ordinary','cancelled'])test(`actual host effect followed by ${failure} error remains unknown and blocks next tool`,async t=>{
 let followups=0;
 const f=await serviceFixture(t,async(o,s,dir)=>{
  await assert.rejects(o.log('powershell',{command:'isolated append then throw',cwd:s.state.root},()=>o.executePowerShell!({command:'isolated append',cwd:s.state.root},async()=>{await fs.appendFile(path.join(dir,'effect.txt'),'one\n');throw Error(failure==='ordinary'?'ordinary error after write':'CANCELLED: after write');})),/PROCESS_OUTCOME_UNKNOWN/);
  await assert.rejects(o.log('read_file',{},async()=>{followups++;}),/PROCESS_OUTCOME_UNKNOWN/);
 });
 const id=await f.service.send(f.service.conversation(),'side effect failure test'),run=await f.done(id);
 assert.equal(run.status,'failed');assert.match(run.error??'',/PROCESS_OUTCOME_UNKNOWN/);assert.equal(followups,0);
 assert.equal(await fs.readFile(path.join(f.dir,'effect.txt'),'utf8'),'one\n');assert.throws(()=>assertReconciled(f.store,id),/RUN_REQUIRES_RECONCILIATION/);
 classifyInterruptedOperations(f.store,id);assert.equal((await f.service.listRunRecovery(id)).blocked,true);
});

test('known edit validation/match failure has no dispatched effect, corrected edit succeeds in same Run',async t=>{
 let errorOp='';
 const f=await serviceFixture(t,async(o,s)=>{
  const mount=s.state.mounts.find(item=>item.name==='成果')!,target={mountId:mount.id,path:'draft.md'};
  const read=await o.readDraft!(target);
  const invalid={...target,expectedContentHash:read.contentHash,oldText:'absent literal',newText:'new literal'};
  await assert.rejects(o.log('edit_draft',invalid,()=>o.editDraft!(invalid)),/DRAFT_MATCH_NOT_FOUND/);
  errorOp=s.store.operationsForRun(o.runId).find(item=>item.tool==='edit_draft')!.id;
  assert.equal(s.store.recoveryForOperation(errorOp)!.resolution,'verified_not_done');
  const valid={...invalid,oldText:'original literal'};await o.log('edit_draft',valid,()=>o.editDraft!(valid));
 });
 const mount=f.service.state.mounts.find(item=>item.name==='成果')!;await fs.writeFile(path.join(mount.path,'draft.md'),'original literal');
 const id=await f.service.send(f.service.conversation(),'recoverable input fixture');await f.done(id);
 assert.equal(f.store.operationsForRun(id).find(item=>item.id===errorOp)!.state,'failed');assert.equal(f.service.state.changes[0].content,'new literal');assert.doesNotThrow(()=>assertReconciled(f.store,id));
});

test('record schema rejection stays correctable until repository persistence, valid follow-up records once',async t=>{
 const f=await serviceFixture(t,async(o,s)=>{
  const input={title:'',summary:'isolated requirement',status:'draft' as const,sources:[],assumptions:[],pendingQuestions:[],confirmedFacts:[]};
  await assert.rejects(o.log('record_requirement',input,()=>s.recordRequirement(s.state.runs.find(run=>run.id===o.runId)!.conversationId,input)));
  const rejected=s.store.operationsForRun(o.runId).find(operation=>operation.tool==='record_requirement')!;assert.equal(rejected.state,'failed');assert.equal(s.store.recoveryForOperation(rejected.id)!.resolution,'verified_not_done');
  const valid={...input,title:'isolated requirement'};await o.log('record_requirement',valid,()=>s.recordRequirement(s.state.runs.find(run=>run.id===o.runId)!.conversationId,valid));
 });
 const id=await f.service.send(f.service.conversation(),'record rejection fixture');await f.done(id);assert.doesNotThrow(()=>assertReconciled(f.store,id));
 const records=await f.service.listProductRecords({type:'requirements'});assert.equal((records as any).items.length,1);
});

test('reconciliation binds exact operation, token, authorization and processing copy version; does not run a command',async t=>{
 const dir=await fixture(t);await crash(dir,'process_processing_copy','after_effect_before_receipt');
 const store=new Store(path.join(dir,'profile')),service=new Service(store,()=> 'fixture-only',()=>{});cleanup.set(dir,()=>store.close());
 const run=service.state.runs.find(item=>store.operationsForRun(item.id).some(operation=>operation.tool==='process_processing_copy'))!,view=await service.listRunRecovery(run.id),record=view.records.find(item=>item.tool==='process_processing_copy')!;
 const input={runId:run.id,operationId:record.operationId,expectedUpdatedAt:record.updatedAt,contextToken:view.contextToken,resolution:'verified_done' as const,evidence:'人工查看隔离计数器与处理副本，确认结果'};
 await assert.rejects(service.reconcileRunOperation({...input,operationId:'another'}),/UNAVAILABLE/);
 await assert.rejects(service.reconcileRunOperation({...input,contextToken:'a'.repeat(64)}),/STALE/);
 service.setPermission('artifact_write','deny');await assert.rejects(service.reconcileRunOperation(input),/PERMISSION_DENIED/);service.setPermission('artifact_write','allow');
 const snapshot=await service.readProcessingCopy(record.processingCopy!.id),mount=service.state.mounts.find(item=>item.id===snapshot.copy.copy.mountId)!;
 const source=snapshot.copy.source,sourceMount=service.state.mounts.find(item=>item.id===source.mountId)!,sourcePath=path.join(sourceMount.path,source.path),original=await fs.readFile(sourcePath,'utf8'),manifest=store.get<any>('context-manifest:'+run.id,{});
 store.set('context-manifest:'+run.id,{...manifest,sourceRefs:[{mountId:source.mountId,path:source.path,contentHash:hash(original),readAt:new Date().toISOString()}]});
 await fs.writeFile(sourcePath,'source changed');await assert.rejects(service.reconcileRunOperation({...input,contextToken:(await service.listRunRecovery(run.id)).contextToken}),/VERSION_CONFLICT/);await fs.writeFile(sourcePath,original);
 await fs.writeFile(path.join(mount.path,snapshot.copy.copy.path),'changed version');
 await assert.rejects(service.reconcileRunOperation(input),/STALE/);
 const refreshed=await service.listRunRecovery(run.id);await service.reconcileRunOperation({...input,contextToken:refreshed.contextToken,evidence:'已核对变化后副本；原始资料未变，确认本次操作已完成'});
 const settled=store.recoveryForOperation(record.operationId)!;assert.equal(settled.processingCopy!.contentHash,record.processingCopy!.contentHash);assert.equal(settled.observedProcessingCopy!.contentHash,hash('changed version'));
 assert.equal((await service.listRunRecovery(run.id)).blocked,false);assert.equal(await fs.readFile(path.join(dir,'counter.txt'),'utf8'),'effect\n');
});

test('copy modified by unknown host operation remains reviewable; later changes invalidate loaded observation',async t=>{
 const dir=await fixture(t);await crash(dir,'process_processing_copy','after_effect_modified_copy');
 const store=new Store(path.join(dir,'profile')),service=new Service(store,()=> 'fixture-only',()=>{});cleanup.set(dir,()=>store.close());
 const run=service.state.runs.find(item=>store.operationsForRun(item.id).some(operation=>operation.tool==='process_processing_copy'))!,view=await service.listRunRecovery(run.id),record=view.records.find(item=>item.tool==='process_processing_copy')!;
 assert.equal(record.observedProcessingCopy!.contentHash,hash('modified by isolated injected host'));assert.notEqual(record.processingCopy!.contentHash,record.observedProcessingCopy!.contentHash);
 const input={runId:run.id,operationId:record.operationId,expectedUpdatedAt:record.updatedAt,contextToken:view.contextToken,resolution:'verified_done' as const,evidence:'已查看本次宿主操作改变的副本，原始资料未变且结果已核对'};
 const copy=await service.readProcessingCopy(record.processingCopy!.id),mount=service.state.mounts.find(item=>item.id===copy.copy.copy.mountId)!;await fs.writeFile(path.join(mount.path,copy.copy.copy.path),'edited after review opened');
 await assert.rejects(service.reconcileRunOperation(input),/STALE/);assert.throws(()=>assertReconciled(store,run.id),/RECONCILIATION/);
 const current=await service.listRunRecovery(run.id);await service.reconcileRunOperation({...input,contextToken:current.contextToken,evidence:'已重新查看最后副本版本，确认原始资料未变且本次操作结果已核对'});
 assert.equal((await service.listRunRecovery(run.id)).blocked,false);assert.equal(store.recoveryForOperation(record.operationId)!.observedProcessingCopy!.contentHash,hash('edited after review opened'));assert.equal(await fs.readFile(path.join(dir,'counter.txt'),'utf8'),'effect\n');
 let calls=0,readText='';const resumed=new Service(store,()=> 'fixture-only',()=>{},async options=>({messages:[{role:'assistant',stopReason:'stop'}],abort:async()=>{},dispose:()=>{},prompt:async text=>{calls++;assert.match(text,/处理副本已核对版本=/);readText=await options.log('read_file',copy.copy.copy,()=>options.files.read(copy.copy.copy.mountId,copy.copy.copy.path));}} as never),{fetchModelMetadata:async()=>{throw Error('OFFLINE_RESUME_FIXTURE');}});
 const resumedId=await resumed.resumeRun(run.id);for(let i=0;i<1000&&(resumed.active.has(resumedId)||resumed.starting.has(resumedId)||!resumed.state.runs.find(item=>item.id===resumedId)?.finishedAt);i++)await new Promise(resolve=>setTimeout(resolve,10));
 assert.equal(calls,1);assert.equal(readText,'edited after review opened');assert.equal(resumed.state.runs.find(item=>item.id===resumedId)!.status,'succeeded');assert.equal(await fs.readFile(path.join(dir,'counter.txt'),'utf8'),'effect\n');
});
