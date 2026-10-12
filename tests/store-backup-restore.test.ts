import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {DatabaseSync} from 'node:sqlite';
import {Store} from '../main/store.js';
import {Service} from '../main/service.js';
import {assertReconciled} from '../main/run-recovery.js';

// This acceptance harness never receives a real profile path. The previous
// runtime is the immutable repository source, not the new Store emulating it.
const legacyCommit='1e5303ba7dddab7d2ff9985833f7ff3062593c24';
const digest=(bytes:Uint8Array|string)=>createHash('sha256').update(bytes).digest('hex');
function inside(root:string,target:string){
 const absolute=path.resolve(target),relative=path.relative(path.resolve(root),absolute);
 assert.ok(relative&&!relative.startsWith('..')&&!path.isAbsolute(relative)&&!absolute.startsWith('\\\\'),'isolated target must remain strictly inside fixture');
 return absolute;
}
async function fixture(t:test.TestContext){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'slash-backup-restore-'));
 t.after(async()=>{assert.ok(path.basename(root).startsWith('slash-backup-restore-'));inside(os.tmpdir(),root);await fs.rm(root,{recursive:true,force:true,maxRetries:6,retryDelay:40});});
 return root;
}
type Manifest=Record<string,string>;
async function manifest(root:string):Promise<Manifest>{
 const result:Manifest={};
 async function walk(dir:string){for(const entry of (await fs.readdir(dir,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){
  const target=inside(root,path.join(dir,entry.name));assert.equal(entry.isSymbolicLink(),false,'fixture does not follow external links');
  if(entry.isDirectory())await walk(target);else if(!/\.sqlite(?:-wal|-shm)?$/.test(entry.name))result[path.relative(root,target).split(path.sep).join('/')]=digest(await fs.readFile(target));
 }}
 await walk(root);return result;
}
async function write(root:string,relative:string,content:string|Uint8Array){const file=inside(root,path.join(root,relative));await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,content);}
async function copyTree(root:string,source:string,target:string,afterFile?:()=>void){inside(root,source);inside(root,target);assert.notEqual(source,target);await fs.mkdir(target,{recursive:true});
 for(const entry of await fs.readdir(source,{withFileTypes:true})){const from=inside(root,path.join(source,entry.name)),to=inside(root,path.join(target,entry.name));assert.equal(entry.isSymbolicLink(),false);if(entry.isDirectory())await copyTree(root,from,to,afterFile);else if(!/\.sqlite(?:-wal|-shm)?$/.test(entry.name)){await fs.copyFile(from,to);afterFile?.();}}
}
function rows(db:DatabaseSync){const result:Record<string,unknown[]>={};const tables=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all();
 for(const table of tables){const name=String(table.name);assert.match(name,/^[a-z_]+$/);result[name]=db.prepare(`SELECT * FROM ${name}`).all().map(row=>({...row})).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));}
 return result;
}
function inspect(file:string){const db=new DatabaseSync(file,{readOnly:true});try{assert.equal(db.prepare('PRAGMA quick_check').get()!.quick_check,'ok');return{version:Number(db.prepare('PRAGMA user_version').get()!.user_version),rows:rows(db)};}finally{db.close();}}
async function restoreDatabase(root:string,source:string,target:string,expectedHash:string,expectedVersion:number){
 inside(root,source);inside(root,target);assert.notEqual(source,target);assert.equal(digest(await fs.readFile(source)),expectedHash,'backup hash must match before opening a runtime');
 const evidence=inspect(source);assert.equal(evidence.version,expectedVersion);for(const table of ['kv','operations',...(expectedVersion>=2?['events']:[])])assert.ok(evidence.rows[table],'required backup table '+table);
 if(expectedVersion===3)assert.ok(evidence.rows.operation_recovery,'required v3 recovery table');
 await fs.mkdir(path.dirname(target),{recursive:true});await fs.copyFile(source,target);assert.equal(digest(await fs.readFile(target)),expectedHash);return evidence;
}
async function legacyClass(root:string){
 const source=execFileSync('git',['show',`${legacyCommit}:main/store.ts`],{cwd:process.cwd(),encoding:'utf8',windowsHide:true});
 assert.ok(source.includes('PRAGMA user_version=2'));assert.ok(!source.includes('migrateStore'));
 const file=inside(root,path.join(root,'legacy-runtime.ts'));await fs.writeFile(file,source);
 const module=await import(pathToFileURL(file).href);return{LegacyStore:module.Store as typeof Store,sourceHash:digest(source)};
}
const stamp='2026-10-11T00:00:00.000Z';
function state(workspace:string){return{root:workspace,mounts:[{id:'resource',name:'资源',path:path.join(workspace,'resources'),enabled:true,write:false},{id:'output',name:'成果',path:path.join(workspace,'outputs'),enabled:true,write:true}],conversations:[{id:'conversation',title:'隔离恢复任务',messages:[{role:'user',text:'保留原有数据',time:stamp}]}],changes:[],runs:[{id:'old-run',conversationId:'conversation',status:'succeeded',startedAt:stamp,finishedAt:stamp}],connections:[],model:{baseUrl:'https://fixture.invalid/v1',id:'fixture',hasKey:false}};}
function mapRuntimeState(store:Store,workspace:string){const saved=store.get<any>('state',null);saved.root=workspace;for(const mount of saved.mounts)mount.path=path.join(workspace,mount.id==='resource'?'resources':'outputs');store.set('state',saved);}

