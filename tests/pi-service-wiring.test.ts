import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {Store} from '../main/store.js';
import {Service} from '../main/service.js';
import {hash} from '../main/files.js';
import type {RuntimeOptions} from '../main/agent.js';

async function wait(check:()=>boolean){for(let i=0;i<500;i++){if(check())return;await new Promise(resolve=>setTimeout(resolve,10));}throw Error('fixture timed out');}
async function fixture(t:test.TestContext,onPrompt:(o:RuntimeOptions,s:Service)=>Promise<void>){
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'slash-pi-service-')),store=new Store(path.join(dir,'profile'));let options!:RuntimeOptions;
 const service=new Service(store,()=> 'local-fixture-key',()=>{},async o=>{options=o;return{messages:[{role:'assistant',stopReason:'stop'}],abort:async()=>{},dispose:()=>{},prompt:async()=>{await onPrompt(o,service);}} as never;},{fetchModelMetadata:async()=>{throw Error('NO_NETWORK_IN_SERVICE_FIXTURE');}});
 await service.workspace(path.join(dir,'project'));service.setPermission('workspace_read','allow');service.setPermission('artifact_write','allow');
 t.after(async()=>{service.dispose();await Promise.allSettled([...(service as any).agentIndex.queues.values()]);store.close();await fs.rm(dir,{recursive:true,force:true,maxRetries:5,retryDelay:30});});
 const send=async(mode:'plan'|'build')=>{const id=await service.send(service.conversation(),'本机接线验收',mode,'standard');await wait(()=>!!service.state.runs.find(run=>run.id===id)?.finishedAt&&!service.active.has(id)&&!service.starting.has(id));return service.state.runs.find(run=>run.id===id)!;};
 return{service,store,send,options:()=>options};
}
test('Service retains Plan review after parent settles, writes asynchronous feedback to original conversation, and closes cancelled reviews',async t=>{
 let closes=0;const f=await fixture(t,async o=>{o.planReviewOpened!({runId:o.runId,reviewId:'review-one',url:'http://127.0.0.1:9000/?slashReview=local',planHash:hash('review text'),close:async()=>{closes++;}});o.delta('方案 1：研究现有资料\n方案 2：补充访谈。');});
 const run=await f.send('plan');assert.equal(run.status,'awaiting_plan',run.error);assert.equal(closes,0);assert.equal(run.piPlanReview?.status,'awaiting_user');
 await f.options().planReviewed!({package:'@plannotator/pi-extension',version:'0.28.8',runId:run.id,reviewId:'review-one',planHash:hash('review text'),approved:false,feedback:'补充第一步的证据',reviewedPlan:'review text',answersOnly:false});assert.equal(run.piPlanReview?.status,'needs_changes');assert(f.service.state.conversations.find(c=>c.id===run.conversationId)?.messages.some(m=>m.text.includes('补充第一步的证据')));
 const next=await f.send('plan');await f.service.cancelPiPlanReview(next.id);assert.equal(closes,1);assert.equal(next.piPlanReview?.status,'cancelled');const before=f.service.state.conversations.flatMap(c=>c.messages).length;await f.options().planReviewed!({package:'@plannotator/pi-extension',version:'0.28.8',runId:next.id,reviewId:'review-one',planHash:hash('review text'),approved:true,feedback:'late',reviewedPlan:'review text',answersOnly:false});assert.equal(f.service.state.conversations.flatMap(c=>c.messages).length,before);
});
test('code review host checks current draft hash and current permissions; failed observability cleanup cannot strand active Run',async t=>{
 const f=await fixture(t,async(o,s)=>{o.observabilityRegistered!(async()=>{throw Error('local simulated cleanup failure');});const mount=s.state.mounts.find(m=>m.name==='成果')!;const change=await o.files.draft(mount.id,'review.js','const safe = 1;',o.runId);o.draft(change);assert.equal((await o.draftForCodeReview!({changeId:change.id,expectedContentHash:hash(change.content)})).content,change.content);await assert.rejects(o.draftForCodeReview!({changeId:change.id,expectedContentHash:hash('stale')}),/VERSION_CONFLICT/);s.setPermission('workspace_read','deny');await assert.rejects(o.draftForCodeReview!({changeId:change.id,expectedContentHash:hash(change.content)}),/PERMISSION_DENIED/);s.setPermission('workspace_read','allow');o.delta('只验证宿主接线，不代表模型或代码诊断验收。');});
 const run=await f.send('build');assert.equal(run.status,'failed');assert.match(run.error??'',/AUTHORIZATION_CHANGED/);assert.equal(f.service.active.size,0);assert.equal(f.service.starting.size,0);await assert.rejects(f.options().draftForCodeReview!({changeId:f.service.state.changes[0].id,expectedContentHash:hash(f.service.state.changes[0].content)}),/CANCELLED/);
});
