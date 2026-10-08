import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {Service} from '../main/service.js';
import {Store} from '../main/store.js';
import type {RuntimeOptions} from '../main/agent.js';

async function fixture(t:test.TestContext,execute:(o:RuntimeOptions,service:Service,text:string)=>Promise<void>){
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'slash-draft-resume-')),store=new Store(path.join(dir,'data'));
 const service=new Service(store,()=> 'offline-key',()=>{},async o=>({messages:[{role:'assistant',stopReason:'stop'}],abort:async()=>{},dispose:()=>{},prompt:async(text:string)=>{await execute(o,service,text);o.delta('完成');}}));
 t.after(async()=>{service.dispose();await Promise.allSettled([...(service as any).agentIndex.queues.values()]);store.close();await fs.rm(dir,{recursive:true,force:true,maxRetries:5,retryDelay:30});});
 await service.workspace(path.join(dir,'project'));const output=service.state.mounts.find(m=>m.name==='成果')!,target={mountId:output.id,path:'index.html'};
 await fs.writeFile(path.join(output.path,target.path),'<main>base</main>');
 return{dir,store,service,output,target};
}
async function done(service:Service,id:string){for(let i=0;i<500;i++){const run=service.state.runs.find(r=>r.id===id);if(run&&['succeeded','failed','cancelled','awaiting_plan','interrupted'].includes(run.status))return run;await new Promise(resolve=>setTimeout(resolve,10));}throw Error('offline run timeout');}

test('两次明确恢复在执行前建立父关系；同卡逐次增量承接、来源和版本保留，未应用骨架',async t=>{
 let attempt=0,first='',second='',changeId='';
 const f=await fixture(t,async(o,s,text)=>{
  const target={mountId:s.state.mounts.find(m=>m.name==='成果')!.id,path:'index.html'},run=s.state.runs.find(r=>r.id===o.runId)!;
  if(++attempt===1){first=o.runId;const draft=await o.files.draft(target.mountId,target.path,'<main>one</main>',o.runId);changeId=draft.id;o.draft(draft);throw Error('FIXTURE_FIRST_INTERRUPTION');}
  assert.equal(run.resumedFromRunId,attempt===2?first:second);assert.equal(run.permissionMode,'standard');assert.equal(run.mode,'build');
  const read=await o.readDraft!(target);assert.equal(read.changeId,changeId);
  const metadata=JSON.parse([...text.matchAll(/<untrusted_resume_draft_metadata>\n([^\n]+)\n<\/untrusted_resume_draft_metadata>/g)].at(-1)![1]);assert.equal(metadata.drafts.length,1);assert.equal(metadata.drafts[0].changeId,changeId);assert.equal(metadata.drafts[0].currentHash,read.contentHash);assert.equal(metadata.drafts[0].originalRunId,first);assert.equal('content' in metadata.drafts[0],false);
  const edit=await o.editDraft!({...target,changeId:read.changeId,expectedContentHash:read.contentHash,oldText:attempt===2?'one':'two',newText:attempt===2?'two':'three'});assert.equal(edit.changeId,changeId);
  // Even retained old runtime options cannot write once their Run has exited.
  await assert.rejects(s.editDraftForRun(first,{...target,changeId:read.changeId,expectedContentHash:read.contentHash,oldText:'two',newText:'stale'}),/CANCELLED/);
  if(attempt===2){second=o.runId;throw Error('FIXTURE_SECOND_INTERRUPTION');}
 });
 const c=f.service.conversation();assert.equal((await done(f.service,await f.service.send(c,'原生恢复','build','standard'))).status,'failed');
 const a=await f.service.resumeRun(first);assert.equal((await done(f.service,a)).status,'failed');
 const b=await f.service.resumeRun(a);assert.equal((await done(f.service,b)).status,'succeeded');
 const change=f.service.state.changes[0];assert.equal(f.service.state.changes.length,1);assert.equal(change.runId,b);assert.equal(change.originRunId,first);assert.equal(change.content,'<main>three</main>');assert.equal(change.resumptionHistory?.length,2);assert.deepEqual(change.resumptionHistory?.map(item=>[item.fromRunId,item.toRunId]),[[first,a],[a,b]]);
 assert.equal(await fs.readFile(path.join(f.output.path,'index.html'),'utf8'),'<main>base</main>');assert.equal(f.service.listVersions(f.target.mountId,f.target.path).length,0);
 await f.service.apply(changeId);assert.equal(await fs.readFile(path.join(f.output.path,'index.html'),'utf8'),'<main>three</main>');assert.equal(f.service.listVersions(f.target.mountId,f.target.path).length,1);
});

