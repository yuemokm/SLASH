import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {startPiPlanReview,type PiPlanReviewReceipt} from '../main/pi-plan-review.js';
test('official Plannotator browser protocol binds approval/annotations to Plan hash and returns them to the original run',async()=>{
 const plan='# 方案 1：研究现有资料\n\n先核验来源，再提出步骤与取舍。';let receipt:PiPlanReviewReceipt|undefined,opened='';
 const review=await startPiPlanReview(plan,{runId:'plan-run',mode:'plan',openReview:async url=>{opened=url;},onFeedback:async value=>{receipt=value;}});
 try{
  assert.equal((await fetch(`http://127.0.0.1:${review.upstreamPort}/api/plan`)).status,403,'direct upstream cannot bypass host restrictions');
  assert.equal(opened,review.url);const first=await fetch(review.url);assert.equal(first.status,200);assert.match(await first.text(),/Plannotator|plannotator/);const cookie=first.headers.get('set-cookie')!.split(';')[0];const base=new URL(review.url).origin;const headers={cookie,'content-type':'application/json'};
  const payload=await(await fetch(base+'/api/plan',{headers})).json();assert.equal(payload.plan,plan);assert.equal(payload.sharingEnabled,false);
  assert.equal((await fetch(base+'/api/reference/files',{headers})).status,403);assert.equal((await fetch(base+'/api/config',{method:'POST',headers,body:'{}'})).status,403);
  assert.equal((await fetch(base+'/api/approve',{method:'DELETE',headers})).status,405);
  const stale=await fetch(base+'/api/approve',{method:'POST',headers,body:JSON.stringify({serverSession:'old-tab',planRevision:0})});assert.equal(stale.status,409);
  const feedback='段落批注：补充来源日期，并保留方案 2 的取舍。';const response=await fetch(base+'/api/approve',{method:'POST',headers,body:JSON.stringify({serverSession:payload.serverSession,planRevision:0,feedback,planSave:{enabled:true,customPath:'outside'},permissionMode:'bypassPermissions'})});assert.equal(response.status,200);
  const done=await review.completion;assert.equal(done.approved,true);assert.equal(done.feedback,feedback);assert.equal(done.runId,'plan-run');assert.equal(done.planHash,createHash('sha256').update(plan).digest('hex'));assert.deepEqual(receipt,done);assert.equal((done as any).permissionMode,undefined);
 }finally{await review.close();}
});
test('Plan review refuses Build and abort destroys temporary review without feedback',async()=>{
 await assert.rejects(startPiPlanReview('plan',{runId:'build',mode:'build',openReview:async()=>{},onFeedback:async()=>{}}),/PLAN_MODE/);
 const controller=new AbortController();let called=false;const review=await startPiPlanReview('研究方案',{runId:'plan',mode:'plan',signal:controller.signal,openReview:async()=>{},onFeedback:async()=>{called=true;}});controller.abort();await assert.rejects(review.completion);await review.close();assert.equal(called,false);await assert.rejects(fetch(review.url));
});