for(const version of [0,1,2])test(`G4 v${version}: actual backup restore, exact old/new data and files, isolated legacy rollback`,async t=>{
 const root=await fixture(t),profile=inside(root,path.join(root,'upgraded-profile')),workspace=inside(root,path.join(root,'upgraded-workspace'));
 const {LegacyStore,sourceHash}=await legacyClass(root);await fs.mkdir(workspace,{recursive:true});
 // Only the v2 source exists in Git. v0/v1 are generated historical base-schema
 // fixtures (no event table), not claimed as recovered real user databases.
 const old=new LegacyStore(profile);old.set('state',state(workspace));old.set('legacy-user',{title:'原有中文资料',nested:{versions:[1,2],enabled:true}});old.set('draft:old',{content:'原有待保存草稿',revision:2});old.operation('old-operation','old-run','read_file','succeeded','原始回执，不允许改写');if(version===2)old.appendEvent({type:'run',runId:'old-run',text:'原有事件'} as never);else old.db.exec('DROP TABLE events');old.db.exec(`PRAGMA user_version=${version}`);old.close();
 await write(workspace,'resources/source.md','原始资料：不丢失来源');await write(workspace,'outputs/result.md','旧成果正文');await write(profile,'versions/old/result.md','旧版本正文');await write(profile,'agent/conversation.jsonl','{"role":"user","text":"原会话"}\n');await write(profile,'memory/MEMORY.md','旧本地记忆');await write(profile,'attachments/sample.bin',Buffer.from([0,255,1,128]));
 const oldData=inspect(path.join(profile,'slash.sqlite')),oldFiles=await manifest(profile),oldWorkspace=await manifest(workspace);
 const legacyFilesArchive=inside(root,path.join(root,'evidence','legacy-profile-files')),legacyWorkspaceArchive=inside(root,path.join(root,'evidence','legacy-workspace'));await copyTree(root,profile,legacyFilesArchive);await copyTree(root,workspace,legacyWorkspaceArchive);assert.deepEqual(await manifest(legacyFilesArchive),oldFiles);assert.deepEqual(await manifest(legacyWorkspaceArchive),oldWorkspace);
 const current=new Store(profile);assert.deepEqual(rows(current.db).kv,oldData.rows.kv);assert.deepEqual(rows(current.db).operations,oldData.rows.operations);assert.deepEqual(rows(current.db).events,oldData.rows.events??[]);
 const backupName=(await fs.readdir(profile)).find(name=>name.startsWith('slash-before-v3-'))!;assert.ok(backupName);const backup=path.join(profile,backupName);assert.deepEqual(inspect(backup),oldData);assert.deepEqual(await manifest(profile),oldFiles);assert.deepEqual(await manifest(workspace),oldWorkspace);
 current.set('new-user',{addedAfterMigration:true,text:'新版新增记录'});current.set('draft:new',{content:'新版新增草稿',revision:3});current.operation('new-success','new-run','write_draft','executing');current.saveRecovery({operationId:'new-success',runId:'new-run',tool:'write_draft',effect:'draft',dispatch:'may_have_run',resolution:'pending',evidenceRefs:[],updatedAt:stamp});current.finishOperation('new-success','new-run','write_draft','succeeded','新增真实终态');
 current.operation('new-unknown','new-run','powershell','outcome_unknown','写入后未取得回执');current.saveRecovery({operationId:'new-unknown',runId:'new-run',tool:'powershell',effect:'process',dispatch:'may_have_run',resolution:'pending',evidenceRefs:['isolated:effect.txt'],updatedAt:stamp});
 current.operation('reviewed','new-run','process_processing_copy','outcome_unknown','原始未知回执保留');current.saveRecovery({operationId:'reviewed',runId:'new-run',tool:'process_processing_copy',effect:'process',dispatch:'settled',resolution:'verified_done',processingCopy:{id:'fixture-copy',contentHash:digest('before')},observedProcessingCopy:{id:'fixture-copy',contentHash:digest('after')},resolvedBy:'user',evidenceRefs:['已核对前后副本，完成一次'],updatedAt:stamp});
 const saved=current.get<any>('state',null);saved.runs.push({id:'new-run',conversationId:'conversation',status:'interrupted',phase:'interrupted',resumable:true,mode:'build',permissionMode:'standard',input:'继续保留新增成果',startedAt:stamp,finishedAt:stamp});current.set('state',saved);current.set('checkpoint:new-run',{safeToResume:false,phase:'interrupted',assistantText:'新增未完成回复',completedOperations:[{id:'new-success',tool:'write_draft',state:'succeeded'}]});current.appendEvent({type:'run',runId:'new-run',text:'新增事件：精确顺序保留'} as never);
 await write(workspace,'outputs/result.md','新版成果正文');await write(workspace,'outputs/new.md','新增独有成果');await write(workspace,'outputs/effect.txt','unknown effect once\n');await write(profile,'versions/new/result.md','新版版本正文');await write(profile,'drafts/new.md','新增草稿文件');await write(profile,'agent/new-session.jsonl','{"role":"assistant","text":"新会话"}\n');
 // Prove committed WAL content is included, instead of copying only sqlite.
 current.db.exec('PRAGMA wal_autocheckpoint=0');current.set('committed-wal',{retained:'仅迁移后已提交的新行'});assert.ok((await fs.stat(path.join(profile,'slash.sqlite-wal'))).size>0);
 const mainOnly=inside(root,path.join(root,'unsafe-main-file-only.sqlite'));await fs.copyFile(path.join(profile,'slash.sqlite'),mainOnly);const mainOnlyDb=new DatabaseSync(mainOnly,{readOnly:true});try{assert.equal(mainOnlyDb.prepare("SELECT value FROM kv WHERE key='committed-wal'").get(),undefined,'single main-file copy demonstrably omits committed WAL data');}finally{mainOnlyDb.close();}
 const newData={version:3,rows:rows(current.db)},newFiles=await manifest(profile),newWorkspace=await manifest(workspace),archive=inside(root,path.join(root,'evidence','current-v3'));await fs.mkdir(archive,{recursive:true});
 const archiveDb=inside(root,path.join(archive,'slash.sqlite'));current.db.exec(`VACUUM INTO '${archiveDb.replace(/'/g,"''")}'`);current.close();await copyTree(root,profile,archive);const archiveWorkspace=inside(root,path.join(root,'evidence','current-workspace'));await copyTree(root,workspace,archiveWorkspace);
 assert.deepEqual(inspect(archiveDb),newData);assert.deepEqual(await manifest(archive),newFiles);assert.deepEqual(await manifest(archiveWorkspace),newWorkspace);const archiveHash=digest(await fs.readFile(archiveDb));
 const rollbackProfile=inside(root,path.join(root,'rollback-profile')),rollbackWorkspace=inside(root,path.join(root,'rollback-workspace'));await restoreDatabase(root,backup,path.join(rollbackProfile,'slash.sqlite'),digest(await fs.readFile(backup)),version);
 // Restore the actual pre-migration file backups, including binary bytes;
 // never rebuild old files from literals or copy the changed new workspace.
 await copyTree(root,legacyFilesArchive,rollbackProfile);await copyTree(root,legacyWorkspaceArchive,rollbackWorkspace);
 assert.deepEqual(await manifest(rollbackProfile),oldFiles);assert.deepEqual(await manifest(rollbackWorkspace),oldWorkspace);
 const rollback=new LegacyStore(rollbackProfile);assert.deepEqual(rows(rollback.db).kv,oldData.rows.kv);assert.deepEqual(rows(rollback.db).operations,oldData.rows.operations);assert.deepEqual(rows(rollback.db).events,oldData.rows.events??[]);mapRuntimeState(rollback,rollbackWorkspace);assert.equal(rollback.get<any>('state',null).root,rollbackWorkspace);assert.equal(rollback.get('new-user',null),null);rollback.set('rollback-only',{text:'旧版期间新增，另行保留'});rollback.close();await write(rollbackWorkspace,'outputs/result.md','回退期间同路径修改');await write(rollbackWorkspace,'outputs/rollback-only.md','旧版期间独有成果');
 const rollbackData=inspect(path.join(rollbackProfile,'slash.sqlite'));assert.ok(rollbackData.rows.kv.some(row=>(row as any).key==='rollback-only'));assert.deepEqual(inspect(path.join(profile,'slash.sqlite')),newData);assert.deepEqual(inspect(archiveDb),newData);assert.equal(digest(await fs.readFile(archiveDb)),archiveHash);assert.deepEqual(await manifest(workspace),newWorkspace);
 const returned=inside(root,path.join(root,'return-new-profile')),returnWorkspace=inside(root,path.join(root,'return-new-workspace'));await restoreDatabase(root,archiveDb,path.join(returned,'slash.sqlite'),archiveHash,3);await copyTree(root,archive,returned);await copyTree(root,archiveWorkspace,returnWorkspace);
 assert.deepEqual(inspect(path.join(returned,'slash.sqlite')),newData);assert.deepEqual(await manifest(returned),newFiles);assert.deepEqual(await manifest(returnWorkspace),newWorkspace);
 const restored=new Store(returned);try{mapRuntimeState(restored,returnWorkspace);let modelCalls=0;const service=new Service(restored,()=> 'fixture-no-network',()=>{},async()=>{modelCalls++;throw Error('forbidden runtime replay');},{fetchModelMetadata:async()=>{throw Error('OFFLINE_RESTORE_FIXTURE');}});
  assert.deepEqual(restored.get('legacy-user',null),{title:'原有中文资料',nested:{versions:[1,2],enabled:true}});assert.deepEqual(restored.get('new-user',null),{addedAfterMigration:true,text:'新版新增记录'});assert.deepEqual(restored.get('committed-wal',null),{retained:'仅迁移后已提交的新行'});assert.deepEqual(restored.get('draft:new',null),{content:'新版新增草稿',revision:3});assert.equal(restored.replayEvents('run:new-run').events[0].text,'新增事件：精确顺序保留');assert.equal(restored.recoveryForOperation('reviewed')!.observedProcessingCopy!.contentHash,digest('after'));assert.equal(restored.recoveryForOperation('reviewed')!.processingCopy!.contentHash,digest('before'));assert.equal(restored.operationsForRun('new-run').find(item=>item.id==='new-success')!.state,'succeeded');
  assert.throws(()=>assertReconciled(restored,'new-run'),/RUN_REQUIRES_RECONCILIATION/);await assert.rejects(service.resumeRun('new-run'),/RUN_REQUIRES_RECONCILIATION/);assert.equal(modelCalls,0);assert.equal(restored.recoveryForOperation('new-unknown')!.resolution,'pending');assert.equal(await fs.readFile(path.join(returnWorkspace,'outputs/effect.txt'),'utf8'),'unknown effect once\n');service.dispose();
 }finally{restored.close();}
 const rollbackFiles=await manifest(rollbackWorkspace),differences=Object.keys(rollbackFiles).filter(key=>rollbackFiles[key]!==newWorkspace[key]);assert.deepEqual(differences.sort(),['outputs/result.md','outputs/rollback-only.md']);assert.equal(await fs.readFile(path.join(returnWorkspace,'outputs/result.md'),'utf8'),'新版成果正文');assert.equal(await fs.readFile(path.join(rollbackWorkspace,'outputs/result.md'),'utf8'),'回退期间同路径修改');assert.deepEqual(inspect(path.join(rollbackProfile,'slash.sqlite')),rollbackData);assert.deepEqual(inspect(archiveDb),newData);assert.deepEqual(await manifest(archive),newFiles);assert.deepEqual(await manifest(legacyFilesArchive),oldFiles);assert.deepEqual(await manifest(legacyWorkspaceArchive),oldWorkspace);
 t.diagnostic(JSON.stringify({legacyCommit,sourceHash,oldVersion:version,restoredVersion:3,oldKv:oldData.rows.kv.length,newKv:newData.rows.kv.length,profileFiles:Object.keys(newFiles),workspaceFiles:Object.keys(newWorkspace),rollbackDifferences:differences,unknownReplayCalls:0,archiveHash}));
});

