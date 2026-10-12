import {z} from 'zod';
import {isPrototypeSnapshotPath,PROTOTYPE_ACCEPTANCE_LIMITS} from './prototype-acceptance.js';

export const PROTOTYPE_STATIC_DELIVERY_VERSION='prototype-static-delivery-v1';
export const PROTOTYPE_STATIC_PAYLOAD_LIMIT=100_000;
const id=z.string().min(1).max(200),hash=z.string().regex(/^[a-f0-9]{64}$/);
/** Exact snapshot paths, never an OS absolute path or a normalized alias. */
export const prototypeStaticPathSchema=z.string().min(1).max(4096).refine(value=>{
 if(value!==value.normalize('NFC')||value.includes('\\')||/[\x00-\x1f<>:"|?*#]/.test(value)||value.startsWith('/'))return false;
 return value.split('/').every(part=>part&&part!=='.'&&part!=='..'&&!/[. ]$/.test(part)&&! /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))&&isPrototypeSnapshotPath(value);
},'Only exact canonical web snapshot paths are supported');
export const prototypeStaticFileSchema=z.object({path:prototypeStaticPathSchema,bytes:z.number().int().nonnegative().max(PROTOTYPE_ACCEPTANCE_LIMITS.bytes),sha256:hash}).strict();
export const prototypeStaticManifestSchema=z.object({version:z.literal(PROTOTYPE_STATIC_DELIVERY_VERSION),deliveryKind:z.literal('prototype_static_project'),boundary:z.literal('entry_parent_web_assets'),buildProof:z.literal('native_static_snapshot'),entryPath:prototypeStaticPathSchema,entryHash:hash,files:z.array(prototypeStaticFileSchema).min(1).max(PROTOTYPE_ACCEPTANCE_LIMITS.files),manifestHash:hash}).strict().superRefine((value,ctx)=>{
 const keys=value.files.map(file=>file.path.toLowerCase());
 if(new Set(keys).size!==keys.length)ctx.addIssue({code:'custom',message:'Snapshot paths must be unique, including case'});
 if(value.files.reduce((sum,file)=>sum+file.bytes,0)>PROTOTYPE_ACCEPTANCE_LIMITS.bytes)ctx.addIssue({code:'custom',message:'Snapshot byte limit exceeded'});
 if(!/\.html?$/i.test(value.entryPath)||!value.files.some(file=>file.path===value.entryPath&&file.sha256===value.entryHash))ctx.addIssue({code:'custom',message:'Entry must bind an actual HTML snapshot file'});
});
export type PrototypeStaticManifest=z.infer<typeof prototypeStaticManifestSchema>;
/** Model supplies location and a registered codec ID, never proof or hashes. */
export const mcpPrototypeProjectLocatorSchema=z.object({mountId:id,path:prototypeStaticPathSchema.refine(value=>/\.html?$/i.test(value),'Project locator must name an HTML entry'),changeId:id.optional(),adapterId:id}).strict();
export type McpPrototypeProjectLocator=z.infer<typeof mcpPrototypeProjectLocatorSchema>;
export const mcpPrototypeProjectBindingSchema=z.object({locator:mcpPrototypeProjectLocatorSchema,runId:id,outputId:id,reportId:id,contractHash:hash,versionHash:hash,taskBindingHash:hash,argsHash:hash,connectionHash:hash,toolSchemaHash:hash,adapterVersion:id,manifest:prototypeStaticManifestSchema}).strict();
export type McpPrototypeProjectBinding=z.infer<typeof mcpPrototypeProjectBindingSchema>;

/** This fixture codec describes one exact advertised tool schema. It is not a
 * platform publishing protocol and cannot be selected by a production registry. */
export const prototypeFixtureFileListSchema=z.object({entryPath:prototypeStaticPathSchema,files:z.array(z.object({path:prototypeStaticPathSchema,encoding:z.enum(['utf8','base64']),content:z.string().max(50_000)}).strict()).min(1).max(PROTOTYPE_ACCEPTANCE_LIMITS.files)}).strict();
export type PrototypeFixtureFileList=z.infer<typeof prototypeFixtureFileListSchema>;
