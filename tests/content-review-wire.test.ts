import test from 'node:test';
import assert from 'node:assert/strict';
import {buildContentReviewInput,contentReviewTextHash,reviewContent,verifyContentReviewReceipt,refreshContentReviewReceipt} from '../main/content-review.js';
import {contentReviewResponseDiagnostics} from '../main/content-review-response.js';
import {contentReviewReceiptSchema} from '../shared/content-review.js';
const doc=(id:string,text:string)=>({id,text,sha256:contentReviewTextHash(text)});
const snapshot={requests:[{id:'S1',text:'检查审批依据并保留未知范围。'}],artifacts:[doc('S1','审批无需复核。'),doc('A1','审批全部允许。')],sources:[doc('A1','审批必须复核。'),doc('S1','另一个冻结来源。')]};
const reviewer={provider:'local-fixture',modelId:'none',protocol:'domain-callback'};
const dirs=['fact_inference','scope_expansion','contradiction','cross_artifact_consistency','field_semantics','request_coverage'];
const issue={category:'contradiction',severity:'blocking',confidence:'high',scope:'in_scope',repairDisposition:'candidate',explanation:'实际成果与明确规则不同。',artifacts:[{artifactRef:'A2',quote:'审批无需复核。'}],sources:[{sourceRef:'S1',quote:'审批必须复核。'}],requests:[]};
const packet=(findings:unknown[]=[issue])=>({findings,coverage:{artifactRefs:['A1','A2'],sourceRefs:['S1','S2'],requestRefs:['R1'],directions:dirs,limitations:[]}});
const input=()=>buildContentReviewInput(snapshot);
const run=(raw:unknown,additional:object={})=>reviewContent({input:input(),reviewer,review:async()=>({raw,stopReason:'stop',...additional})});

test('canonical aliases do not confuse real IDs equal to aliases or IDs shared across namespaces',async()=>{
 const i=input();assert.deepEqual(i.referenceTable.map(({kind,alias,id})=>({kind,alias,id})),[{kind:'artifact',alias:'A1',id:'A1'},{kind:'artifact',alias:'A2',id:'S1'},{kind:'source',alias:'S1',id:'A1'},{kind:'source',alias:'S2',id:'S1'},{kind:'request',alias:'R1',id:'S1'}]);
 const result=await run(packet());assert.equal(result.status,'issues_found');assert.equal(result.findings[0].artifacts[0].artifactId,'S1');assert.equal(result.findings[0].sources[0].sourceId,'A1');assert.equal(result.findings[0].artifactBindings[0].sha256,snapshot.artifacts[0].sha256);assert.ok(verifyContentReviewReceipt(result));
 const swapped=buildContentReviewInput({...snapshot,artifacts:[...snapshot.artifacts].reverse(),sources:[...snapshot.sources].reverse()});assert.deepEqual(swapped.referenceTable,i.referenceTable);
});

test('unknown, mistyped, real long IDs and wrong-kind refs fail exact mapping without fuzzy recovery',async()=>{
 for(const artifactRef of ['A01','A99','S1','output:0123456789abcdef']){const result=await run(packet([{...issue,artifacts:[{artifactRef,quote:'审批无需复核。'}]}]));assert.equal(result.status,'unverified');assert.equal(result.findings.length,0);}
 const wrong=await run({...packet(),coverage:{...packet().coverage,sourceRefs:['A1']}});assert.equal(wrong.status,'unverified');assert.equal(wrong.coverage,undefined);
});

test('canonical table recomputation rejects tampering even after caller recomputes input hash; old input cannot use current wire',async()=>{
 const current=input(),changed=structuredClone(current);changed.referenceTable[0].id='S1';const {inputHash:_,prompt:__,promptHash:___,...base}=changed;changed.inputHash=contentReviewTextHash(JSON.stringify(base));let calls=0;
 await assert.rejects(reviewContent({input:changed,reviewer,review:async()=>{calls++;return{raw:packet(),stopReason:'stop'};}}),/INPUT_CHANGED/);assert.equal(calls,0);
 const old=structuredClone(current) as any;delete old.wireVersion;delete old.referenceTable;await assert.rejects(reviewContent({input:old,reviewer,review:async()=>{calls++;return{raw:packet(),stopReason:'stop'};}}),/SCHEMA_CHANGED/);assert.equal(calls,0);
});

