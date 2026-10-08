import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeContext,type Api,type Model,type Context} from '@earendil-works/pi-ai';
import {estimateContextTokens} from '@earendil-works/pi-ai/utils/estimate';
import {clampMaxTokensToContext} from '@earendil-works/pi-ai/api/simple-options';
import {contentReviewBudget,contentReviewBudgetDiagnostics,CONTENT_REVIEW_BUDGET_NOTICE} from '../main/content-review-budget.js';
import {contentReviewResponseDiagnostics} from '../main/content-review-response.js';
import {contentReviewResponseDiagnosticsSchema,contentReviewReceiptSchema} from '../shared/content-review.js';
import {buildContentReviewInput,contentReviewTextHash,reviewContent,verifyContentReviewReceipt} from '../main/content-review.js';

const model={id:'selected-model',name:'Local fixture',provider:'local-fixture',api:'openai-completions',baseUrl:'http://127.0.0.1:1/v1',reasoning:false,input:['text'],cost:{input:0,output:0,cacheRead:0,cacheWrite:0},contextWindow:65536,maxTokens:12000} as Model<Api>;
const context=(text:string):Context=>({messages:[{role:'user',content:text,timestamp:1}]});
const doc=(id:string,text:string)=>({id,text,sha256:contentReviewTextHash(text),readCoverage:'full' as const});
const snapshot={requests:[{id:'actual-request',text:'核查说明与来源并保留待确认项。'}],artifacts:[doc('real-artifact','当前成果需要按来源核查。')],sources:[doc('real-source','资料说明。')]};
const reviewer={provider:'local-fixture',modelId:'selected-model',protocol:'openai-completions'};
const valid={findings:[],coverage:{artifactRefs:['A1'],sourceRefs:['S1'],requestRefs:['R1'],directions:['fact_inference','scope_expansion','contradiction','cross_artifact_consistency','field_semantics','request_coverage'],limitations:[]}};

test('review reuses resolved 12000/low output caps without changing limits or introducing a new input allocation',()=>{
 assert.deepEqual(contentReviewBudget(model),{requestedOutputTokens:12000});
 assert.deepEqual(contentReviewBudget({contextWindow:65536,maxTokens:2048}),{requestedOutputTokens:2048});
 assert.deepEqual(contentReviewBudget({contextWindow:16384,maxTokens:12000}),{requestedOutputTokens:12000});
 assert.equal(model.maxTokens,12000);assert.match(CONTENT_REVIEW_BUDGET_NOTICE,/thinking/);assert.match(CONTENT_REVIEW_BUDGET_NOTICE,/not upstream token measurements/);
});
test('review rejects invalid resolved model limits instead of inferring or raising a limit',()=>{
 for(const limits of [{contextWindow:65536,maxTokens:0},{contextWindow:65536,maxTokens:-1},{contextWindow:0,maxTokens:1},{contextWindow:65536,maxTokens:NaN},{contextWindow:65536,maxTokens:1.5},{contextWindow:5000,maxTokens:5000}])assert.throws(()=>contentReviewBudget(limits),/MODEL_LIMITS_INVALID/);
});
test('public native Pi estimate/base clamp diagnostics preserve model and packet and expose a lower effective allowance',()=>{
 const small={...model,contextWindow:16384,maxTokens:12000},packet=context('x'.repeat(24000)),before=JSON.stringify(packet);
 const values=contentReviewBudgetDiagnostics(small,packet,contentReviewBudget(small).requestedOutputTokens);
 assert.equal(values.hostPiEstimatedInputTokens,estimateContextTokens(normalizeContext(packet)).tokens);
 assert.equal(values.hostPiBaseClampedOutputTokens,clampMaxTokensToContext(small,normalizeContext(packet),12000));
 assert.ok(values.hostPiBaseClampedOutputTokens<12000);assert.equal(JSON.stringify(packet),before);assert.equal(small.maxTokens,12000);
 assert.deepEqual(Object.keys(values).sort(),['hostPiBaseClampedOutputTokens','hostPiEstimatedInputTokens']);
});
test('small-window existing builder packet remains usable while native output cap can decrease',()=>{
 // Mirrors the existing Service selection budget solely as a compatibility fixture.
 const small={...model,contextWindow:16384},promptCharacters=small.contextWindow-Math.min(4096,small.maxTokens)-2048,input=buildContentReviewInput(snapshot,{promptCharacters});
 assert.ok(input.prompt.length<=10240);const values=contentReviewBudgetDiagnostics(small,context(input.prompt),contentReviewBudget(small).requestedOutputTokens);
 assert.ok(values.hostPiBaseClampedOutputTokens<small.maxTokens);assert.ok(values.hostPiBaseClampedOutputTokens>0);assert.equal(input.snapshot.requests[0].text,snapshot.requests[0].text);
});
test('safe estimate fields persist with receipt hashes, historical diagnostics remain compatible and contents are rejected',async()=>{
 const input=buildContentReviewInput(snapshot),old=contentReviewResponseDiagnostics([{type:'text',text:'public response'},{type:'thinking',thinking:'never store this body'}]);
 const current={...old,...contentReviewBudgetDiagnostics(model,context(input.prompt),12000)};
 contentReviewResponseDiagnosticsSchema.parse(old);contentReviewResponseDiagnosticsSchema.parse(current);
 assert.equal(contentReviewResponseDiagnosticsSchema.safeParse({...current,thinkingBody:'never stored'}).success,false);
 assert.equal(contentReviewResponseDiagnosticsSchema.safeParse({...current,hostPiEstimatedInputTokens:-1}).success,false);
 for(const responseDiagnostics of [undefined,old,current]){const receipt=await reviewContent({input,reviewer,review:async()=>({raw:valid,stopReason:'stop',requestedOutputTokens:12000,responseDiagnostics})});contentReviewReceiptSchema.parse(receipt);assert.ok(verifyContentReviewReceipt(receipt));assert.equal(receipt.humanConfirmed,false);assert.equal(JSON.stringify(receipt).includes('never store this body'),false);assert.equal(receipt.diagnostics.length,0);if(responseDiagnostics)assert.deepEqual(receipt.responseDiagnostics,responseDiagnostics);}
});
test('configured cap does not weaken terminal/parser rules or add retries; cancellation performs no call',async()=>{
 const input=buildContentReviewInput(snapshot);
 for(const output of [{raw:JSON.stringify(valid),stopReason:'length'},{raw:JSON.stringify(valid),stopReason:'error'},{raw:'{malformed',stopReason:'stop'}]){let calls=0;const receipt=await reviewContent({input,reviewer,review:async()=>{calls++;return{...output,requestedOutputTokens:12000,budgetNotice:CONTENT_REVIEW_BUDGET_NOTICE};}});assert.equal(calls,1);assert.equal(receipt.status,'unverified');assert.equal(receipt.findings.length,0);assert.equal(receipt.requestedOutputTokens,12000);}
 let calls=0;const controller=new AbortController();controller.abort();const cancelled=await reviewContent({input,reviewer,signal:controller.signal,review:async()=>{calls++;return{raw:valid,stopReason:'stop'};}});assert.equal(calls,0);assert.equal(cancelled.status,'unverified');assert.equal(cancelled.completion,'cancelled');
});