test('中间恢复只读后失败时，下一次明确恢复能承接原祖先pending且不生成重复草稿',async t=>{
 let attempt=0,first='',middle='';
 const f=await fixture(t,async(o)=>{
  if(++attempt===1){first=o.runId;o.draft(await o.files.draft(f.target.mountId,f.target.path,'<main>ancestor</main>',o.runId));throw Error('FIXTURE_FAILURE');}
  const read=await o.readDraft!(f.target);if(attempt===2){middle=o.runId;assert.equal(f.service.state.changes[0].runId,first);throw Error('FIXTURE_READ_ONLY_FAILURE');}
  assert.equal(f.service.state.runs.find(r=>r.id===o.runId)?.resumedFromRunId,middle);await o.editDraft!({...f.target,changeId:read.changeId,expectedContentHash:read.contentHash,oldText:'ancestor',newText:'retained'});
 });
 const c=f.service.conversation();await done(f.service,await f.service.send(c,'保留祖先草稿'));await done(f.service,await f.service.resumeRun(first));const final=await f.service.resumeRun(middle);assert.equal((await done(f.service,final)).status,'succeeded');assert.equal(f.service.state.changes.length,1);assert.equal(f.service.state.changes[0].originRunId,first);assert.deepEqual(f.service.state.changes[0].resumptionHistory?.map(item=>[item.fromRunId,item.toRunId]),[[first,final]]);
});

test('普通同会话send和其他会话均不能接管失败Run的pending，错误不改草稿',async t=>{
 let attempt=0,owner='';
 const f=await fixture(t,async(o,s)=>{const target={mountId:s.state.mounts.find(m=>m.name==='成果')!.id,path:'index.html'};if(++attempt===1){owner=o.runId;o.draft(await o.files.draft(target.mountId,target.path,'<main>retained</main>',o.runId));throw Error('FIXTURE_FAILURE');}await assert.rejects(o.readDraft!(target),/DRAFT_OTHER_RUN/);});
 const c=f.service.conversation();await done(f.service,await f.service.send(c,'失败后保留稿'));
 assert.equal((await done(f.service,await f.service.send(c,'普通新任务'))).status,'succeeded');
 assert.equal((await done(f.service,await f.service.send(f.service.conversation(),'另一会话'))).status,'succeeded');
 assert.equal(f.service.state.changes[0].runId,owner);assert.equal(f.service.state.changes[0].content,'<main>retained</main>');assert.equal(f.service.state.changes[0].resumptionHistory,undefined);
});

test('恢复前须父runtime退出；取消不可恢复，Plan恢复不增加Build权限',async t=>{
 let attempt=0;
 const f=await fixture(t,async(o)=>{if(++attempt===1)throw Error('FIXTURE_FAILURE');assert.equal(o.mode,'plan');await assert.rejects(o.readDraft!(f.target),/PLAN_TOOL_DENIED/);});
 const c=f.service.conversation(),first=await f.service.send(c,'只做Plan','plan','standard');await done(f.service,first);
 (f.service as any).active.set(first,{abort:async()=>{}});await assert.rejects(f.service.resumeRun(first),/RUN_RESUME_UNSAFE/);(f.service as any).active.delete(first);
 const parent=f.service.state.runs.find(r=>r.id===first)!;parent.status='cancelled';parent.resumable=true;await assert.rejects(f.service.resumeRun(first),/当前任务不可继续/);parent.status='failed';
 const next=await f.service.resumeRun(first),run=await done(f.service,next);assert.equal(run.status,'awaiting_plan');assert.equal(run.mode,'plan');assert.equal(run.permissionMode,'standard');assert.equal(f.service.state.changes.length,0);
});

