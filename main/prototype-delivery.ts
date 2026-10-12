import {PRIVATE_NETLIFY_ADAPTER} from '../shared/netlify-static-private.js';
import {staticPhaseArgumentsSchema} from '../shared/prototype-publish-operation.js';
import {createHash} from 'node:crypto';
import {z} from 'zod';
import {prototypeStaticManifestSchema,prototypeStaticPathSchema,prototypeFixtureFileListSchema,PROTOTYPE_STATIC_DELIVERY_VERSION,PROTOTYPE_STATIC_PAYLOAD_LIMIT,type PrototypeStaticManifest,type PrototypeFixtureFileList} from '../shared/prototype-delivery.js';

type Snapshot=ReadonlyMap<string,{bytes:Buffer;hash:string}>;
const hash=(value:Buffer|string)=>createHash('sha256').update(value).digest('hex');
const compare=(a:string,b:string)=>a<b?-1:a>b?1:0;
export function capturePrototypeStaticManifest(entryPath:string,snapshot:Snapshot):PrototypeStaticManifest{
 prototypeStaticPathSchema.parse(entryPath);
 const files=[...snapshot].map(([path,file])=>{
  prototypeStaticPathSchema.parse(path);
  if(!Buffer.isBuffer(file.bytes)||hash(file.bytes)!==file.hash)throw Error('PROTOTYPE_SNAPSHOT_BYTES_CHANGED');
  return{path,bytes:file.bytes.length,sha256:file.hash};
 }).sort((a,b)=>compare(a.path,b.path));
 const entry=files.find(file=>file.path===entryPath);if(!entry)throw Error('PROTOTYPE_ENTRY_MISSING');
 const body={version:PROTOTYPE_STATIC_DELIVERY_VERSION,deliveryKind:'prototype_static_project' as const,boundary:'entry_parent_web_assets' as const,buildProof:'native_static_snapshot' as const,entryPath,entryHash:entry.sha256,files};
 return prototypeStaticManifestSchema.parse({...body,manifestHash:hash(JSON.stringify(body))});
}
export function assertPrototypeStaticManifest(entryPath:string,snapshot:Snapshot,expected:PrototypeStaticManifest){
 const manifest=prototypeStaticManifestSchema.parse(expected),actual=capturePrototypeStaticManifest(entryPath,snapshot);
 if(JSON.stringify(actual)!==JSON.stringify(manifest))throw Error('PROTOTYPE_PROJECT_VERSION_CHANGED');
}
export function immutablePrototypeStaticBytes(entryPath:string,snapshot:Snapshot){
 const manifest=capturePrototypeStaticManifest(entryPath,snapshot);
 return{manifest,snapshot:new Map([...snapshot].map(([path,file])=>[path,{bytes:Buffer.from(file.bytes),hash:file.hash}]))};
}

export type PrototypePublishingCodec={id:string;version:string;toolName:string;availability:'production'|'fixture_only';toolSchemaHash:string;assertPayload:(args:Record<string,unknown>,manifest:PrototypeStaticManifest,snapshot:Snapshot)=>void};
/** Production remains unavailable until a provider codec is implemented against
 * its actual public input schema and separately verified. */
