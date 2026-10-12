import test from 'node:test';
import assert from 'node:assert/strict';
import {buildContentReviewInput,contentReviewTextHash as hash,reviewContent,verifyContentReviewReceipt,refreshContentReviewReceipt} from '../main/content-review.js';
import {repairableTaskFailures,taskRepairPrompt} from '../main/task-completion.js';
import {contentReviewReceiptSchema,type ContentReviewReceipt} from '../shared/content-review.js';
import type {TaskAcceptanceReport} from '../shared/task-acceptance.js';

const doc=(id:string,text:string)=>({id,text,sha256:hash(text)});
const input=buildContentReviewInput({requests:[{id:'r',text:'仅修正阶段范围，保留其他未核对项。'}],artifacts:[doc('a','所有阶段均允许导入。')],sources:[doc('s','仅初始阶段允许导入。')]});
const good={category:'scope_expansion',severity:'blocking',confidence:'high',scope:'in_scope',repairDisposition:'candidate',explanation:'VALID_LOCAL_FINDING',artifacts:[{artifactRef:'A1',quote:'所有阶段均允许导入。'}],sources:[{sourceRef:'S1',quote:'仅初始阶段允许导入。'}],requests:[{requestRef:'R1',quote:'仅修正阶段范围，保留其他未核对项。'}]};
const bad={...good,explanation:'INVALID_LOCAL_FINDING',artifacts:[{artifactRef:'A1',quote:'不存在的原句'}]};
const coverage={artifactRefs:['A1'],sourceRefs:['S1'],requestRefs:['R1'],directions:['scope_expansion'],limitations:[]};
const raw={findings:[good,bad],coverage};
const reviewer={provider:'offline',modelId:'synthetic',protocol:'domain-fixture'};
const report=(contentReview:ContentReviewReceipt)=>({versionState:'current',results:[],regression:[],contentReview,targets:[],contractHash:hash('fixture')} as unknown as TaskAcceptanceReport);
const seal=(receipt:ContentReviewReceipt)=>{const {resultHash:_,...body}=receipt;receipt.resultHash=hash(JSON.stringify(body));return receipt;};
const run=(response:unknown=raw,options:Partial<Parameters<typeof reviewContent>[0]>={})=>reviewContent({input,reviewer,assertCurrent:async()=>{},review:async()=>({raw:response,stopReason:'stop'}),...options});

test('independently bound finding repairs while aggregate stays invalid/unverified and partial stays partial',async()=>{
 let checks=0;const receipt=await run(raw,{assertCurrent:async()=>{checks++;}});
 assert.equal(checks,2);assert.equal(receipt.completion,'invalid');assert.equal(receipt.status,'unverified');assert.equal(receipt.invalidFindings.length,1);
 assert.deepEqual(receipt.isolatedRepair?.eligibleFindingIds,['finding-1']);assert.equal(receipt.findings[0].repairEligible,true);assert.ok(verifyContentReviewReceipt(receipt));
 assert.equal(repairableTaskFailures(report(receipt)).length,1);const prompt=taskRepairPrompt(report(receipt),1);assert.ok(prompt.includes('VALID_LOCAL_FINDING'));assert.ok(!prompt.includes('INVALID_LOCAL_FINDING'));
 assert.ok(receipt.coverageLimits.some(limit=>limit.includes('方向')));assert.equal(receipt.humanConfirmed,false);
});

test('missing callback, current failure before/after, cancellation and missing sources never grant isolation',async()=>{
 for(const assertCurrent of [undefined,()=>{throw Error('before changed');},(()=>{let checks=0;return()=>{if(++checks===2)throw Error('after changed');};})()]){
  const receipt=await run(raw,{assertCurrent});assert.equal(receipt.isolatedRepair,undefined);assert.ok(receipt.findings.every(f=>!f.repairEligible));assert.deepEqual(repairableTaskFailures(report(receipt)),[]);
 }
 const controller=new AbortController();const cancelled=await run(raw,{signal:controller.signal,assertCurrent:()=>{controller.abort();}});assert.equal(cancelled.completion,'cancelled');assert.equal(cancelled.isolatedRepair,undefined);
 const noSources=buildContentReviewInput({...input.snapshot,sources:[]});const receipt=await run({findings:[{...good,sources:[]},bad],coverage:{...coverage,sourceRefs:[]}},{input:noSources});assert.equal(receipt.isolatedRepair,undefined);
});

