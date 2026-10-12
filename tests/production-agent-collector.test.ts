import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {collectCompletedProductionTrial} from '../scripts/production-agent-collect.mjs';

const sha=(value:string)=>createHash('sha256').update(value).digest('hex');
async function setup(t:any){
 const repo=await fs.mkdtemp(path.join(os.tmpdir(),'slash-production-collector-'));t.after(()=>fs.rm(repo,{recursive:true,force:true,maxRetries:5,retryDelay:20}));const root=path.join(repo,'.test-data','round'),caseDir=path.join(root,'cases','QE05'),profile=path.join(caseDir,'profile'),mountPath=path.join(caseDir,'workspace'),snapshot=path.join(caseDir,'snapshots','1-note.md');await fs.mkdir(profile,{recursive:true});await fs.mkdir(mountPath);await fs.mkdir(path.dirname(snapshot));await fs.writeFile(snapshot,'Actual saved bytes');
 await fs.mkdir(path.join(repo,'dist','main'),{recursive:true});await fs.writeFile(path.join(repo,'dist','main','main.js'),'collector runtime fixture');const runtimeHashes={'main/main.js':sha('collector runtime fixture')};
 const model={id:'fixture-model',provider:'fixture',modelId:'fixture',protocol:'openai-completions',baseUrl:'https://fixture.invalid'},publicModel={id:model.id,provider:model.provider,modelId:model.modelId,protocol:model.protocol,baseUrlHash:sha(model.baseUrl),proxyUrlHash:sha(''),contextWindow:null,maxTokens:null};const start={caseId:'QE05',modelConfiguration:publicModel,runtimeHashes};await fs.writeFile(path.join(caseDir,'production-start.json'),JSON.stringify(start));const startHash=sha(JSON.stringify(start));await fs.writeFile(path.join(caseDir,'production-step-1.json'),JSON.stringify({run:{id:'actual-run',reasoning:{effectiveLevel:'off'}},startSha256:startHash,modelConfiguration:publicModel,effectiveParameters:{maxOutputTokens:'provider_default_observed_omission'},firstDraft:'unknown'}));
 const execution={caseId:'QE05',status:'generated_pending_independent_review',finishedAt:new Date().toISOString(),runtimeHashes,steps:[{index:1,runId:'actual-run',after:[{path:path.join(mountPath,'note.md'),sha256:sha('Actual saved bytes')}]}],artifacts:[{path:snapshot,step:1,origin:'saved_artifact',sha256:sha('Actual saved bytes')}]};await fs.writeFile(path.join(caseDir,'execution.json'),JSON.stringify(execution));const db=new DatabaseSync(path.join(profile,'slash.sqlite'));db.exec('CREATE TABLE kv(key TEXT PRIMARY KEY,value TEXT NOT NULL)');db.prepare('INSERT INTO kv VALUES (?,?)').run('state',JSON.stringify({runs:[{id:'actual-run',status:'succeeded'}]}));db.close();
 const processPath=path.join(caseDir,'processing');await fs.mkdir(processPath);
 const events:string[]=[],requests:string[]=[],state={runs:[{id:'actual-run',status:'succeeded'}],models:[model],mounts:[{id:'output',name:'成果',path:mountPath,enabled:true,write:true},{id:'process',name:'过程文件',path:processPath,enabled:true,write:true}],conversations:[]};let opened=0,live=false;
 const launch=async()=>{assert.equal(live,false,'A second instance cannot open before first close resolves');live=true;const id=++opened;events.push(`open:${id}`);return{sessionId:String(id),call:async(input:any)=>{requests.push(input.type);if(input.type==='state')return state;if(input.type==='read')return'Actual saved bytes';if(input.type==='versions')return[{id:'actual-version',contentHash:sha('Actual saved bytes')}];if(input.type==='export'){events.push(`export:${id}`);return;}throw Error('UNEXPECTED_REQUEST');},exportCopy:async(input:any)=>{await input.call({type:'export',mountId:input.mountId,path:input.path,format:'copy',expectedContentHash:input.expectedContentHash});await fs.writeFile(input.targetPath,'Actual saved bytes',{flag:'wx'});return{path:input.targetPath};},close:async()=>{events.push(`close:${id}`);live=false;}};};
 return{repo,root,caseDir,profile,processPath,execution,events,requests,state,launch};
}