export const productionPrototypePublishingCodecs:readonly PrototypePublishingCodec[]=Object.freeze([{id:PRIVATE_NETLIFY_ADAPTER,version:'netlify-private-stdio-v1',toolName:'static_create',availability:'production' as const,toolSchemaHash:prototypeToolSchemaHash(z.toJSONSchema(staticPhaseArgumentsSchema,{target:'draft-7'})),assertPayload:(args,manifest,snapshot)=>{staticPhaseArgumentsSchema.parse(args);assertPrototypeStaticManifest(manifest.entryPath,snapshot,manifest);}}]);
export function requirePrototypePublishingCodec(id:string,codecs:readonly PrototypePublishingCodec[]=productionPrototypePublishingCodecs,allowFixtures=false){
 const matches=codecs.filter(codec=>codec.id===id);
 if(matches.length!==1||matches[0].availability==='fixture_only'&&!allowFixtures)throw Error('PROTOTYPE_PUBLISH_ADAPTER_UNAVAILABLE');
 return matches[0];
}
/** SDK decoding may reorder object keys; schema identity keeps values and array order exact. */
export function prototypeToolSchemaHash(schema:unknown){
 const canonical=(value:unknown):unknown=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).sort(([a],[b])=>compare(a,b)).map(([key,item])=>[key,canonical(item)])):value;
 return hash(JSON.stringify(canonical(schema)));
}
export const PROTOTYPE_FIXTURE_TOOL_SCHEMA=z.toJSONSchema(prototypeFixtureFileListSchema,{target:'draft-7'});
export const PROTOTYPE_FIXTURE_TOOL_SCHEMA_HASH=prototypeToolSchemaHash(PROTOTYPE_FIXTURE_TOOL_SCHEMA);
export function createFixturePrototypePublishingCodec(advertisedSchema:unknown):PrototypePublishingCodec{
 if(prototypeToolSchemaHash(advertisedSchema)!==PROTOTYPE_FIXTURE_TOOL_SCHEMA_HASH)throw Error('PROTOTYPE_PUBLISH_TOOL_SCHEMA_CHANGED');
 return Object.freeze({id:'fixture_static_file_list_v1',version:'fixture-v1',toolName:'fixture.publishFiles',availability:'fixture_only' as const,toolSchemaHash:PROTOTYPE_FIXTURE_TOOL_SCHEMA_HASH,assertPayload:assertPrototypeFixturePayload});
}
function payloadBound(args:Record<string,unknown>){
 let serialized:string;try{serialized=JSON.stringify(args);}catch{throw Error('PROTOTYPE_PUBLISH_PAYLOAD_INVALID');}
 // Existing MCP transport uses a JSON character cap; also bind actual bytes.
 if(serialized.length>PROTOTYPE_STATIC_PAYLOAD_LIMIT||Buffer.byteLength(serialized,'utf8')>PROTOTYPE_STATIC_PAYLOAD_LIMIT)throw Error('PROTOTYPE_PUBLISH_PAYLOAD_LIMIT');
 return prototypeFixtureFileListSchema.parse(args);
}
export function assertPrototypeFixturePayload(args:Record<string,unknown>,manifest:PrototypeStaticManifest,snapshot:Snapshot){
 const payload=payloadBound(args);assertPrototypeStaticManifest(payload.entryPath,snapshot,manifest);
 if(payload.files.length!==manifest.files.length||new Set(payload.files.map(file=>file.path.toLowerCase())).size!==payload.files.length)throw Error('PROTOTYPE_PUBLISH_PAYLOAD_MISMATCH');
 for(const file of payload.files){const expected=snapshot.get(file.path);if(!expected)throw Error('PROTOTYPE_PUBLISH_PAYLOAD_MISMATCH');
  let bytes:Buffer;
  if(file.encoding==='base64'){bytes=Buffer.from(file.content,'base64');if(bytes.toString('base64')!==file.content)throw Error('PROTOTYPE_PUBLISH_ENCODING_INVALID');}
  else{bytes=Buffer.from(file.content,'utf8');if(bytes.toString('utf8')!==file.content)throw Error('PROTOTYPE_PUBLISH_ENCODING_INVALID');}
  if(!bytes.equals(expected.bytes)||hash(bytes)!==expected.hash)throw Error('PROTOTYPE_PUBLISH_PAYLOAD_MISMATCH');
 }
}
export function prototypeFixturePayload(entryPath:string,snapshot:Snapshot):PrototypeFixtureFileList{
 capturePrototypeStaticManifest(entryPath,snapshot);
 const files=[...snapshot].sort(([a],[b])=>compare(a,b)).map(([path,file])=>{const text=file.bytes.toString('utf8'),utf8=Buffer.from(text,'utf8').equals(file.bytes);return{path,encoding:utf8?'utf8' as const:'base64' as const,content:utf8?text:file.bytes.toString('base64')};});
 const payload={entryPath,files};payloadBound(payload);return payload;
}
