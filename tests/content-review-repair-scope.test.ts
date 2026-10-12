import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {buildContentReviewInput,contentReviewTextHash,reviewContent,verifyContentReviewReceipt} from '../main/content-review.js';
import {repairableTaskFailures,taskRepairPrompt} from '../main/task-completion.js';
import type {ContentReviewReceipt} from '../shared/content-review.js';
import type {TaskAcceptanceReport} from '../shared/task-acceptance.js';

const document=(id:string,text:string)=>({id,text,sha256:contentReviewTextHash(text)});
const request='只修经度和纬度两行的可编辑规则；网点编码冲突只记录，不修改。';
const input=buildContentReviewInput({requests:[{id:'r',text:request}],artifacts:[document('prd','经度可编辑。网点编码不展示。')],sources:[document('fields','经度首次不可编辑。网点编码展示。')]});
const coverage={artifactRefs:['A1'],sourceRefs:['S1'],requestRefs:['R1'],directions:['field_semantics'],limitations:[]};
const finding={category:'field_semantics',severity:'advisory',confidence:'high',scope:'in_scope',repairDisposition:'candidate',explanation:'经度字段与正面规则存在冲突。',artifacts:[{artifactRef:'A1',quote:'经度可编辑。'}],sources:[{sourceRef:'S1',quote:'经度首次不可编辑。'}],requests:[{requestRef:'R1',quote:'只修经度和纬度两行的可编辑规则；'}]};
const review=(issue:unknown)=>reviewContent({input,reviewer:{provider:'fixture',modelId:'no-cloud',protocol:'domain-callback'},review:async()=>({raw:{findings:[issue],coverage},stopReason:'stop'})});
// Only the fields used by candidate selection are needed; no acceptance state is fabricated.
const report=(receipt:ContentReviewReceipt)=>({versionState:'current',results:[],regression:[],contentReview:receipt,targets:[],contractHash:contentReviewTextHash(request)} as unknown as TaskAcceptanceReport);

test('real Astra historical receipt remains hash-valid and unchanged, but both legacy candidates are denied',async()=>{
 const file=new URL('./fixtures/prd-astra-20261010-legacy-content-review.json',import.meta.url),bytes=await fs.readFile(file),receipt=JSON.parse(bytes.toString()) as ContentReviewReceipt;
 assert.equal(contentReviewTextHash(bytes.toString()),'2b33a5fe76394d70723f257f79abbb9fd1f5ad7cedc2317716dc528326ea4dd6');
 assert.ok(verifyContentReviewReceipt(receipt));assert.equal(receipt.completion,'completed');assert.deepEqual(receipt.findings.map(f=>f.repairEligible),[true,true]);
 assert.equal(receipt.findings[1].requestBindings.length,1,'even a verbatim limiting request did not guard the old candidate');
 const before=JSON.stringify(receipt);assert.deepEqual(repairableTaskFailures(report(receipt)),[]);assert.equal(JSON.stringify(receipt),before);assert.deepEqual(await fs.readFile(file),bytes);
});

test('out_of_scope, uncertain and record_only stay bound observations without automatic repair, independent of wording/severity',async()=>{
 for(const scope of ['out_of_scope','uncertain'])for(const severity of ['blocking','advisory']){
  const receipt=await review({...finding,scope,severity,explanation:'可以修复。'});
  assert.equal(receipt.status,'issues_found');assert.equal(receipt.findings[0].validation,'bound');assert.equal(receipt.findings[0].repairEligible,false);assert.deepEqual(repairableTaskFailures(report(receipt)),[]);
 }
 const recordOnly=await review({...finding,repairDisposition:'record_only'});assert.equal(recordOnly.findings[0].repairEligible,false);assert.deepEqual(repairableTaskFailures(report(recordOnly)),[]);
});

test('in_scope positive candidate keeps original request and exact source evidence; explanation keywords cannot disable or grant repair',async()=>{
 const receipt=await review({...finding,explanation:'不要扩修网点编码，只修已请求的经度规则。'});assert.equal(receipt.findings[0].repairEligible,true);
 const failures=repairableTaskFailures(report(receipt));assert.equal(failures.length,1);assert.equal(failures[0].outputId,'prd');assert.equal(receipt.findings[0].repairMode,'align_explicit_evidence');
 const prompt=taskRepairPrompt(report(receipt),1);assert.ok(prompt.includes(finding.requests[0].quote));assert.ok(prompt.includes(finding.sources[0].quote));assert.match(prompt,/不能把否定要求或范围外事项解释为许可/);
});

