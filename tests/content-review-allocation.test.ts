import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {buildContentReviewInput,contentReviewTextHash as hash,reviewContent,verifyContentReviewReceipt,refreshContentReviewReceipt} from '../main/content-review.js';
import {REVIEW_PROTOCOL_PROMPT} from '../main/content-review-protocol.js';
import type {ContentReviewInput} from '../shared/content-review.js';

// Frozen synthetic input from the pre-expansion allocator: no user material,
// real file paths, run identifiers or credentials; no copy of the old builder.
const old=JSON.parse(await fs.readFile(new URL('./fixtures/content-review-short-old-input.json',import.meta.url),'utf8')) as ContentReviewInput;
const reviewer={provider:'offline-fixture',modelId:'none',protocol:'domain-callback'};
const doc=(id:string,text:string)=>({id,text,sha256:hash(text)});
const contexts=(input:ContentReviewInput)=>[...input.requestContexts,...input.artifactContexts,...input.sourceContexts];
function bodyBudget(input:ContentReviewInput){const count=input.snapshot.requests.length+input.snapshot.artifacts.length+input.snapshot.sources.length;return Math.floor((input.promptCharacterLimit-2500-REVIEW_PROTOCOL_PROMPT.length-count*400-JSON.stringify(input.snapshot.assumptions).length)/2);}
function validate(input:ContentReviewInput){
 assert(input.prompt.length<=input.promptCharacterLimit);
 assert(contexts(input).reduce((sum,part)=>sum+part.includedCharacters,0)<=bodyBudget(input));
 const {inputHash,prompt,promptHash,...base}=input;assert.equal(inputHash,hash(JSON.stringify(base)));assert.equal(promptHash,hash(prompt));
 for(const [kind,parts] of [['request',input.requestContexts],['artifact',input.artifactContexts],['source',input.sourceContexts]] as const){
  const documents=kind==='request'?input.snapshot.requests:kind==='artifact'?input.snapshot.artifacts:input.snapshot.sources;
  for(const part of parts){const document=documents.find(item=>item.id===part.id)!;let end=0;assert(part.excerpts.length<=8);
   for(const excerpt of part.excerpts){assert(excerpt.start>=end);assert.equal(excerpt.text,document.text.slice(excerpt.start,excerpt.end));assert.equal(excerpt.startLine,document.text.slice(0,excerpt.start).split('\n').length);assert.equal(excerpt.endLine,document.text.slice(0,excerpt.end).split('\n').length);end=excerpt.end;}
   assert.equal(part.includedCharacters,part.excerpts.reduce((sum,item)=>sum+item.text.length,0));assert(part.includedCharacters<=(kind==='source'?20000:16000));
   if('readCoverage' in document&&document.readCoverage==='partial')assert.equal(part.coverage,'partial');if(part.coverage==='full')assert.equal(part.includedCharacters,document.text.length);
  }
 }
}
function packet(input:ContentReviewInput,artifactQuote='段落0：规则待核。',sourceQuote='来源明确句。',artifactRef='A1'){
 return {findings:[{category:'contradiction',severity:'blocking',confidence:'high',explanation:'仅验证真实文本绑定，不判定业务正确。',artifacts:[{artifactRef,quote:artifactQuote}],sources:[{sourceRef:'S1',quote:sourceQuote}],requests:[]}],coverage:{artifactRefs:input.referenceTable.filter(item=>item.kind==='artifact').map(item=>item.alias),sourceRefs:input.referenceTable.filter(item=>item.kind==='source').map(item=>item.alias),requestRefs:input.referenceTable.filter(item=>item.kind==='request').map(item=>item.alias),directions:['fact_inference','scope_expansion','contradiction','cross_artifact_consistency','field_semantics','request_coverage'],limitations:[]}};
}
const run=(input:ContentReviewInput,raw:unknown)=>reviewContent({input,reviewer,review:async()=>({raw,stopReason:'stop'})});