test('compact output hard limits are strict and never quietly truncate or retry',async()=>{
 for(const raw of [packet([issue,issue,issue,issue]),packet([{...issue,explanation:'x'.repeat(161)}]),packet([{...issue,suggestion:'x'.repeat(101)}]),packet([{...issue,artifacts:[{artifactRef:'A2',quote:'x'.repeat(161)}]}]),packet([{...issue,requests:[{requestRef:'R1',quote:snapshot.requests[0].text}],sources:[...issue.sources,{sourceRef:'S2',quote:'另一个冻结来源。'}],artifacts:[...issue.artifacts,{artifactRef:'A1',quote:'审批全部允许。'}]}]),{...packet(),coverage:{...packet().coverage,limitations:['a','b','c','d']}},{...packet(),coverage:{...packet().coverage,limitations:['x'.repeat(121)]}}]){const result=await run(raw);assert.equal(result.status,'unverified');assert.equal(result.findings.length,0);}
 const cross=await run(packet([{...issue,category:'cross_artifact_consistency',sources:[],requests:[{requestRef:'R1',quote:snapshot.requests[0].text}],artifacts:[{artifactRef:'A1',quote:'审批全部允许。'},{artifactRef:'A2',quote:'审批无需复核。'}]}]));assert.equal(cross.findings[0].repairEligible,true);assert.equal(cross.findings[0].artifactBindings.length,2);
});

test('long real identities stay host-side, partial prompt labels are short, version changes stale existing receipt',async()=>{
 const longId='output:'+ 'e'.repeat(180),s={...snapshot,artifacts:[doc(longId,'真实成果。'.repeat(4000))]},i=buildContentReviewInput(s,{promptCharacters:12000});assert.ok(i.artifactContexts[0].coverage==='partial');assert.equal(i.prompt.includes(longId),false);assert.equal(i.prompt.includes(i.artifactContexts[0].sha256),false);assert.ok(i.prompt.includes('A1 只提供了部分上下文'));assert.ok(i.coverageLimits.some(limit=>limit.includes(longId)));assert.equal(i.prompt.includes('"findings":[]'),false);
 const receipt=await run(packet());const updated=buildContentReviewInput({...snapshot,sources:[doc('A1','审批允许复核。'),snapshot.sources[1]]});assert.equal(refreshContentReviewReceipt(receipt,updated).versionState,'stale');
});

test('safe response diagnostics contain only fixed counts and lengths; legacy rich receipt remains valid',async()=>{
 const diagnostics=contentReviewResponseDiagnostics([{type:'thinking',thinking:'PRIVATE_REASONING_BODY',signature:'PRIVATE_SIGNATURE'},{type:'text',text:'ok'},{type:'PRIVATE_DYNAMIC_TYPE',body:'PRIVATE_RESPONSE'},{type:'toolCall',arguments:{api_key:'PRIVATE_KEY'}}]);assert.deepEqual(diagnostics.blockCounts,{text:1,thinking:1,image:0,toolCall:1,unknown:1});assert.equal(diagnostics.thinkingCharacters,22);assert.equal(diagnostics.textCharacters,2);assert.equal(diagnostics.reasoningTokenSource,'pi_normalized_actual_unknown');assert.equal(JSON.stringify(diagnostics).includes('PRIVATE_'),false);
 const receipt=await run(packet(),{responseDiagnostics:diagnostics});assert.equal(receipt.status,'issues_found');assert.deepEqual(receipt.responseDiagnostics,diagnostics);assert.equal(receipt.diagnostics.length,0);assert.equal(JSON.stringify(receipt).includes('PRIVATE_'),false);assert.ok(verifyContentReviewReceipt(receipt));
 const legacy=structuredClone(receipt);delete legacy.responseDiagnostics;const {resultHash:_,...body}=legacy;legacy.resultHash=contentReviewTextHash(JSON.stringify(body));assert.ok(contentReviewReceiptSchema.safeParse(legacy).success);assert.ok(verifyContentReviewReceipt(legacy));
 const forged=await run({...packet(),responseDiagnostics:diagnostics});assert.equal(forged.status,'unverified');assert.equal(forged.responseDiagnostics,undefined);
 const invalid=await run(packet(),{responseDiagnostics:{...diagnostics,thinkingBody:'PRIVATE_REASONING_BODY'}});assert.equal(invalid.responseDiagnostics,undefined);assert.equal(JSON.stringify(invalid).includes('PRIVATE_'),false);
});
