import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {contentReviewWireFindingSchema,contentReviewWireFindingV3Schema,contentReviewReceiptSchema,CONTENT_REVIEW_WIRE_VERSION} from '../shared/content-review.js';
import {buildContentReviewInput,contentReviewTextHash,reviewContent,verifyContentReviewReceipt,refreshContentReviewReceipt} from '../main/content-review.js';
import {REVIEW_OUTPUT_JSON_SCHEMA,REVIEW_OUTPUT_SCHEMA_HASH,REVIEW_PROTOCOL_PROMPT} from '../main/content-review-protocol.js';
const Ajv=createRequire(import.meta.url)('ajv');
const validate=new Ajv({strict:false}).compile((REVIEW_OUTPUT_JSON_SCHEMA as any).properties.findings.items);
const hash=(value:Buffer|string)=>createHash('sha256').update(value).digest('hex');
const doc=(id:string,text:string)=>({id,text,sha256:contentReviewTextHash(text)});
const snapshot={requests:[{id:'request',text:'Compare the two supplied account rules. Identify supported facts and uncertain scope.'}],artifacts:[doc('artifact-one','Consumer-only manual creation is the overall rule. Business launch import contradicts it.'),doc('artifact-two','Business accounts may use launch import.')],sources:[doc('policy','New consumer accounts are created manually. New business accounts may use batch import at launch.'),doc('workflow','|Sequence|Action|\n|200|Review|\n|300|Approve|')]};
const makeInput=()=>buildContentReviewInput(snapshot,{promptCharacters:59392});
const input=makeInput();
const refs=(kind:string,id:string)=>input.referenceTable.find(r=>r.kind===kind&&r.id===id)!.alias;
const A={artifactRef:refs('artifact','artifact-one'),quote:'Consumer-only manual creation is the overall rule.'};
const Asecond={artifactRef:A.artifactRef,quote:'Business launch import contradicts it.'};
const Aother={artifactRef:refs('artifact','artifact-two'),quote:'Business accounts may use launch import.'};
const S={sourceRef:refs('source','policy'),quote:'New consumer accounts are created manually.'};
const Ssecond={sourceRef:S.sourceRef,quote:'New business accounts may use batch import at launch.'};
const R={requestRef:refs('request','request'),quote:snapshot.requests[0].text};
const finding={category:'contradiction',severity:'advisory',confidence:'low',scope:'uncertain',repairDisposition:'record_only',explanation:'Different objects require separate rule scopes.',artifacts:[A],sources:[S,Ssecond],requests:[R]};
const coverage={artifactRefs:input.referenceTable.filter(r=>r.kind==='artifact').map(r=>r.alias),sourceRefs:input.referenceTable.filter(r=>r.kind==='source').map(r=>r.alias),requestRefs:[R.requestRef],directions:['fact_inference','scope_expansion','contradiction','cross_artifact_consistency','field_semantics','request_coverage'],limitations:[]};
const reviewer={provider:'fixture-only',modelId:'no-network',protocol:'offline-callback'};
const run=(item:unknown)=>reviewContent({input:makeInput(),reviewer,review:async()=>({raw:{findings:[item],coverage},stopReason:'stop'})});
const oldInput=JSON.parse(readFileSync(new URL('./fixtures/content-review-v3-capacity-input.json',import.meta.url),'utf8'));
const oldReceipt=JSON.parse(readFileSync(new URL('./fixtures/content-review-v3-capacity-receipt.json',import.meta.url),'utf8'));

test('v4 JSON schema and host agree for every bounded quote-count combination, including record_only',()=>{
 assert.equal(CONTENT_REVIEW_WIRE_VERSION,4);
 assert.match(REVIEW_PROTOCOL_PROMPT,/总引用最多4处/);
 for(let a=0;a<=3;a++)for(let s=0;s<=3;s++)for(let r=0;r<=3;r++){
  const item={...finding,artifacts:Array.from({length:a},()=>A),sources:Array.from({length:s},()=>S),requests:Array.from({length:r},()=>R)};
  const expected=a>=1&&a<=2&&s<=2&&r<=2&&s+r>=1&&a+s+r<=4;
  assert.equal(contentReviewWireFindingSchema.safeParse(item).success,expected,`host ${a}/${s}/${r}`);
  assert.equal(validate(item),expected,`projected schema ${a}/${s}/${r}`);
 }
});

test('exact four citations express paired-source uncertainty without raising confidence or repair permission',async()=>{
 assert.equal(contentReviewWireFindingV3Schema.safeParse(finding).success,false);
 const receipt=await run(finding);assert.equal(receipt.completion,'completed');assert.equal(receipt.findings.length,1);
 assert.equal(receipt.findings[0].confidence,'low');assert.equal(receipt.findings[0].scope,'uncertain');assert.equal(receipt.findings[0].repairEligible,false);
 assert.equal(receipt.findings[0].sourceBindings.length,2);assert.equal(receipt.humanConfirmed,false);assert.ok(verifyContentReviewReceipt(receipt));
});

