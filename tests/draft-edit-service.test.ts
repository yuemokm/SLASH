import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {Store} from '../main/store.js';
import {Service} from '../main/service.js';
import type {RuntimeOptions} from '../main/agent.js';
import {hash} from '../main/files.js';
import {requestSchema} from '../shared/types.js';

async function fixture(t:test.TestContext,execute:(o:RuntimeOptions,service:Service)=>Promise<void>){
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'slash-edit-service-')),store=new Store(path.join(dir,'data'));
 const service=new Service(store,()=> 'local-offline-fixture',()=>{},async o=>({messages:[{role:'assistant',stopReason:'stop'}],abort:async()=>{},dispose:()=>{},prompt:async()=>{await execute(o,service);o.delta('完成');}}));
 t.after(async()=>{service.dispose();store.close();await fs.rm(dir,{recursive:true,force:true,maxRetries:5,retryDelay:30});});
 await service.workspace(path.join(dir,'project'));service.setPermission('workspace_read','allow');service.setPermission('artifact_write','allow');
 const output=service.state.mounts.find(m=>m.name==='成果')!;await fs.writeFile(path.join(output.path,'index.html'),'<input readonly>\n');
 return{dir,store,service,target:{mountId:output.id,path:'index.html'},output};
}
async function wait(service:Service,id:string){for(let i=0;i<500;i++){const run=service.state.runs.find(r=>r.id===id);if(run&&['succeeded','failed','awaiting_plan','cancelled'].includes(run.status))return run;await new Promise(r=>setTimeout(r,10));}throw Error('offline fixture run timeout');}
test('Service gateway reads and incrementally edits write_draft latest content, records native diff, applies once',async t=>{
 let changeId='';const f=await fixture(t,async(o,s)=>{
  const target={mountId:s.state.mounts.find(m=>m.name==='成果')!.id,path:'index.html'};
  const initial=await o.files.draft(target.mountId,target.path,'<input readonly>\n<div>A</div>\n',o.runId);await o.log('write_draft',target,async()=>o.draft(initial));
  const first=await o.log('read_draft',target,()=>o.readDraft!(target));assert.equal(first.changeId,initial.id);
  const edited=await o.log('edit_draft',target,()=>o.editDraft!({...target,changeId:first.changeId,expectedContentHash:first.contentHash,oldText:'<input readonly>',newText:'<input>'}));changeId=edited.changeId;assert.equal(changeId,initial.id);
  const latest=await o.readDraft!(target);assert.match(latest.content,/<input>/);assert.match(latest.content,/<div>A<\/div>/);
 });
 const run=await wait(f.service,await f.service.send(f.service.conversation(),'离线验证增量草稿','build','standard'));assert.equal(run.status,'succeeded',run.error);assert.equal(f.service.state.changes.length,1);
 assert.equal(await fs.readFile(path.join(f.output.path,'index.html'),'utf8'),'<input readonly>\n');
 const audit=f.store.db.prepare("SELECT result FROM operations WHERE tool='edit_draft_diff'").get() as {result:string};assert.match(JSON.parse(audit.result).diff,/<input>/);
 await f.service.apply(changeId);assert.equal(await fs.readFile(path.join(f.output.path,'index.html'),'utf8'),'<input>\n<div>A</div>\n');assert.equal(f.service.state.changes[0].status,'applied');
});
test('Service enforces independent read/write capabilities and Plan gateway before pending mutation',async t=>{
 for(const denied of ['workspace_read','artifact_write'] as const){
  let exercised=false;const f=await fixture(t,async(o,s)=>{
   const target={mountId:s.state.mounts.find(m=>m.name==='成果')!.id,path:'index.html'};
   if(denied==='workspace_read')await assert.rejects(o.readDraft!(target),/PERMISSION_DENIED/);else assert.equal((await o.readDraft!(target)).contentHash,hash('<input readonly>\n'));
   await assert.rejects(o.log('edit_draft',target,()=>o.editDraft!({...target,expectedContentHash:hash('<input readonly>\n'),oldText:'readonly',newText:'editable'})),/PERMISSION_DENIED/);exercised=true;
  });
  // Static read/write denials use independent Runs. Restoring a grant cannot
  // resurrect a Run which was cancelled by a live authorization revocation.
  f.service.setPermission(denied,'deny');const run=await wait(f.service,await f.service.send(f.service.conversation(),'离线独立权限验证','build','standard'));assert.equal(run.status,'succeeded',run.error);assert.equal(exercised,true);assert.equal(f.service.state.changes.length,0);assert.equal(await fs.readFile(path.join(f.output.path,'index.html'),'utf8'),'<input readonly>\n');
 }
 let revoked=false;const revokedRun=await fixture(t,async(o,s)=>{s.setPermission('workspace_read','deny');assert.equal(o.signal?.aborted,true);revoked=true;});const cancelled=await wait(revokedRun.service,await revokedRun.service.send(revokedRun.service.conversation(),'运行中撤权','build','standard'));assert.equal(cancelled.status,'failed');assert.match(cancelled.error??'',/RUN_INPUT_AUTHORIZATION_CHANGED/);assert.equal(revoked,true);assert.equal(revokedRun.service.state.changes.length,0);
 const plan=await fixture(t,async(o,s)=>{const target={mountId:s.state.mounts.find(m=>m.name==='成果')!.id,path:'index.html'};await assert.rejects(o.log('edit_draft',target,async()=>{}),/PLAN_TOOL_DENIED/);await assert.rejects(o.readDraft!(target),/PLAN_TOOL_DENIED/);});assert.equal((await wait(plan.service,await plan.service.send(plan.service.conversation(),'方案','plan','standard'))).status,'awaiting_plan');assert.equal(plan.service.state.changes.length,0);
});
test('Service respects locks through an alias mount and preserves apply conflict checks',async t=>{
 const f=await fixture(t,async(o,s)=>{
  const output=s.state.mounts.find(m=>m.name==='成果')!,target={mountId:output.id,path:'index.html'},read=await o.readDraft!(target);
  s.state.mounts.push({...output,id:'alias',name:'alias'});const lock=s.acquireShareLock({resourceId:'alias',path:'index.html'},'other-owner');
  await assert.rejects(o.editDraft!({...target,expectedContentHash:read.contentHash,oldText:'readonly',newText:'editable'}),/LOCK/);s.releaseShareLock(lock.id,'other-owner');
  await o.editDraft!({...target,expectedContentHash:read.contentHash,oldText:'readonly',newText:'editable'});
 });
 const run=await wait(f.service,await f.service.send(f.service.conversation(),'离线锁验证','build','standard'));assert.equal(run.status,'succeeded',run.error);await fs.writeFile(path.join(f.output.path,'index.html'),'changed outside');await assert.rejects(f.service.apply(f.service.state.changes[0].id),/VERSION_CONFLICT/);assert.equal(f.service.state.changes[0].status,'conflict');assert.equal(await fs.readFile(path.join(f.output.path,'index.html'),'utf8'),'changed outside');
});

