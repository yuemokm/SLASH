import test from 'node:test';
import assert from 'node:assert/strict';
import {contentReviewWireFindingSchema,contentReviewWireCoverageSchema} from '../shared/content-review.js';
import {buildContentReviewInput,reviewContent,verifyContentReviewReceipt,contentReviewTextHash} from '../main/content-review.js';
import {REVIEW_OUTPUT_JSON_SCHEMA,REVIEW_OUTPUT_SCHEMA_TEXT,REVIEW_OUTPUT_SCHEMA_HASH,safeSchemaDiagnostics} from '../main/content-review-protocol.js';
import type {ContentReviewInput} from '../shared/content-review.js';

const document=(id:string,text:string)=>({id,text,sha256:contentReviewTextHash(text)});
const snapshot={requests:[{id:'r',text:'对照原资料检查规则及待确认事项。'}],artifacts:[document('a','审批无需复核。')],sources:[document('s','审批必须复核。')]};
const reviewer={provider:'fixture-only',modelId:'no-network',protocol:'injected-domain-callback'};
const directions=['fact_inference','scope_expansion','contradiction','cross_artifact_consistency','field_semantics','request_coverage'];
const coverage={artifactRefs:['A1'],sourceRefs:['S1'],requestRefs:['R1'],directions,limitations:[]};
const finding={category:'contradiction',severity:'blocking',confidence:'high',scope:'uncertain',repairDisposition:'record_only',explanation:'成果与已引用资料的复核要求不同。',artifacts:[{artifactRef:'A1',quote:'审批无需复核。'}],sources:[{sourceRef:'S1',quote:'审批必须复核。'}],requests:[]};
const run=async(raw:unknown,stopReason='stop')=>{let calls=0;const receipt=await reviewContent({input:buildContentReviewInput(snapshot),reviewer,review:async()=>{calls++;return{raw,stopReason};}});assert.equal(calls,1,'invalid output never retries');assert.ok(verifyContentReviewReceipt(receipt));return receipt;};

test('full prompt schema derives actual finding/coverage validators with required arrays/enums/limits/strict objects',()=>{
 const schema=REVIEW_OUTPUT_JSON_SCHEMA as any;assert.equal(schema.additionalProperties,false);assert.deepEqual(schema.required,['findings','coverage']);assert.equal(schema.properties.findings.maxItems,3);const item=schema.properties.findings.items;assert.equal(item.additionalProperties,false);assert.ok(item.required.includes('sources'));assert.ok(item.required.includes('requests'));assert.ok(item.properties.category.enum.includes('field_semantics'));assert.equal(item.properties.artifacts.minItems,1);assert.equal(item.properties.artifacts.maxItems,2);assert.equal(item.properties.artifacts.items.properties.quote.maxLength,160);assert.equal(schema.properties.coverage.additionalProperties,false);assert.ok(schema.properties.coverage.required.includes('limitations'));assert.equal(schema.properties.coverage.properties.sourceRefs.maxItems,100);assert.equal(contentReviewWireFindingSchema.safeParse(finding).success,true);assert.equal(contentReviewWireCoverageSchema.safeParse(coverage).success,true);assert.equal(contentReviewWireCoverageSchema.safeParse(null).success,false);
});

test('schema is included in existing prompt budget and input/prompt hash, with no answer example or elevated tiny budget',()=>{
 const input=buildContentReviewInput(snapshot);assert.ok(input.prompt.includes(REVIEW_OUTPUT_SCHEMA_TEXT));assert.equal((input as unknown as {outputSchemaHash:string}).outputSchemaHash,REVIEW_OUTPUT_SCHEMA_HASH);const {inputHash,prompt,promptHash,...material}=input;assert.equal(inputHash,contentReviewTextHash(JSON.stringify(material)));assert.equal(promptHash,contentReviewTextHash(prompt));assert.ok(input.prompt.length<=input.promptCharacterLimit);assert.equal(input.prompt.includes('"findings":[]'),false);assert.throws(()=>buildContentReviewInput(snapshot,{promptCharacters:1000}),/PROMPT_LIMIT/);const large=buildContentReviewInput({...snapshot,requests:[{id:'r',text:'真实长要求。'.repeat(10000)}]},{promptCharacters:12000});assert.ok(large.prompt.length<=12000);assert.equal(large.requestContexts[0].coverage,'partial');
});