test('completed collector closes first owner before reopening and uses guarded export with actual version/hash evidence',async t=>{
 const f=await setup(t),original=await fs.readFile(path.join(f.caseDir,'execution.json')),evidence=await collectCompletedProductionTrial({repo:f.repo,testDir:f.root,caseId:'QE05',launch:f.launch}),life=JSON.parse(await fs.readFile(evidence.path,'utf8'));
 assert.deepEqual(f.events,['open:1','close:1','open:2','export:2','close:2']);assert.deepEqual(life.sessionIds,['1','2']);assert.equal(life.saved,true);assert.equal(life.reopened,true);assert.equal(life.exported,true);assert.equal(await fs.readFile(life.artifacts[0].exported.path,'utf8'),'Actual saved bytes');const versions=JSON.parse(await fs.readFile(life.artifacts[0].versionsEvidence.path,'utf8'));assert.equal(versions.path,'note.md');assert.equal(versions.versions[0].id,'actual-version');assert.deepEqual(await fs.readFile(path.join(f.caseDir,'execution.json')),original);assert.ok(f.requests.every(type=>['state','read','versions','export'].includes(type)));await assert.rejects(collectCompletedProductionTrial({repo:f.repo,testDir:f.root,caseId:'QE05',launch:f.launch}),/PRODUCTION_TRIAL_ALREADY_COLLECTED/);assert.equal(sha(await fs.readFile(evidence.path,'utf8')),evidence.sha256);
 const exported=await fs.realpath(life.artifacts[0].exported.path),relative=path.relative(await fs.realpath(f.processPath),exported);assert.ok(relative&&!relative.startsWith('..')&&!path.isAbsolute(relative));assert.match(path.dirname(relative),/^production-exports-/);const trace=JSON.parse(await fs.readFile(life.ipcEvidence.path,'utf8'));assert.equal(trace.exportTarget.mountId,'process');assert.equal(await fs.realpath(trace.exportTarget.directory),path.dirname(exported));
});

test('collector cannot create an export target without an existing writable process grant',async t=>{
 const f=await setup(t);f.state.mounts.find(m=>m.id==='process')!.write=false;
 await assert.rejects(collectCompletedProductionTrial({repo:f.repo,testDir:f.root,caseId:'QE05',launch:f.launch}),/PRODUCTION_EXPORT_PROCESS_MOUNT_UNAVAILABLE/);assert.deepEqual(f.events,['open:1','close:1']);assert.deepEqual(await fs.readdir(f.processPath),[]);assert.ok(!f.requests.includes('export'));
});

test('process export grant outside evaluationRoot is rejected without changing permissions',async t=>{
 const f=await setup(t);const mount=f.state.mounts.find(m=>m.id==='process')!;mount.path=f.repo;const original=structuredClone(f.state.mounts);
 await assert.rejects(collectCompletedProductionTrial({repo:f.repo,testDir:f.root,caseId:'QE05',launch:f.launch}),/EVALUATION_PATH_OUTSIDE_ROOT/);assert.deepEqual(f.state.mounts,original);assert.deepEqual(f.events,['open:1','close:1']);assert.ok(!f.requests.includes('export'));
});

test('reopened process mount identity and write permission must still match before any export',async t=>{
 const f=await setup(t);let count=0;const launch=async()=>{const session=await f.launch();if(++count===2)f.state.mounts.find(m=>m.id==='process')!.write=false;return session;};
 await assert.rejects(collectCompletedProductionTrial({repo:f.repo,testDir:f.root,caseId:'QE05',launch}),/PRODUCTION_EXPORT_PROCESS_MOUNT_CHANGED/);assert.deepEqual(f.events,['open:1','close:1','open:2','close:2']);assert.deepEqual(await fs.readdir(f.processPath),[]);assert.ok(!f.requests.includes('export'));
});

test('same exported bytes at a different path cannot stand in for the unique preselected target',async t=>{
 const f=await setup(t),other=path.join(f.processPath,'existing-user-file.md');await fs.writeFile(other,'Actual saved bytes');const original=await fs.readFile(other);const launch=async()=>{const session=await f.launch();session.exportCopy=async()=>({path:other});return session;};
 await assert.rejects(collectCompletedProductionTrial({repo:f.repo,testDir:f.root,caseId:'QE05',launch}),/PRODUCTION_EXPORT_TARGET_MISMATCH/);assert.deepEqual(await fs.readFile(other),original);await assert.rejects(fs.access(path.join(f.caseDir,'production-trial.json')));assert.deepEqual(f.events,['open:1','close:1','open:2','close:2']);
});