test('缺少pending changeId明确提示且不写；错误ID/旧hash继续冲突，正确ID才可增量编辑',async t=>{
 const f=await fixture(t,async(o,s)=>{
  const target={mountId:s.state.mounts.find(m=>m.name==='成果')!.id,path:'index.html'};o.draft(await o.files.draft(target.mountId,target.path,'<main>one</main>',o.runId));const read=await o.readDraft!(target);
  const base={...target,expectedContentHash:read.contentHash,oldText:'one',newText:'two'};
  await assert.rejects(o.editDraft!(base),error=>String(error).includes('DRAFT_ID_REQUIRED')&&String(error).includes(read.changeId!));assert.equal(s.state.changes[0].content,'<main>one</main>');
  await assert.rejects(o.editDraft!({...base,changeId:'wrong-id'}),/VERSION_CONFLICT/);await assert.rejects(o.editDraft!({...base,changeId:read.changeId,expectedContentHash:'0'.repeat(64)}),/VERSION_CONFLICT/);
  await o.editDraft!({...base,changeId:read.changeId});assert.equal(s.state.changes.length,1);assert.equal(s.state.changes[0].content,'<main>two</main>');
 });
 assert.equal((await done(f.service,await f.service.send(f.service.conversation(),'明确ID校验'))).status,'succeeded');
});

test('恢复链保持正式文件版本和资源锁检查，冲突不接管草稿',async t=>{
 let attempt=0,owner='';
 const f=await fixture(t,async(o,s)=>{
  if(++attempt===1){owner=o.runId;o.draft(await o.files.draft(f.target.mountId,f.target.path,'<main>one</main>',o.runId));throw Error('FIXTURE_FAILURE');}
  const read=await o.readDraft!(f.target),lock=s.acquireShareLock({resourceId:f.target.mountId,path:f.target.path},'another-owner');
  await assert.rejects(o.editDraft!({...f.target,changeId:read.changeId,expectedContentHash:read.contentHash,oldText:'one',newText:'two'}),/LOCK/);s.releaseShareLock(lock.id,'another-owner');
  await fs.writeFile(path.join(f.output.path,'index.html'),'<main>external</main>');await assert.rejects(o.readDraft!(f.target),/VERSION_CONFLICT/);
 });
 const c=f.service.conversation();await done(f.service,await f.service.send(c,'保留版本检查'));assert.equal((await done(f.service,await f.service.resumeRun(owner))).status,'succeeded');assert.equal(f.service.state.changes[0].runId,owner);assert.equal(f.service.state.changes[0].resumptionHistory,undefined);
});

test('外部超大/二进制正式文件不进入恢复草稿清单；版本冲突继续阻止编辑',async t=>{
 for(const bytes of [Buffer.alloc(2_000_001,65),Buffer.from([0xff,0xfe,0])]){
  let attempt=0;
  const f=await fixture(t,async(o,s,text)=>{if(++attempt===1){o.draft(await o.files.draft(f.target.mountId,f.target.path,'<main>one</main>',o.runId));throw Error('FIXTURE_FAILURE');}const metadata=JSON.parse([...text.matchAll(/<untrusted_resume_draft_metadata>\n([^\n]+)\n<\/untrusted_resume_draft_metadata>/g)].at(-1)![1]);assert.equal(metadata.drafts.length,0);assert.equal(metadata.skipped,1);await assert.rejects(o.readDraft!(f.target),/VERSION_CONFLICT|DRAFT_TEXT_ONLY/);});
  const c=f.service.conversation(),first=await f.service.send(c,'不读超大原件');await done(f.service,first);await fs.writeFile(path.join(f.output.path,'index.html'),bytes);assert.equal((await done(f.service,await f.service.resumeRun(first))).status,'succeeded');assert.equal(f.service.state.changes[0].runId,first);
 }
});