test('global JSON/root/coverage identities/stop/error/empty response errors always clear all candidates',async()=>{
 for(const response of ['{bad', {...raw,extra:true},{...raw,findings:[good,bad,good,bad]},{...raw,coverage:{...coverage,sourceRefs:['S999']}},{...raw,coverage:{...coverage,artifactRefs:['A1','A1']}}]){
  const receipt=await run(response);assert.equal(receipt.isolatedRepair,undefined);assert.ok(receipt.findings.every(f=>!f.repairEligible));assert.equal(repairableTaskFailures(report(receipt)).length,0);
 }
 for(const stopReason of ['length','error','aborted','toolUse',undefined]){const receipt=await run(raw,{review:async()=>({raw,stopReason})});assert.equal(receipt.isolatedRepair,undefined);assert.equal(receipt.findings.length,0);}
 const error=await run(raw,{review:async()=>({raw,stopReason:'stop',error:'transport failure'})});assert.equal(error.isolatedRepair,undefined);
 const empty=await run(raw,{review:async()=>({raw,stopReason:'stop',responseDiagnostics:{blockCounts:{text:0,thinking:1,image:0,toolCall:0,unknown:0},textCharacters:0,thinkingCharacters:1,textEmpty:true,reasoningTokenSource:'pi_normalized_actual_unknown'}})});assert.equal(empty.isolatedRepair,undefined);assert.ok(empty.findings.every(f=>!f.repairEligible));
});

test('low confidence, out of scope, record only, no request and fake quotes remain ineligible in mixed response',async()=>{
 for(const change of [{confidence:'low'},{scope:'uncertain'},{scope:'out_of_scope'},{repairDisposition:'record_only'},{requests:[]},{requests:[{requestRef:'R1',quote:'虚构授权'}]},{category:'cross_artifact_consistency',artifacts:[good.artifacts[0],good.artifacts[0]]}]){
  const receipt=await run({findings:[{...good,...change},bad],coverage});assert.equal(receipt.isolatedRepair,undefined);assert.deepEqual(repairableTaskFailures(report(receipt)),[]);
 }
});

test('host scope double hashes, unique existing IDs and aggregate/global consistency reject recomputed tampering',async()=>{
 const original=await run();
 for(const mutate of [
  (r:ContentReviewReceipt)=>{r.isolatedRepair!.inputHash='a'.repeat(64);},
  (r:ContentReviewReceipt)=>{r.isolatedRepair!.promptHash='a'.repeat(64);},
  (r:ContentReviewReceipt)=>{r.isolatedRepair!.eligibleFindingIds=['finding-1','finding-1'];},
  (r:ContentReviewReceipt)=>{r.isolatedRepair!.eligibleFindingIds=['missing'];},
  (r:ContentReviewReceipt)=>{r.completion='completed';},(r:ContentReviewReceipt)=>{r.status='reviewed';},(r:ContentReviewReceipt)=>{r.versionState='stale';},
  (r:ContentReviewReceipt)=>{r.diagnostics=['global error'];},(r:ContentReviewReceipt)=>{r.stopReason='length';},
  (r:ContentReviewReceipt)=>{r.coverage!.sourceIds=['unknown'];},(r:ContentReviewReceipt)=>{r.findings[0].requestBindings=[];},
 ]){const copy=structuredClone(original);mutate(copy);seal(copy);assert.equal(contentReviewReceiptSchema.safeParse(copy).success,false);assert.equal(verifyContentReviewReceipt(copy),false);assert.deepEqual(repairableTaskFailures(report(copy)),[]);}
});

test('same input refresh never upgrades legacy invalid; changed input clears scope and eligibility preserving original',async()=>{
 const current=await run(),legacy=structuredClone(current);delete legacy.isolatedRepair;legacy.findings[0].repairEligible=false;seal(legacy);
 assert.ok(verifyContentReviewReceipt(legacy));assert.equal(refreshContentReviewReceipt(legacy,input),legacy);assert.deepEqual(repairableTaskFailures(report(legacy)),[]);
 const before=JSON.stringify(current),changed=buildContentReviewInput({...input.snapshot,sources:[doc('s','来源现在不同。')]});const stale=refreshContentReviewReceipt(current,changed);
 assert.equal(stale.isolatedRepair,undefined);assert.equal(stale.findings[0].repairEligible,false);assert.equal(stale.versionState,'stale');assert.ok(verifyContentReviewReceipt(stale));assert.equal(JSON.stringify(current),before);
 const completed=await run({findings:[good],coverage});assert.equal(completed.completion,'completed');assert.equal(completed.isolatedRepair,undefined);assert.equal(repairableTaskFailures(report(completed)).length,1);
});


test('stale content review cannot repair even with current overall report, while independent static evidence retains its existing branch',async()=>{
 const receipt=await run(),changed=buildContentReviewInput({...input.snapshot,sources:[doc('s','不同来源。')]}),stale=refreshContentReviewReceipt(receipt,changed),view=report(stale);
 const automatic={criterionId:'static-known',outputId:'a',required:true,status:'failed' as const,reason:'independent static failure',evidence:[{kind:'static_quality' as const,targetHash:input.snapshot.artifacts[0].sha256,checkerVersion:'fixture-static'}]};
 view.results=[automatic];assert.deepEqual(repairableTaskFailures(view),[automatic]);
});