test('syntax, root, findings array and coverage shape failures remain distinct without raw response values',async()=>{
 const syntax=await run('{bad syntax PRIVATE_SENTINEL');assert.match(syntax.diagnostics.join('\n'),/CONTENT_REVIEW_JSON_SYNTAX/);assert.equal(syntax.rawResultHash,undefined);assert.equal(JSON.stringify(syntax).includes('PRIVATE_SENTINEL'),false);
 for(const [raw,area] of [[{findings:[],coverage:null},'coverage'],[{findings:null,coverage},'findings'],[{findings:[],coverage,PRIVATE_UNKNOWN_KEY:'PRIVATE_VALUE'},'root']] as const){const receipt=await run(JSON.stringify(raw));assert.equal(receipt.status,'unverified');assert.match(receipt.diagnostics.join('\n'),new RegExp('CONTENT_REVIEW_SCHEMA '+area));assert.ok(receipt.rawResultHash);assert.equal(JSON.stringify(receipt).includes('PRIVATE_UNKNOWN_KEY'),false);assert.equal(JSON.stringify(receipt).includes('PRIVATE_VALUE'),false);assert.equal(receipt.findings.length,0);}
});

test('finding diagnostics only expose host-owned fields and known codes; unknown path/keys/values are masked',async()=>{
 for(const bad of [{...finding,sources:null},{...finding,category:'PRIVATE_BAD_ENUM'},{...finding,artifacts:[{artifactRef:'A1',quote:'审批无需复核。',PRIVATE_UNKNOWN_KEY:'PRIVATE_VALUE'}]}]){const receipt=await run(JSON.stringify({findings:[bad],coverage}));assert.equal(receipt.status,'unverified');assert.equal(receipt.invalidFindings.length,1);assert.match(receipt.invalidFindings[0].reason,/CONTENT_REVIEW_SCHEMA finding/);assert.equal(receipt.findings.length,0);for(const secret of ['PRIVATE_BAD_ENUM','PRIVATE_UNKNOWN_KEY','PRIVATE_VALUE'])assert.equal(JSON.stringify(receipt).includes(secret),false);}
 const safe=safeSchemaDiagnostics('root',[{code:'unrecognized_keys',path:['coverage','PRIVATE_DYNAMIC_KEY']},{code:'PRIVATE_CODE',path:['PRIVATE_DYNAMIC_KEY']},{code:'invalid_type',path:['coverage','sourceRefs',0]}]);assert.match(safe[0],/coverage unrecognized_keys \$\.coverage\.\[unknown\]/);assert.equal(safe.join('').includes('PRIVATE_'),false);assert.match(safe[1],/schema_error/);assert.match(safe[2],/sourceRefs\[0\]/);
});

test('strict shape success still needs host actual quote binding; null arrays/extra fields/refinements cannot pass',async()=>{
 const valid=await run(JSON.stringify({findings:[finding],coverage}));assert.equal(valid.status,'issues_found');assert.equal(valid.findings[0].validation,'bound');assert.equal(valid.humanConfirmed,false);
 for(const bad of [{...finding,sources:[],requests:[]},{...finding,sources:[{sourceRef:'S1',quote:'不存在的来源原句'}]},{...finding,artifacts:[{artifactRef:'A1',quote:'   '}]}]){const receipt=await run(JSON.stringify({findings:[bad],coverage}));assert.equal(receipt.status,'unverified');assert.equal(receipt.findings.length,0);assert.equal(receipt.invalidFindings.length,1);}
});

test('normal stop remains required and non-stop response never parses even complete JSON; oversized response distinct from syntax',async()=>{
 for(const stopReason of ['length','error','aborted','toolUse']){const receipt=await run(JSON.stringify({findings:[finding],coverage}),stopReason);assert.equal(receipt.status,'unverified');assert.equal(receipt.findings.length,0);assert.equal(receipt.rawResultHash,undefined);assert.equal(receipt.diagnostics.some(line=>line.includes('CONTENT_REVIEW_SCHEMA')),false);}
 const huge=await run(' '.repeat(200001));assert.match(huge.diagnostics.join('\n'),/CONTENT_REVIEW_RESPONSE_LIMIT/);assert.equal(huge.diagnostics.some(line=>line.includes('CONTENT_REVIEW_JSON_SYNTAX')),false);
});

test('explicit schema identity rejects old/missing or recomputed wrong-schema input before any review callback',async()=>{
 let calls=0;const current=buildContentReviewInput(snapshot),missing=structuredClone(current) as Partial<ContentReviewInput>,wrong=structuredClone(current);delete missing.outputSchemaHash;wrong.outputSchemaHash='a'.repeat(64);const {inputHash:_,prompt:__,promptHash:___,...base}=wrong;wrong.inputHash=contentReviewTextHash(JSON.stringify(base));
 for(const input of [missing as ContentReviewInput,wrong])await assert.rejects(reviewContent({input,reviewer,review:async()=>{calls++;return{raw:JSON.stringify({findings:[finding],coverage}),stopReason:'stop'};}}),/CONTENT_REVIEW_SCHEMA_CHANGED/);
 assert.equal(calls,0);assert.equal(current.outputSchemaHash,REVIEW_OUTPUT_SCHEMA_HASH);
});