test('active saved Run and concurrent profile ownership reject before any app launch and preserve failed attempt receipts',async t=>{
 const f=await setup(t),db=new DatabaseSync(path.join(f.profile,'slash.sqlite'));db.prepare("UPDATE kv SET value=? WHERE key='state'").run(JSON.stringify({runs:[{status:'running'}]}));db.close();await assert.rejects(collectCompletedProductionTrial({repo:f.repo,testDir:f.root,caseId:'QE05',launch:f.launch}),/PRODUCTION_PROFILE_HAS_ACTIVE_RUN/);assert.deepEqual(f.events,[]);await fs.writeFile(path.join(f.caseDir,'production-profile-owner.lock'),'existing owner',{flag:'wx'});await assert.rejects(collectCompletedProductionTrial({repo:f.repo,testDir:f.root,caseId:'QE05',launch:f.launch}),/PRODUCTION_PROFILE_ALREADY_OWNED/);assert.equal(await fs.readFile(path.join(f.caseDir,'production-profile-owner.lock'),'utf8'),'existing owner');const attempts=await fs.readdir(f.caseDir);assert.equal(attempts.filter(file=>file.startsWith('production-collector-attempt-')).length,2);
});

test('formal export gate rejection keeps original receipts, failure reason and closes the reopened instance',async t=>{
 const f=await setup(t),original=await fs.readFile(path.join(f.caseDir,'execution.json'));const launch=async()=>{const session=await f.launch();session.exportCopy=async()=>{throw Error('TASK_DELIVERY_BLOCKED');};return session;};await assert.rejects(collectCompletedProductionTrial({repo:f.repo,testDir:f.root,caseId:'QE05',launch}),/TASK_DELIVERY_BLOCKED/);assert.deepEqual(f.events,['open:1','close:1','open:2','close:2']);assert.deepEqual(await fs.readFile(path.join(f.caseDir,'execution.json')),original);const attemptFile=(await fs.readdir(f.caseDir)).find(file=>file.startsWith('production-collector-attempt-'))!;const attempt=JSON.parse(await fs.readFile(path.join(f.caseDir,attemptFile),'utf8'));assert.equal(attempt.status,'failed');assert.equal(attempt.reason,'TASK_DELIVERY_BLOCKED');await assert.rejects(fs.access(path.join(f.caseDir,'production-trial.json')));
});

test('executor without finished/closed receipt cannot be upgraded and close failure preserves the profile lock',async t=>{
 const f=await setup(t);await fs.writeFile(path.join(f.caseDir,'execution.json'),JSON.stringify({...f.execution,finishedAt:undefined}));await assert.rejects(collectCompletedProductionTrial({repo:f.repo,testDir:f.root,caseId:'QE05',launch:f.launch}),/PRODUCTION_EXECUTOR_NOT_CLOSED/);assert.deepEqual(f.events,[]);await fs.writeFile(path.join(f.caseDir,'execution.json'),JSON.stringify(f.execution));const launch=async()=>{const session=await f.launch();session.close=async()=>{throw Error('ACTUAL_INSTANCE_CLOSE_FAILURE');};return session;};await assert.rejects(collectCompletedProductionTrial({repo:f.repo,testDir:f.root,caseId:'QE05',launch}),/ACTUAL_INSTANCE_CLOSE_FAILURE/);await fs.access(path.join(f.caseDir,'production-profile-owner.lock'));assert.deepEqual(f.events,['open:1']);
});

test('second instance close failure preserves pending evidence but never commits a complete final trial',async t=>{
 const f=await setup(t),original=await fs.readFile(path.join(f.caseDir,'execution.json'));let launched=0;const launch=async()=>{const session=await f.launch();if(++launched===2)session.close=async()=>{throw Error('ACTUAL_SECOND_INSTANCE_CLOSE_FAILURE');};return session;};
 await assert.rejects(collectCompletedProductionTrial({repo:f.repo,testDir:f.root,caseId:'QE05',launch}),/ACTUAL_SECOND_INSTANCE_CLOSE_FAILURE/);
 await assert.rejects(fs.access(path.join(f.caseDir,'production-trial.json')));await fs.access(path.join(f.caseDir,'production-profile-owner.lock'));assert.deepEqual(await fs.readFile(path.join(f.caseDir,'execution.json')),original);
 const files=await fs.readdir(f.caseDir),pending=files.filter(file=>file.startsWith('production-trial-pending-'));assert.equal(pending.length,1);const attempt=JSON.parse(await fs.readFile(path.join(f.caseDir,files.find(file=>file.startsWith('production-collector-attempt-'))!),'utf8'));assert.equal(attempt.status,'failed');assert.equal(attempt.reason,'ACTUAL_SECOND_INSTANCE_CLOSE_FAILURE');assert.equal(attempt.closeError,'ACTUAL_SECOND_INSTANCE_CLOSE_FAILURE');assert.ok(attempt.candidateEvidence);assert.equal(attempt.lifecycle,undefined);assert.deepEqual(f.events,['open:1','close:1','open:2','export:2']);
});