test('G4 restore refuses altered backup, corrupt/incomplete schema and escaping target before runtime opens',async t=>{
 const root=await fixture(t),profile=inside(root,path.join(root,'valid-profile')),store=new Store(profile);store.set('retained',{text:'must survive'});store.close();const source=path.join(profile,'slash.sqlite'),original=await fs.readFile(source),expected=digest(original),baseline=inspect(source);
 await assert.rejects(restoreDatabase(root,source,path.join(root,'outside','slash.sqlite'),'0'.repeat(64),3),/backup hash/);
 await assert.rejects(restoreDatabase(root,source,path.join(root,'..','escape.sqlite'),expected,3),/isolated target/);
 const corrupt=inside(root,path.join(root,'corrupt.sqlite'));await fs.writeFile(corrupt,'not sqlite');await assert.rejects(restoreDatabase(root,corrupt,path.join(root,'corrupt-profile','slash.sqlite'),digest('not sqlite'),3),/not a database/);
 const incomplete=inside(root,path.join(root,'incomplete.sqlite')),db=new DatabaseSync(incomplete);db.exec("CREATE TABLE kv(key TEXT PRIMARY KEY,value TEXT NOT NULL); INSERT INTO kv VALUES('preserved','\"yes\"'); PRAGMA user_version=3");db.close();await assert.rejects(restoreDatabase(root,incomplete,path.join(root,'incomplete-profile','slash.sqlite'),digest(await fs.readFile(incomplete)),3),/required backup table/);
 assert.deepEqual(inspect(source),baseline);assert.equal(digest(await fs.readFile(source)),expected);for(const dir of ['outside','corrupt-profile','incomplete-profile'])await assert.rejects(fs.access(path.join(root,dir)));
});

