import test from 'node:test';
import assert from 'node:assert/strict';
import {contentReviewWireFindingSchema,type ContentReviewReceipt} from '../shared/content-review.js';
import {buildContentReviewInput,reviewContent,verifyContentReviewReceipt,contentReviewTextHash} from '../main/content-review.js';
import {REVIEW_OUTPUT_SCHEMA_HASH,REVIEW_PROTOCOL_PROMPT,safeSchemaDiagnostics} from '../main/content-review-protocol.js';

const document=(id:string,text:string)=>({id,text,sha256:contentReviewTextHash(text)});
const snapshot={requests:[{id:'r',text:'检查并修正审批规则。'}],artifacts:[document('a','审批无需复核。')],sources:[document('s','审批必须复核。')]};
const reviewer={provider:'fixture-only',modelId:'no-network',protocol:'injected-domain-callback'};
const finding={category:'contradiction',severity:'blocking',confidence:'high',scope:'in_scope',repairDisposition:'candidate',explanation:'成果与来源的复核要求不同。',artifacts:[{artifactRef:'A1',quote:'审批无需复核。'}],sources:[{sourceRef:'S1',quote:'审批必须复核。'}],requests:[{requestRef:'R1',quote:'检查并修正审批规则。'}]};
const coverage={artifactRefs:['A1'],sourceRefs:['S1'],requestRefs:['R1'],directions:['fact_inference','scope_expansion','contradiction','cross_artifact_consistency','field_semantics','request_coverage'],limitations:[]};
async function review(findings:unknown[]){
 let calls=0;
 const receipt=await reviewContent({input:buildContentReviewInput(snapshot),reviewer,review:async()=>{calls++;return{raw:JSON.stringify({findings,coverage}),stopReason:'stop'};}});
 assert.equal(calls,1);assert(verifyContentReviewReceipt(receipt));return receipt;
}

test('two root refinements retain distinct host rule codes while both remain invalid and do not retry',async()=>{
 for(const [bad,rule] of [
  [{...finding,sources:[],requests:[]},'EVIDENCE_BASIS_REQUIRED'],
  [{...finding,sources:[...finding.sources,...finding.sources],artifacts:[...finding.artifacts,...finding.artifacts]},'QUOTE_TOTAL_LIMIT'],
 ] as const){
  const parsed=contentReviewWireFindingSchema.safeParse(bad);assert(!parsed.success);
  assert.deepEqual(parsed.error.issues[0].path,[]);assert.equal(parsed.error.issues[0].code,'custom');
  const receipt=await review([bad]);assert.equal(receipt.status,'unverified');assert.equal(receipt.completion,'invalid');assert.equal(receipt.findings.length,0);assert.equal(receipt.invalidFindings.length,1);
  assert.equal(receipt.invalidFindings[0].reason,'发现结构无效，不能用于修正。 CONTENT_REVIEW_SCHEMA finding custom $.findings[0] '+rule);
 }
});

test('whitespace quotes name only the schema-owned evidence field and fixed nonblank rule',async()=>{
 for(const area of ['artifacts','sources','requests'] as const){
  const bad={...finding,[area]:finding[area].map(e=>({...e,quote:' \t\n '}))};
  const receipt=await review([bad]);assert.equal(receipt.status,'unverified');assert.equal(receipt.findings.length,0);
  assert.equal(receipt.invalidFindings[0].reason,'发现结构无效，不能用于修正。 CONTENT_REVIEW_SCHEMA finding custom $.findings[0].'+area+'[0].quote NONBLANK_QUOTE');
 }
});

