import {z} from 'zod';
import {spreadsheetEvidenceRefSchema,spreadsheetFieldEvidenceSchema} from './spreadsheet-field-evidence.js';
export function businessPathKey(value:string){return value.replaceAll('\\','/').split('/').filter(part=>part!==''&&part!=='.').join('/').toLowerCase();}

const id=z.string().trim().min(1).max(200);
const text=z.string().trim().min(1).max(20000);
const relativePath=z.string().trim().min(1).max(32767).refine(value=>!value.replaceAll('\\','/').startsWith('/')&&!/^[A-Za-z]:/.test(value)&&!value.includes('\0')&&!value.replaceAll('\\','/').split('/').includes('..'),'必须是挂载内相对路径');
export const businessLocationSchema=z.object({locator:z.string().trim().min(1).max(2000),startLine:z.number().int().min(1),endLine:z.number().int().min(1),quote:z.string().min(1).max(20000)}).strict().refine(value=>value.endLine>=value.startLine&&value.endLine-value.startLine<500,{message:'定位须为500行以内有效行段'});
export const businessConstraintSchema=z.object({
 id,fieldKey:id,dimension:z.enum(['required','formal_only','create_visible','change_allowed','other']),rawValue:z.string().trim().min(1).max(2000),interpretation:text,stage:z.string().trim().min(1).max(500),status:z.enum(['candidate','unknown']),supersedesId:id.optional(),sourceRefIds:z.array(id).min(1).max(50),sourceEvidence:z.array(businessLocationSchema.safeExtend({sourceRefId:id})).min(1).max(50),spreadsheetEvidenceRefs:z.array(spreadsheetEvidenceRefSchema).min(1).max(4).optional(),
}).strict().superRefine((value,ctx)=>{
 if(new Set(value.sourceRefIds).size!==value.sourceRefIds.length)ctx.addIssue({code:'custom',path:['sourceRefIds'],message:'来源不能重复'});
 for(const source of value.sourceEvidence)if(!value.sourceRefIds.includes(source.sourceRefId))ctx.addIssue({code:'custom',path:['sourceEvidence'],message:'原文必须引用约束来源'});
 for(const ref of value.spreadsheetEvidenceRefs??[])if(!value.sourceRefIds.includes(ref.sourceRefId))ctx.addIssue({code:'custom',path:['spreadsheetEvidenceRefs'],message:'字段证据必须属于约束来源'});
 if(new Set((value.spreadsheetEvidenceRefs??[]).map(ref=>ref.evidenceId)).size!==(value.spreadsheetEvidenceRefs??[]).length)ctx.addIssue({code:'custom',path:['spreadsheetEvidenceRefs'],message:'字段证据不能重复'});
 for(const source of value.sourceRefIds)if(!value.sourceEvidence.some(item=>item.sourceRefId===source))ctx.addIssue({code:'custom',path:['sourceEvidence'],message:'每个来源必须有原文定位'});
});
// Keep source snapshots inside the candidate so later evidence updates cannot
// silently refresh the meaning or hash of an earlier rule observation.
export const businessSourceSnapshotSchema=z.object({id,mountId:id,relativePath,contentHash:z.string().regex(/^[a-f0-9]{64}$/i),readAt:z.string().datetime({offset:true}),locator:z.string().optional()}).strict();
export const recordedBusinessConstraintSchema=businessConstraintSchema.safeExtend({sourceSnapshots:z.array(businessSourceSnapshotSchema).min(1).max(50),recordedAt:z.string().datetime({offset:true}),fieldEvidence:z.array(spreadsheetFieldEvidenceSchema).min(1).max(4).optional()}).superRefine((value,ctx)=>{
 const refs=value.spreadsheetEvidenceRefs??[],fields=value.fieldEvidence??[];
 if(refs.length!==fields.length||refs.some((ref,index)=>ref.evidenceId!==fields[index]?.evidenceId))ctx.addIssue({code:'custom',path:['fieldEvidence'],message:'已记录字段证据须与宿主引用逐项匹配'});
});
export const businessBindingInputSchema=businessLocationSchema.safeExtend({constraintId:id,mountId:id,path:relativePath,artifactId:id.optional()});
export const businessImplementationRefSchema=businessBindingInputSchema.safeExtend({id,contentHash:z.string().regex(/^[a-f0-9]{64}$/i),createdAt:z.string().datetime({offset:true}),sourceConversationId:id});
export const recordBusinessConstraintsInputSchema=z.object({requirementId:id,constraints:z.array(businessConstraintSchema).min(1).max(100),expectedRevision:z.number().int().nonnegative().optional()}).strict().refine(value=>JSON.stringify(value).length<=128000,{message:'单次规则输入最多128000字符'});
export const bindBusinessImplementationInputSchema=z.object({requirementId:id,bindings:z.array(businessBindingInputSchema).min(1).max(100),expectedRevision:z.number().int().nonnegative().optional()}).strict().refine(value=>JSON.stringify(value).length<=128000,{message:'单次落实输入最多128000字符'});
export const businessRuleCheckInputSchema=z.object({requirementId:id.optional(),conversationId:id.optional(),artifactId:id.optional(),mountId:id.optional(),path:relativePath.optional(),offset:z.number().int().nonnegative().optional(),limit:z.number().int().min(1).max(100).optional()}).strict().refine(value=>Boolean(value.mountId)===Boolean(value.path),{message:'mountId和path必须同时提供'});
export type BusinessConstraint=z.infer<typeof recordedBusinessConstraintSchema>;
export type BusinessImplementationRef=z.infer<typeof businessImplementationRefSchema>;
export type RecordBusinessConstraintsInput=z.infer<typeof recordBusinessConstraintsInputSchema>;
export type BindBusinessImplementationInput=z.infer<typeof bindBusinessImplementationInputSchema>;
export type BusinessRuleCheckInput=z.infer<typeof businessRuleCheckInputSchema>;
export type BusinessEvidenceStatus='current'|'stale'|'unlocated'|'unmapped'|'unavailable';
export type BusinessProvenanceStageStatus='current'|'changed'|'unavailable'|'unverified'|'not_applied'|'limit_exceeded';
export type BusinessProvenanceStage={status:BusinessProvenanceStageStatus;reason:string;mountId?:string;path?:string;expectedHash?:string;actualHash?:string};
export type BusinessSourceProvenance={kind:'processing_chain';receiptId:string;operation:'extract_text'|'script';status:'current'|'stale'|'unavailable'|'unverified';stages:{original:BusinessProvenanceStage;copy:BusinessProvenanceStage;output:BusinessProvenanceStage};notice:string};
export type BusinessSourceCheck={sourceRefId:string;locator:string;status:BusinessEvidenceStatus;reason:string;expectedHash?:string;actualHash?:string;provenance?:BusinessSourceProvenance;spreadsheetStatus?:'current'|'stale'|'unavailable'};
export type BusinessImplementationCheck={ref:BusinessImplementationRef;status:BusinessEvidenceStatus;reason:string;actualHash?:string};
export type BusinessRuleCheckItem={requirementId:string;requirementTitle:string;constraint:BusinessConstraint;sourceChecks:BusinessSourceCheck[];implementations:BusinessImplementationCheck[];status:BusinessEvidenceStatus;excerptsTruncated?:boolean};
export type BusinessRuleCheckView={workspaceId:string;revision:number;checkedAt:string;notice:string;items:BusinessRuleCheckItem[];counts:Record<BusinessEvidenceStatus,number>;offset:number;total:number;truncated:boolean;nextOffset?:number};