test('missing wire scope/disposition, unbound request and absent request evidence cannot repair',async()=>{
 for(const field of ['scope','repairDisposition'] as const){const old={...finding} as Record<string,unknown>;delete old[field];const receipt=await review(old);assert.equal(receipt.completion,'invalid');assert.equal(receipt.findings.length,0);assert.deepEqual(repairableTaskFailures(report(receipt)),[]);}
 const noRequest=await review({...finding,requests:[]});assert.equal(noRequest.findings[0].validation,'bound');assert.equal(noRequest.findings[0].repairEligible,false);
 const invented=await review({...finding,requests:[{requestRef:'R1',quote:'请修改所有网点编码展示规则。'}]});assert.equal(invented.completion,'invalid');assert.equal(invented.findings.length,0);
});

test('candidate entry independently denies missing/out/uncertain/record_only even when old repairEligible is true',async()=>{
 const original=await review(finding);
 for(const patch of [{scope:'out_of_scope'},{scope:'uncertain'},{scope:undefined},{repairDisposition:'record_only'},{repairDisposition:undefined},{requestBindings:[]},{completion:'invalid'}]){
  const copy=structuredClone(original) as any;if('completion' in patch)Object.assign(copy,patch);else Object.assign(copy.findings[0],patch);
  const {resultHash:_,...body}=copy;copy.resultHash=contentReviewTextHash(JSON.stringify(body));assert.ok(verifyContentReviewReceipt(copy));assert.equal(copy.findings[0].repairEligible,true);assert.deepEqual(repairableTaskFailures(report(copy)),[]);
 }
 const unsealed=structuredClone(original);unsealed.findings[0].explanation='altered';assert.equal(verifyContentReviewReceipt(unsealed),false);assert.deepEqual(repairableTaskFailures(report(unsealed)),[]);
});

test('mixed receipt retains both findings but repair prompt selects only requested correction',async()=>{
 const outside={...finding,scope:'out_of_scope',repairDisposition:'record_only',severity:'blocking',explanation:'OUTSIDE_CODE_CONFLICT_ONLY_RECORD',artifacts:[{artifactRef:'A1',quote:'网点编码不展示。'}],sources:[{sourceRef:'S1',quote:'网点编码展示。'}],requests:[{requestRef:'R1',quote:'网点编码冲突只记录，不修改。'}]};
 const receipt=await reviewContent({input,reviewer:{provider:'fixture',modelId:'no-cloud',protocol:'domain-callback'},review:async()=>({raw:{findings:[finding,outside],coverage},stopReason:'stop'})});
 assert.equal(receipt.status,'issues_found');assert.equal(receipt.completion,'completed');assert.equal(receipt.findings.length,2);assert.deepEqual(receipt.findings.map(f=>f.repairEligible),[true,false]);
 const failures=repairableTaskFailures(report(receipt));assert.equal(failures.length,1);assert.equal(failures[0].criterionId,'host:content:finding-1');
 const prompt=taskRepairPrompt(report(receipt),1);assert.ok(prompt.includes(finding.explanation));assert.equal(prompt.includes(outside.explanation),false);assert.equal(prompt.includes(outside.sources[0].quote),false);
});

test('wrong model in_scope/candidate with a verbatim negative request remains possible; binding is not independent semantic authorization',async()=>{
 const wrong={...finding,explanation:'MODEL_SCOPE_MISCLASSIFICATION',artifacts:[{artifactRef:'A1',quote:'网点编码不展示。'}],sources:[{sourceRef:'S1',quote:'网点编码展示。'}],requests:[{requestRef:'R1',quote:'网点编码冲突只记录，不修改。'}]};
 const originalRequest=input.snapshot.requests[0].text,receipt=await review(wrong);
 assert.equal(receipt.findings[0].repairEligible,true,'the host does not parse a quoted prohibition as semantic scope');assert.equal(repairableTaskFailures(report(receipt)).length,1);
 const prompt=taskRepairPrompt(report(receipt),1);assert.ok(prompt.includes(wrong.requests[0].quote));assert.equal(input.snapshot.requests[0].text,originalRequest);
 for(const restriction of ['同一Pi会话','原预算和原授权','必须保留原始用户要求','不得保存正式文件','不得请求新网页','不能扩大资料范围','不能把否定要求或范围外事项解释为许可'])assert.ok(prompt.includes(restriction));
 assert.deepEqual(report(receipt).targets,[],'the candidate cannot add an authorized directory or output');
});