test('frozen small synthetic old input still verifies; unused original body budget fills the short artifact',async()=>{
 assert.equal(old.inputHash,'1920f850ab19a618c3ee71383039ef6ecd7b05e08efcef451f792ce4104553a0');validate(old);assert.equal(old.artifactContexts[0].excerpts.length,8);assert.equal(old.artifactContexts[0].coverage,'partial');
 const next=buildContentReviewInput(old.snapshot,{promptCharacters:old.promptCharacterLimit});validate(next);assert.equal(bodyBudget(next),bodyBudget(old));assert.equal(next.artifactContexts[0].coverage,'full');assert.equal(next.artifactContexts[0].includedCharacters,852);assert.notEqual(next.inputHash,old.inputHash);assert.deepEqual(next.snapshot,old.snapshot);assert.deepEqual(next.referenceTable,old.referenceTable);
 for(const previous of contexts(old)){const expanded=contexts(next).find(item=>item.id===previous.id)!;for(const excerpt of previous.excerpts)assert(expanded.excerpts.some(item=>item.start<=excerpt.start&&item.end>=excerpt.end),'all selected old ranges remain present');}
 const receipt=await run(old,packet(old));assert.equal(receipt.status,'issues_found');assert(verifyContentReviewReceipt(receipt));assert.equal(refreshContentReviewReceipt(receipt,old),receipt);assert.equal(refreshContentReviewReceipt(receipt,next).versionState,'stale');
});
test('expanded real excerpt binds its new alias; old omitted range, fabricated quotes and wrong-kind refs remain invalid',async()=>{
 const next=buildContentReviewInput(old.snapshot,{promptCharacters:old.promptCharacterLimit}),newQuote='段落11：规则待核。';assert(!old.artifactContexts[0].excerpts.some(part=>part.text.includes(newQuote)));
 assert.equal((await run(old,packet(old,newQuote))).status,'unverified');const result=await run(next,packet(next,newQuote));assert.equal(result.status,'issues_found');assert.equal(result.findings[0].artifactBindings[0].id,'artifact');assert.equal(result.findings[0].sourceBindings[0].id,'source');assert.equal(result.humanConfirmed,false);
 const binding=result.findings[0].artifactBindings[0];assert.equal(next.snapshot.artifacts[0].text.slice(binding.start,binding.end),newQuote);
 for(const raw of [packet(next,'虚构成果原句'),packet(next,'段落0：规则待核。','虚构来源原句'),packet(next,'段落0：规则待核。','来源明确句。','S1')]){const invalid=await run(next,raw);assert.equal(invalid.status,'unverified');assert.equal(invalid.findings.length,0);assert.equal(invalid.invalidFindings.length,1);}
});
test('fully supplied text whose host read coverage is partial cannot be promoted to full',()=>{
 const next=buildContentReviewInput({...old.snapshot,sources:old.snapshot.sources.map(item=>({...item,readCoverage:'partial' as const,originHash:hash('synthetic original version')}))});validate(next);assert.equal(next.sourceContexts[0].includedCharacters,next.snapshot.sources[0].text.length);assert.equal(next.sourceContexts[0].coverage,'partial');assert(next.coverageLimits.some(item=>item.includes('来源 source')));assert.equal(next.snapshot.sources[0].originHash,hash('synthetic original version'));
});
test('long request and huge source retain honest caps and exact UTF16 offsets across budgets',()=>{
 const snapshot={requests:[{id:'request',text:'明确需求与保留条件。\n\n'.repeat(3000)}],artifacts:[doc('artifact','短成果😀。\n\n'.repeat(180))],sources:[doc('source','边界资料😀。\n\n'.repeat(12000))]};
 for(const limit of [12000,20000,40000,60000]){const input=buildContentReviewInput(snapshot,{promptCharacters:limit});validate(input);assert.equal(input.requestContexts[0].coverage,'partial');assert.equal(input.sourceContexts[0].coverage,'partial');assert.equal(buildContentReviewInput(snapshot,{promptCharacters:limit}).inputHash,input.inputHash);}
});
test('actual JSON escaping and tiny budgets still reject overflow rather than raise text capacity',()=>{
 assert.throws(()=>buildContentReviewInput({requests:[{id:'request',text:'核对'}],artifacts:[{...doc('artifact','正文'),path:'\\"'.repeat(15000)}],sources:[]},{promptCharacters:12000}),/CONTENT_REVIEW_PROMPT_LIMIT/);
 assert.throws(()=>buildContentReviewInput(old.snapshot,{promptCharacters:1000}),/CONTENT_REVIEW_PROMPT_LIMIT/);
});
test('changed canonical mapping is rejected even with recomputed material hash; pre-abort makes no model calls',async()=>{
 const next=buildContentReviewInput(old.snapshot,{promptCharacters:old.promptCharacterLimit}),changed=structuredClone(next);changed.referenceTable[0].id='invented';const {inputHash:_,prompt:__,promptHash:___,...material}=changed;changed.inputHash=hash(JSON.stringify(material));let calls=0;
 await assert.rejects(reviewContent({input:changed,reviewer,review:async()=>{calls++;return {raw:packet(changed),stopReason:'stop'};}}),/CONTENT_REVIEW_INPUT_CHANGED/);
 const controller=new AbortController();controller.abort();const cancelled=await reviewContent({input:next,reviewer,signal:controller.signal,review:async()=>{calls++;return {raw:packet(next),stopReason:'stop'};}});assert.equal(cancelled.completion,'cancelled');assert.equal(calls,0);
});