test('运行中pending读取→实际apply→正式文件读取→旧ID拒绝→最新hash无ID生成新卡，外部变化仍冲突且应用可审计',async t=>{
 const f=await fixture(t,async(o,s)=>{
  const output=s.state.mounts.find(m=>m.name==='成果')!,target={mountId:output.id,path:'index.html'};
  const first=await o.files.draft(target.mountId,target.path,'<main>first</main>',o.runId);o.draft(first);
  const pending=await o.log('read_draft',target,()=>o.readDraft!(target));assert.equal(pending.source,'pending');assert.equal(pending.changeId,first.id);assert.match(pending.notice,/待应用草稿/);
  assert.equal(s.state.runs.find(r=>r.id===o.runId)?.status,'running');await s.apply(first.id,'ui');
  const applied=await o.log('read_draft',target,()=>o.readDraft!(target));assert.equal(applied.source,'applied');assert.equal(Object.hasOwn(applied,'changeId'),false);assert.equal(applied.contentHash,hash('<main>first</main>'));assert.equal(applied.baseHash,applied.contentHash);assert.match(applied.notice,/正式文件/);assert.match(applied.notice,/省略 changeId/);assert.doesNotMatch(applied.notice,/草稿尚未应用/);
  await assert.rejects(o.log('edit_draft',target,()=>o.editDraft!({...target,changeId:first.id,expectedContentHash:applied.contentHash,oldText:'first',newText:'second'})),/DRAFT_ID_STALE: .*重新 read_draft/);assert.equal(s.state.changes.length,1);
  await fs.writeFile(path.join(output.path,target.path),'<main>external</main>');await assert.rejects(o.editDraft!({...target,expectedContentHash:applied.contentHash,oldText:'first',newText:'second'}),/VERSION_CONFLICT/);assert.equal(s.state.changes.length,1);
  const current=await o.readDraft!(target),edit=await o.editDraft!({...target,expectedContentHash:current.contentHash,oldText:'external',newText:'second'});assert.notEqual(edit.changeId,first.id);assert.equal(edit.baseHash,current.contentHash);assert.equal(s.state.changes.find(c=>c.id===first.id)?.status,'applied');assert.equal(s.state.changes.find(c=>c.id===edit.changeId)?.status,'pending');assert.equal(await fs.readFile(path.join(output.path,target.path),'utf8'),'<main>external</main>');
  const audit=s.store.operationsForRun(o.runId).find(op=>op.tool==='apply_draft');assert.equal(audit?.state,'succeeded');const metadata=JSON.parse(audit!.result);assert.equal(metadata.source,'ui');assert.equal(metadata.changeId,first.id);assert.equal(metadata.runStatus,'running');assert.equal(metadata.contentHash,applied.contentHash);assert.equal(metadata.changeStatus,'applied');assert.equal(Object.hasOwn(metadata,'content'),false);
 });
 const run=await wait(f.service,await f.service.send(f.service.conversation(),'交错应用后继续编辑'));assert.equal(run.status,'succeeded',run.error);assert.equal(f.service.state.changes.length,2);
 const pending=f.service.state.changes.find(c=>c.status==='pending')!;await fs.writeFile(path.join(f.output.path,'index.html'),'outside after new draft');await assert.rejects(f.service.apply(pending.id,'ipc'),/VERSION_CONFLICT/);const failed=f.store.operationsForRun(run.id).find(op=>op.tool==='apply_draft'&&op.state==='failed');assert.equal(JSON.parse(failed!.result).source,'ipc');assert.match(JSON.parse(failed!.result).error,/VERSION_CONFLICT/);
 assert.deepEqual(requestSchema.parse({type:'apply',id:'fixture',source:'ui'}),{type:'apply',id:'fixture',source:'ui'});assert.deepEqual(requestSchema.parse({type:'apply',id:'fixture'}),{type:'apply',id:'fixture'});assert.equal(requestSchema.safeParse({type:'apply',id:'fixture',source:'arbitrary'}).success,false);
});
