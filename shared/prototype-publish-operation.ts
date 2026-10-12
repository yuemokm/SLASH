import {z} from 'zod';
import {prototypeStaticManifestSchema,prototypeStaticPathSchema} from './prototype-delivery.js';

const id=z.string().regex(/^[A-Za-z0-9_-]{1,100}$/),hash=z.string().regex(/^[a-f0-9]{64}$/),sha1=z.string().regex(/^[a-f0-9]{40}$/);
export const staticPublishUrlSchema=z.string().min(1).max(2048).refine(value=>{try{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password;}catch{return false;}},'Verified HTTPS deployment URL required');
export const staticPublishConfigurationSchema=z.object({version:z.literal('netlify-static-operation-v1'),siteId:id,draft:z.literal(true),deliveryBindingHash:hash,connectionHash:hash,manifest:prototypeStaticManifestSchema,files:z.array(z.object({path:prototypeStaticPathSchema,sha1,sha256:hash,bytes:z.number().int().nonnegative(),base64:z.string().max(24_000_000)}).strict()).min(1).max(100)}).strict();
export type StaticPublishConfiguration=z.infer<typeof staticPublishConfigurationSchema>;
export const publicationHostIdentitySchema=z.object({proposalId:id,recoveryScopeHash:hash,requestHash:hash,publishBindingHash:hash}).strict();
export type PublicationHostIdentity=z.infer<typeof publicationHostIdentitySchema>;
export const staticPublishRecoveryConfigurationSchema=z.object({version:z.literal('netlify-static-recovery-v1'),siteId:id,draft:z.literal(true),deliveryBindingHash:hash,connectionHash:hash,manifestHash:hash,deployId:id,requestHash:hash,hostIdentity:publicationHostIdentitySchema}).strict();
export type StaticPublishRecoveryConfiguration=z.infer<typeof staticPublishRecoveryConfigurationSchema>;
export const staticPublishReceiptSchema=z.object({version:z.literal('netlify-static-operation-v1'),binding:hash,operationId:id,runId:id,tool:z.literal('host.netlify_static_draft'),siteId:id,manifestHash:hash,connectionHash:hash,draft:z.literal(true),hostIdentity:publicationHostIdentitySchema.optional(),revision:z.number().int().nonnegative(),createClaimedAt:z.string().datetime(),deployId:id.optional(),required:z.array(sha1).max(100).optional(),dispatchedUploads:z.array(sha1).max(100),uploaded:z.array(sha1).max(100),uploadsComplete:z.boolean(),statusReadsStarted:z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),statusReadsConfirmed:z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),lastKnownState:z.string().min(1).max(100).optional(),publishUrl:staticPublishUrlSchema.optional(),readyObservedAt:z.string().datetime().optional(),readyFromCompletedRevision:z.number().int().nonnegative().optional(),diagnostics:z.array(z.object({phase:z.enum(['create','upload','status','cancel']),code:z.enum(['UNCONFIRMED','CANCELLED','INVALID_RESPONSE','IDENTITY_MISMATCH','HTTP_REJECTED']),at:z.string().datetime()}).strict()).max(20)}).strict().superRefine((value,ctx)=>{
 if(value.publishUrl&&!value.readyObservedAt)ctx.addIssue({code:'custom',message:'Link must come from a bound ready observation'});
 for(const items of [value.required,value.dispatchedUploads,value.uploaded])if(items&&new Set(items).size!==items.length)ctx.addIssue({code:'custom',message:'Duplicate stage facts'});
 if((value.required||value.uploaded.length||value.dispatchedUploads.length||value.readyObservedAt)&&!value.deployId)ctx.addIssue({code:'custom',message:'Unbound deploy ID'});
 if(value.dispatchedUploads.some(item=>!value.required?.includes(item))||value.uploaded.some(item=>!value.dispatchedUploads.includes(item)))ctx.addIssue({code:'custom',message:'Unbound upload facts'});
 if(value.uploadsComplete&&(!value.required||value.required.some(item=>!value.uploaded.includes(item))))ctx.addIssue({code:'custom',message:'Incomplete uploads'});
 if(Boolean(value.readyObservedAt)!==(value.readyFromCompletedRevision!==undefined)||value.readyObservedAt&&(!value.uploadsComplete||value.readyFromCompletedRevision!>=value.revision))ctx.addIssue({code:'custom',message:'Ready must follow a completed-upload revision'});
 if(value.statusReadsConfirmed>value.statusReadsStarted)ctx.addIssue({code:'custom',message:'Read acknowledgement needs a dispatch record'});
});
export type StaticPublishReceipt=z.infer<typeof staticPublishReceiptSchema>;
export const staticDeploySchema=z.object({id,site_id:id,draft:z.literal(true),state:z.string().min(1).max(100),required:z.array(sha1).max(100).optional(),deploy_ssl_url:staticPublishUrlSchema.nullable().optional().transform(value=>value??undefined),required_functions:z.array(z.unknown()).max(0).optional(),required_edge_functions:z.array(z.unknown()).max(0).optional()}).strip();
export const staticPhaseArgumentsSchema=z.object({}).strict();
export const staticUploadArgumentsSchema=z.object({sha1}).strict();
export function staticPublishDisposition(value:StaticPublishReceipt){return value.readyObservedAt&&value.uploadsComplete&&value.publishUrl?'ready':value.deployId?'known':'unknown';}