test('G4 interrupted file copy preserves archive and is never promoted as a complete restored profile',async t=>{
 const root=await fixture(t),archive=inside(root,path.join(root,'archive'));await fs.mkdir(archive);await write(archive,'drafts/one.md','first preserved draft');await write(archive,'versions/two.bin',Buffer.from([0,255,42]));const expected=await manifest(archive),partial=inside(root,path.join(root,'partial-profile'));let copied=0;await assert.rejects(copyTree(root,archive,partial,()=>{copied++;throw Error('ISOLATED_COPY_INTERRUPTED');}),/ISOLATED_COPY_INTERRUPTED/);assert.equal(copied,1);assert.notDeepEqual(await manifest(partial),expected);assert.deepEqual(await manifest(archive),expected);assert.equal(await fs.readFile(path.join(archive,'drafts/one.md'),'utf8'),'first preserved draft');await assert.rejects(fs.access(path.join(partial,'slash.sqlite')));
});

test('G4 restored future schema and incomplete v3 fail reopening while preserving original records',async t=>{
 const root=await fixture(t);
 for(const version of [3,4]){const profile=inside(root,path.join(root,'refused-profile-'+version));await fs.mkdir(profile);const file=path.join(profile,'slash.sqlite'),db=new DatabaseSync(file);db.exec(`CREATE TABLE kv(key TEXT PRIMARY KEY,value TEXT NOT NULL); INSERT INTO kv VALUES('preserved','"retained original"'); PRAGMA user_version=${version}`);db.close();const before=inspect(file);assert.throws(()=>new Store(profile),/STORE_SCHEMA_INVALID|STORE_VERSION_UNSUPPORTED/);assert.deepEqual(inspect(file),before);}
});