test('two quotes in one artifact and A2/S2/R0 remain representable for internal disagreement and record-only evidence',async()=>{
 for(const item of [{...finding,artifacts:[A,Asecond],sources:[S],requests:[R]},{...finding,artifacts:[A,Asecond],sources:[S,Ssecond],requests:[]}]){
  assert.ok(validate(item));const receipt=await run(item);assert.equal(receipt.completion,'completed');assert.equal(receipt.findings[0].artifactBindings.length,2);assert.equal(receipt.findings[0].repairEligible,false);
 }
});

test('four quotes never replace actual scope, candidate, confidence, request or distinct-artifact repair checks',async()=>{
 const candidate={...finding,scope:'in_scope',confidence:'high',repairDisposition:'candidate'};
 const allowed=await run(candidate);assert.equal(allowed.findings[0].repairEligible,true);
 for(const extra of [{scope:'uncertain'},{scope:'out_of_scope'},{confidence:'medium'},{repairDisposition:'record_only'}]){const receipt=await run({...candidate,...extra});assert.equal(receipt.completion,'completed');assert.equal(receipt.findings[0].repairEligible,false);}
 const withoutRequest=await run({...candidate,artifacts:[A,Asecond],requests:[]});assert.equal(withoutRequest.findings[0].repairEligible,false);
 const same=await run({...candidate,category:'cross_artifact_consistency',artifacts:[A,Asecond],sources:[S]});assert.equal(same.findings[0].repairEligible,false);
 const distinct=await run({...candidate,category:'cross_artifact_consistency',artifacts:[A,Aother],sources:[S]});assert.equal(distinct.findings[0].repairEligible,true);
});

test('five quotes, per-array overflow and 161-character quotes stay invalid without truncation or retries',async()=>{
 for(const item of [{...finding,artifacts:[A,Asecond]},{...finding,sources:[S,Ssecond,S]},{...finding,artifacts:[{...A,quote:'x'.repeat(161)}]}]){
  assert.equal(validate(item),false);assert.equal(contentReviewWireFindingSchema.safeParse(item).success,false);
  const before=JSON.stringify(item),receipt=await run(item);assert.equal(receipt.completion,'invalid');assert.equal(receipt.findings.length,0);assert.equal(JSON.stringify(item),before);
 }
});

test('concatenated and flattened non-contiguous citations still fail binding even when total is four',async()=>{
 const bad=[{...finding,sources:[{...S,quote:S.quote+' '+Ssecond.quote.replace('New ','')} ,Ssecond]}, {...finding,sources:[S,{sourceRef:refs('source','workflow'),quote:'|200|Review| |300|Approve|'}]}];
 for(const item of bad){assert.ok(contentReviewWireFindingSchema.safeParse(item).success);const receipt=await run(item);assert.equal(receipt.completion,'invalid');assert.equal(receipt.findings.length,0);assert.match(receipt.invalidFindings[0].reason,/原句无法/);}
});


test('self-contained signed v3 receipt stays readable and unchanged; new schema creates only a stale derived view',()=>{
 const bytes=JSON.stringify(oldReceipt);assert.ok(contentReviewReceiptSchema.safeParse(oldReceipt).success);assert.ok(verifyContentReviewReceipt(oldReceipt));assert.equal(oldReceipt.findings[0].repairEligible,true);
 const next=buildContentReviewInput(oldInput.snapshot,{promptCharacters:oldInput.promptCharacterLimit});assert.notEqual(next.outputSchemaHash,oldInput.outputSchemaHash);assert.notEqual(next.inputHash,oldInput.inputHash);
 const stale=refreshContentReviewReceipt(oldReceipt,next);assert.equal(stale.versionState,'stale');assert.equal(stale.status,'unverified');assert.ok(stale.findings.every(f=>!f.repairEligible));assert.ok(verifyContentReviewReceipt(stale));assert.equal(JSON.stringify(oldReceipt),bytes);assert.ok(verifyContentReviewReceipt(oldReceipt));
});
test('self-contained v3 input is rejected before any model callback, including its old schema hash',async()=>{
 let calls=0;await assert.rejects(reviewContent({input:oldInput,reviewer,review:async()=>{calls++;return{raw:{},stopReason:'stop'};}}),/CONTENT_REVIEW_SCHEMA_CHANGED/);
 const changed=structuredClone(makeInput());changed.outputSchemaHash=oldInput.outputSchemaHash;await assert.rejects(reviewContent({input:changed,reviewer,review:async()=>{calls++;return{raw:{},stopReason:'stop'};}}),/CONTENT_REVIEW_SCHEMA_CHANGED/);assert.equal(calls,0);
});
test('v4 keeps explicit configured prompt budget and snapshot; old wire assumptions are not silently inherited',()=>{
 const rebuilt=buildContentReviewInput(oldInput.snapshot,{promptCharacters:59392});assert.equal(rebuilt.promptCharacterLimit,59392);assert.ok(rebuilt.prompt.length<=59392);assert.deepEqual(rebuilt.snapshot,oldInput.snapshot);assert.equal(rebuilt.wireVersion,4);assert.equal(rebuilt.outputSchemaHash,REVIEW_OUTPUT_SCHEMA_HASH);assert.notEqual(rebuilt.promptHash,oldInput.promptHash);
});
