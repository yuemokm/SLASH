import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const hash=value=>createHash('sha256').update(value).digest('hex');

/** Controlled protocol-only experiment. Do not reseal or overwrite legacy input.
 * Pay precisely the new protocol characters so the existing allocator sees the
 * same body budget. Every actual context/offset must still match byte-for-byte. */
export function migrateFocusedPrdReviewInput(before,build,currentProtocol,{currentWireVersion=3}={}){
 assert([3,4].includes(currentWireVersion),'CURRENT_WIRE_VERSION_INVALID');
 const {inputHash,prompt,promptHash,...material}=before;
 assert.equal(inputHash,hash(JSON.stringify(material)),'LEGACY_INPUT_HASH_CHANGED');
 assert.equal(promptHash,hash(prompt),'LEGACY_PROMPT_HASH_CHANGED');
 assert.equal(before.wireVersion,2,'LEGACY_WIRE_VERSION_CHANGED');
 const start=prompt.indexOf('只返回符合'),end=prompt.lastIndexOf('\n');
 assert(start>=0&&end>start,'LEGACY_PROTOCOL_MISSING');
 const oldProtocol=prompt.slice(start,end),schemaMarker='\n输出JSON Schema：',schemaAt=oldProtocol.indexOf(schemaMarker);
 assert(schemaAt>=0,'LEGACY_SCHEMA_MISSING');
 const oldSchemaText=oldProtocol.slice(schemaAt+schemaMarker.length);
 JSON.parse(oldSchemaText);assert.equal(hash(oldSchemaText),before.outputSchemaHash,'LEGACY_OUTPUT_SCHEMA_CHANGED');
 const protocolCharactersDelta=currentProtocol.length-oldProtocol.length;
 assert(Number.isSafeInteger(protocolCharactersDelta)&&protocolCharactersDelta>0&&protocolCharactersDelta<2000,'PROTOCOL_DELTA_INVALID');
 const input=build(before.snapshot,{promptCharacters:before.promptCharacterLimit+protocolCharactersDelta});
 assert.equal(input.wireVersion,currentWireVersion,'CURRENT_WIRE_VERSION_REQUIRED');
 assert.notEqual(input.outputSchemaHash,before.outputSchemaHash,'CURRENT_SCHEMA_REQUIRED');
 for(const field of ['snapshot','referenceTable','requestContexts','artifactContexts','sourceContexts'])assert.deepEqual(input[field],before[field],'FROZEN_'+field.toUpperCase()+'_CHANGED');
 for(const field of ['requestContexts','artifactContexts','sourceContexts'])for(const context of input[field])for(const excerpt of context.excerpts){
  const documents=field==='requestContexts'?input.snapshot.requests:field==='artifactContexts'?input.snapshot.artifacts:input.snapshot.sources;
  const document=documents.find(d=>d.id===context.id);assert(document,'FROZEN_DOCUMENT_MISSING');
  assert.equal(hash(document.text),context.sha256,'FROZEN_DOCUMENT_HASH_CHANGED');
  assert.equal(document.text.slice(excerpt.start,excerpt.end),excerpt.text,'FROZEN_EXCERPT_CHANGED');
 }
 const trace={legacyWireVersion:before.wireVersion,wireVersion:input.wireVersion,legacyInputHash:before.inputHash,inputHash:input.inputHash,legacyPromptHash:before.promptHash,promptHash:input.promptHash,legacyOutputSchemaHash:before.outputSchemaHash,outputSchemaHash:input.outputSchemaHash,legacyPromptCharacterLimit:before.promptCharacterLimit,promptCharacterLimit:input.promptCharacterLimit,legacyProtocolCharacters:oldProtocol.length,protocolCharacters:currentProtocol.length,protocolCharactersDelta,snapshotHash:hash(JSON.stringify(input.snapshot)),requestContextsHash:hash(JSON.stringify(input.requestContexts)),artifactContextsHash:hash(JSON.stringify(input.artifactContexts)),sourceContextsHash:hash(JSON.stringify(input.sourceContexts)),contextsExactlyMatch:true};
 return{input,trace};
}
