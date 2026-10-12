import test from 'node:test';
import assert from 'node:assert/strict';
import {buildContentReviewInput,contentReviewTextHash as hash,reviewContent} from '../main/content-review.js';
import {REVIEW_PROTOCOL_PROMPT,REVIEW_OUTPUT_JSON_SCHEMA} from '../main/content-review-protocol.js';
import {CONTENT_REVIEW_WIRE_VERSION} from '../shared/content-review.js';
import {migrateFocusedPrdReviewInput} from '../scripts/prd-review-input-identity.mjs';

function legacy(){
 const doc=(id:string,text:string)=>({id,text,sha256:hash(text)});
 const current=buildContentReviewInput({requests:[{id:'r',text:'只修字段甲，其他只记录。'}],artifacts:[doc('a','字段甲独立；字段乙未动。')],sources:[doc('s','甲5与甲6独立，规则乙5:乙7合并。')]},{promptCharacters:12000});
 const schema=structuredClone(REVIEW_OUTPUT_JSON_SCHEMA) as any;
 const item=schema.properties.findings.items;delete item.properties.scope;delete item.properties.repairDisposition;item.required=item.required.filter((name:string)=>!['scope','repairDisposition'].includes(name));
 const protocol='只返回符合历史JSON协议。\n输出JSON Schema：'+JSON.stringify(schema),before=structuredClone(current) as any;
 before.wireVersion=2;before.outputSchemaHash=hash(JSON.stringify(schema));before.prompt=before.prompt.replace(REVIEW_PROTOCOL_PROMPT,protocol);before.promptHash=hash(before.prompt);seal(before);
 return{before,protocol};
}
function seal(input:any){const {inputHash:_,prompt:__,promptHash:___,...material}=input;input.inputHash=hash(JSON.stringify(material));}

test('protocol-only migration pays exactly protocol growth and retains snapshot/context bytes, offsets and identities',()=>{
 const {before,protocol}=legacy(),original=JSON.stringify(before),{input,trace}=migrateFocusedPrdReviewInput(before,buildContentReviewInput,REVIEW_PROTOCOL_PROMPT,{currentWireVersion:CONTENT_REVIEW_WIRE_VERSION});
 assert.equal(trace.protocolCharactersDelta,REVIEW_PROTOCOL_PROMPT.length-protocol.length);assert.equal(input.promptCharacterLimit,before.promptCharacterLimit+trace.protocolCharactersDelta);assert.equal(trace.contextsExactlyMatch,true);
 for(const field of ['snapshot','referenceTable','requestContexts','artifactContexts','sourceContexts'] as const)assert.deepEqual(input[field],before[field]);
 assert.equal(trace.legacyInputHash,before.inputHash);assert.equal(trace.legacyPromptHash,before.promptHash);assert.equal(trace.inputHash,input.inputHash);assert.notEqual(trace.outputSchemaHash,trace.legacyOutputSchemaHash);assert.equal(JSON.stringify(before),original);
});

test('frozen body or legacy prompt/hash changes cannot be hidden by accepting the new protocol',()=>{
 for(const mutate of [(b:any)=>b.snapshot.requests[0].text+='CHANGED',(b:any)=>b.prompt+='CHANGED',(b:any)=>{b.outputSchemaHash='f'.repeat(64);seal(b);}]){
  const {before}=legacy();mutate(before);assert.throws(()=>migrateFocusedPrdReviewInput(before,buildContentReviewInput,REVIEW_PROTOCOL_PROMPT,{currentWireVersion:CONTENT_REVIEW_WIRE_VERSION}),/LEGACY_(INPUT_HASH|PROMPT_HASH|OUTPUT_SCHEMA)_CHANGED/);
 }
});

test('resealed legacy context changes are rejected; unchanged wire/schema is not an allowed migration',()=>{
 const {before}=legacy();before.sourceContexts[0].excerpts[0].text='伪造选段';seal(before);assert.throws(()=>migrateFocusedPrdReviewInput(before,buildContentReviewInput,REVIEW_PROTOCOL_PROMPT,{currentWireVersion:CONTENT_REVIEW_WIRE_VERSION}),/FROZEN_SOURCECONTEXTS_CHANGED/);
 const valid=legacy().before;assert.throws(()=>migrateFocusedPrdReviewInput(valid,()=>({...valid,wireVersion:CONTENT_REVIEW_WIRE_VERSION}),REVIEW_PROTOCOL_PROMPT,{currentWireVersion:CONTENT_REVIEW_WIRE_VERSION}),/CURRENT_SCHEMA_REQUIRED/);
});

test('legacy input remains refused by formal review before callback; migration never invokes a model',async()=>{
 const {before}=legacy();let calls=0;await assert.rejects(reviewContent({input:before,reviewer:{provider:'local',modelId:'none',protocol:'callback'},review:async()=>{calls++;return{raw:{},stopReason:'stop'};}}),/CONTENT_REVIEW_SCHEMA_CHANGED/);assert.equal(calls,0);
 migrateFocusedPrdReviewInput(before,buildContentReviewInput,REVIEW_PROTOCOL_PROMPT,{currentWireVersion:CONTENT_REVIEW_WIRE_VERSION});assert.equal(calls,0);
});

test('historical migration keeps version 3 default; current version 4 requires explicit selection',()=>{
 const {before}=legacy();assert.throws(()=>migrateFocusedPrdReviewInput(before,buildContentReviewInput,REVIEW_PROTOCOL_PROMPT),/CURRENT_WIRE_VERSION_REQUIRED/);
 const historicalBuild=(snapshot:any,options:any)=>{const input:any=structuredClone(buildContentReviewInput(snapshot,options));input.wireVersion=3;seal(input);return input;};
 assert.equal(migrateFocusedPrdReviewInput(before,historicalBuild,REVIEW_PROTOCOL_PROMPT).trace.wireVersion,3);
 assert.throws(()=>migrateFocusedPrdReviewInput(before,historicalBuild,REVIEW_PROTOCOL_PROMPT,{currentWireVersion:4}),/CURRENT_WIRE_VERSION_REQUIRED/);
 assert.throws(()=>migrateFocusedPrdReviewInput(before,historicalBuild,REVIEW_PROTOCOL_PROMPT,{currentWireVersion:98}),/CURRENT_WIRE_VERSION_INVALID/);
});