test('diagnostic tags whitelist own data properties and ignore arbitrary params/messages and noncustom tags',()=>{
 let getterCalls=0;
 const paramsWithGetter=Object.defineProperty({},'contentReviewRule',{get(){getterCalls++;return 'NONBLANK_QUOTE';}});
 const issues=[
  {code:'custom',path:[],message:'PRIVATE_MESSAGE',params:{contentReviewRule:'EVIDENCE_BASIS_REQUIRED',PRIVATE_PARAM:'PRIVATE_VALUE'}},
  {code:'custom',path:[],message:'PRIVATE_MESSAGE',params:{contentReviewRule:'PRIVATE_RULE'}},
  {code:'custom',path:[],params:Object.create({contentReviewRule:'NONBLANK_QUOTE'})},
  {code:'custom',path:[],params:paramsWithGetter},
  {code:'custom',path:[],params:['NONBLANK_QUOTE']},
  {code:'invalid_type',path:['sources'],params:{contentReviewRule:'EVIDENCE_BASIS_REQUIRED'}},
  {code:'PRIVATE_CODE',path:['PRIVATE_PATH'],params:{contentReviewRule:'QUOTE_TOTAL_LIMIT'}},
 ];
 const safe=safeSchemaDiagnostics('finding',issues,0);
 assert.equal(safe[0],'CONTENT_REVIEW_SCHEMA finding custom $.findings[0] EVIDENCE_BASIS_REQUIRED');
 for(const line of safe.slice(1,5))assert.equal(line,'CONTENT_REVIEW_SCHEMA finding custom $.findings[0]');
 assert.equal(safe[5],'CONTENT_REVIEW_SCHEMA finding invalid_type $.findings[0].sources');
 assert.equal(safe[6],'CONTENT_REVIEW_SCHEMA finding schema_error $.findings[0].[unknown]');
 assert.equal(getterCalls,0);assert.equal(safe.join('').includes('PRIVATE_'),false);
 assert.equal(safeSchemaDiagnostics('finding',Array.from({length:20},()=>issues[0]),0).length,12);
});

test('v4 frozen schema and prompt identity includes the explicit four-citation capacity',()=>{
 // Frozen v4 values after the explicit capacity change. Historical v3 values
 // remain in the independent legacy fixture; diagnostics do not upgrade them.
 assert.equal(REVIEW_OUTPUT_SCHEMA_HASH,'a67bc48cb46cf8387345ff7be3757280482d81abcde81ee1ab10083b0f3ae95d');
 assert.equal(contentReviewTextHash(REVIEW_PROTOCOL_PROMPT),'a0e3a1073ecba6d2e4b5c7b5df07aacbfb9231386436fcab7c26043e1a26d4c6');
 const input=buildContentReviewInput(snapshot);
 assert.equal(input.inputHash,'f2920eb3d041c303f02a6cff1a0cdcfc9c0f0696e04df644b549a493a396ab08');
 assert.equal(input.promptHash,'c4d586a6df4221950794ab70e41525eef518f3e6caf6d9c68b5e1c044885fa6c');
});

test('a valid candidate is still recorded but cannot be repaired when another finding violates the quote gate',async()=>{
 const valid=await review([finding]);assert.equal(valid.status,'issues_found');assert.equal(valid.findings[0].repairEligible,true);
 const mixed=await review([finding,{...finding,sources:[...finding.sources,...finding.sources],artifacts:[...finding.artifacts,...finding.artifacts]}]);
 assert.equal(mixed.status,'unverified');assert.equal(mixed.completion,'invalid');assert.equal(mixed.findings.length,1);assert.equal(mixed.findings[0].repairEligible,false);
 assert.equal(mixed.invalidFindings.length,1);assert.match(mixed.invalidFindings[0].reason,/QUOTE_TOTAL_LIMIT$/);
});

test('a fixed pre-diagnostic receipt keeps its unclassified historical reason and original result hash',()=>{
 // Historical-format synthetic fixture. Actual three real receipts are
 // replayed separately from their read-only .test-data baseline copies.
 const old:ContentReviewReceipt={schemaVersion:1,id:'legacy-diagnostics-fixture',version:'content-review-v1',inputHash:'a'.repeat(64),promptHash:'b'.repeat(64),reviewer,startedAt:'2026-10-09T00:00:00Z',finishedAt:'2026-10-09T00:00:01Z',durationMs:1000,usage:'unknown',stopReason:'stop',status:'unverified',versionState:'current',completion:'invalid',humanConfirmed:false,findings:[],invalidFindings:[{index:0,reason:'发现结构无效，不能用于修正。 CONTENT_REVIEW_SCHEMA finding custom $.findings[0]'}],coverageLimits:[],diagnostics:[],requests:[{id:'r',sha256:'c'.repeat(64)}],artifacts:[{id:'a',sha256:'d'.repeat(64)}],sources:[],notice:'历史格式夹具，非真实云回执。',resultHash:'99ddcf5242cb9fb3510c6be44069d5b015830cecef15c7511357aa1fdcb7dc3d'};
 const bytes=JSON.stringify(old);assert(verifyContentReviewReceipt(old));assert.equal(JSON.stringify(old),bytes);
 const {resultHash,...body}=old;assert.equal(contentReviewTextHash(JSON.stringify(body)),resultHash);
 assert.equal(old.invalidFindings[0].reason.includes('EVIDENCE_BASIS_REQUIRED'),false);
});
