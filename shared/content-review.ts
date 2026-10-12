import {z} from 'zod';

export const CONTENT_REVIEW_VERSION='content-review-v1';
/** Host-owned refinement diagnostics; never copied from model output. */
export const CONTENT_REVIEW_REFINEMENT_CODES=['NONBLANK_QUOTE','EVIDENCE_BASIS_REQUIRED','QUOTE_TOTAL_LIMIT'] as const;
export const CONTENT_REVIEW_LIMITS={requests:100,artifacts:20,sources:100,assumptions:200,documentCharacters:500000,totalCharacters:2000000,promptCharacters:100000,artifactContextCharacters:16000,sourceContextCharacters:20000,requestCharacters:100000,findings:100,quoteCharacters:4000,resultCharacters:200000} as const;
const id=z.string().min(1).max(200),hash=z.string().regex(/^[a-f0-9]{64}$/),text=z.string().min(1).max(CONTENT_REVIEW_LIMITS.documentCharacters);
const request=z.object({id,text:text.max(CONTENT_REVIEW_LIMITS.requestCharacters)}).strict();
const document=z.object({id,sha256:hash,text,path:z.string().max(32767).optional(),locator:z.string().max(2048).optional(),originHash:hash.optional(),readCoverage:z.enum(['full','partial']).default('full')}).strict();
export const contentReviewSnapshotSchema=z.object({requests:z.array(request).min(1).max(CONTENT_REVIEW_LIMITS.requests),artifacts:z.array(document).min(1).max(CONTENT_REVIEW_LIMITS.artifacts),sources:z.array(document).max(CONTENT_REVIEW_LIMITS.sources),assumptions:z.array(z.object({id,text:text.max(20000)}).strict()).max(CONTENT_REVIEW_LIMITS.assumptions).default([]),coverageLimits:z.array(z.string().max(2000)).max(100).default([])}).strict();
export type ContentReviewSnapshot=z.infer<typeof contentReviewSnapshotSchema>;
export type ContentReviewDirection='fact_inference'|'scope_expansion'|'contradiction'|'cross_artifact_consistency'|'field_semantics'|'request_coverage';
const quote=z.string().min(1).max(CONTENT_REVIEW_LIMITS.quoteCharacters).refine(value=>Boolean(value.trim()),{params:{contentReviewRule:'NONBLANK_QUOTE'}});
const artifactEvidence=z.object({artifactId:id,quote}).strict();
const sourceEvidence=z.object({sourceId:id,quote}).strict();
const requestEvidence=z.object({requestId:id,quote}).strict();
const reviewScope=z.enum(['in_scope','out_of_scope','uncertain']);
const repairDisposition=z.enum(['candidate','record_only']);
/** Reviewer chooses host identities and verbatim quotes. It cannot invent hashes,
 * source versions, execution status, user confirmation, or acceptance verdicts. */
export const contentReviewFindingSchema=z.object({id,category:z.enum(['fact_inference','scope_expansion','contradiction','cross_artifact_consistency','field_semantics','request_coverage']),severity:z.enum(['blocking','advisory']),confidence:z.enum(['high','medium','low']),scope:reviewScope.optional(),repairDisposition:repairDisposition.optional(),explanation:z.string().min(1).max(6000),suggestion:z.string().max(4000).optional(),artifacts:z.array(artifactEvidence).min(1).max(4),sources:z.array(sourceEvidence).max(8),requests:z.array(requestEvidence).max(8)}).strict().refine(value=>value.sources.length+value.requests.length>0,{message:'必须引用真实来源或用户要求',params:{contentReviewRule:'EVIDENCE_BASIS_REQUIRED'}});
export type ContentReviewFinding=z.infer<typeof contentReviewFindingSchema>;
export const contentReviewCoverageSchema=z.object({artifactIds:z.array(id).max(20),sourceIds:z.array(id).max(100),requestIds:z.array(id).max(100),directions:z.array(z.enum(['fact_inference','scope_expansion','contradiction','cross_artifact_consistency','field_semantics','request_coverage'])).max(6),limitations:z.array(z.string().max(2000)).max(50)}).strict();
/** Finding entries are independently validated, preserving invalid/unverified
 * notices instead of silently dropping a fabricated citation and passing. */
export const contentReviewModelOutputSchema=z.object({findings:z.array(z.unknown()).max(CONTENT_REVIEW_LIMITS.findings),coverage:contentReviewCoverageSchema}).strict();
export type ContentReviewModelOutput=z.infer<typeof contentReviewModelOutputSchema>;

export const CONTENT_REVIEW_WIRE_VERSION=4 as const;
const artifactRef=z.string().regex(/^A[1-9][0-9]*$/).max(4),sourceRef=z.string().regex(/^S[1-9][0-9]*$/).max(4),requestRef=z.string().regex(/^R[1-9][0-9]*$/).max(4);
const wireQuote=z.string().min(1).max(160).refine(value=>Boolean(value.trim()),{params:{contentReviewRule:'NONBLANK_QUOTE'}});
/** Scope/disposition only narrow repair candidates; they never grant authority.
 * Rich receipt fields stay optional to read hash-bound historical receipts unchanged. */
const wireFindingBase=z.object({category:contentReviewFindingSchema.shape.category,severity:contentReviewFindingSchema.shape.severity,confidence:contentReviewFindingSchema.shape.confidence,scope:reviewScope,repairDisposition,explanation:z.string().min(1).max(160),suggestion:z.string().max(100).optional(),artifacts:z.array(z.object({artifactRef,quote:wireQuote}).strict()).min(1).max(2),sources:z.array(z.object({sourceRef,quote:wireQuote}).strict()).max(2),requests:z.array(z.object({requestRef,quote:wireQuote}).strict()).max(2)}).strict().refine(value=>value.sources.length+value.requests.length>0,{message:'必须引用真实来源或用户要求',params:{contentReviewRule:'EVIDENCE_BASIS_REQUIRED'}});
/** Historical v3 validation is kept separate; it never upgrades an old response. */
export const contentReviewWireFindingV3Schema=wireFindingBase.refine(value=>value.artifacts.length+value.sources.length+value.requests.length<=3,{message:'每项最多三处引用',params:{contentReviewRule:'QUOTE_TOTAL_LIMIT'}});
export const CONTENT_REVIEW_WIRE_QUOTE_LIMIT=4 as const;
export const contentReviewWireFindingSchema=wireFindingBase.refine(value=>value.artifacts.length+value.sources.length+value.requests.length<=CONTENT_REVIEW_WIRE_QUOTE_LIMIT,{message:'每项最多四处引用',params:{contentReviewRule:'QUOTE_TOTAL_LIMIT'}});
export const contentReviewWireCoverageSchema=z.object({artifactRefs:z.array(artifactRef).max(20),sourceRefs:z.array(sourceRef).max(100),requestRefs:z.array(requestRef).max(100),directions:contentReviewCoverageSchema.shape.directions,limitations:z.array(z.string().max(120)).max(3)}).strict();
export const contentReviewWireOutputSchema=z.object({findings:z.array(z.unknown()).max(3),coverage:contentReviewWireCoverageSchema}).strict();
export type ContentReviewWireFinding=z.infer<typeof contentReviewWireFindingSchema>;
export type ContentReviewReference={kind:'artifact'|'source'|'request';alias:string;id:string;sha256:string};
export const contentReviewResponseDiagnosticsSchema=z.object({blockCounts:z.object({text:z.number().int().nonnegative(),thinking:z.number().int().nonnegative(),image:z.number().int().nonnegative(),toolCall:z.number().int().nonnegative(),unknown:z.number().int().nonnegative()}).strict(),textCharacters:z.number().int().nonnegative(),thinkingCharacters:z.number().int().nonnegative(),textEmpty:z.boolean(),reasoningTokenSource:z.literal('pi_normalized_actual_unknown'),hostPiEstimatedInputTokens:z.number().int().nonnegative().optional(),hostPiBaseClampedOutputTokens:z.number().int().positive().optional()}).strict();
export type ContentReviewResponseDiagnostics=z.infer<typeof contentReviewResponseDiagnosticsSchema>;
export const contentReviewReviewerSchema=z.object({provider:id,modelId:id,protocol:id,configurationId:id.optional()}).strict();
export type ContentReviewReviewer=z.infer<typeof contentReviewReviewerSchema>;
export type ContentReviewExcerpt={start:number;end:number;startLine:number;endLine:number;text:string};
export type ContentReviewContext={id:string;sha256:string;path?:string;locator?:string;excerpts:ContentReviewExcerpt[];totalCharacters:number;includedCharacters:number;coverage:'full'|'partial'};
export type ContentReviewInput={wireVersion:typeof CONTENT_REVIEW_WIRE_VERSION;referenceTable:ContentReviewReference[];outputSchemaHash:string;schemaVersion:1;version:typeof CONTENT_REVIEW_VERSION;promptCharacterLimit:number;inputHash:string;prompt:string;promptHash:string;snapshot:ContentReviewSnapshot;requestContexts:ContentReviewContext[];artifactContexts:ContentReviewContext[];sourceContexts:ContentReviewContext[];coverageLimits:string[]};
export type ContentReviewBoundQuote={id:string;quote:string;sha256:string;locator?:string;start:number;end:number;startLine:number;endLine:number};
export type ContentReviewVerifiedFinding=ContentReviewFinding&{binding:'verified_quotes';validation:'bound';repairEligible:boolean;repairMode:'clarify_uncertainty'|'align_explicit_evidence';repairConstraint:string;artifactBindings:ContentReviewBoundQuote[];sourceBindings:ContentReviewBoundQuote[];requestBindings:ContentReviewBoundQuote[];notice:string};
export type ContentReviewInvalidFinding={index:number;id?:string;reason:string};
/** Safe host structure only. No model quotes, explanations, raw prompt or response. */
const structuralCount=z.union([z.number().int().min(0).max(100000),z.literal('unknown')]);
export const contentReviewStructureDiagnosticsSchema=z.object({wireVersion:z.number().int().min(1).max(1000),outputSchemaHash:hash,findingCount:structuralCount,findingsTruncated:z.boolean(),findings:z.array(z.object({index:z.number().int().min(0).max(2),artifacts:structuralCount,sources:structuralCount,requests:structuralCount,totalQuotes:structuralCount,validation:z.enum(['schema_valid','schema_invalid']),diagnostics:z.array(z.string().max(1000).regex(/^CONTENT_REVIEW_SCHEMA /)).max(12)}).strict()).max(3),inputCoverage:z.array(z.object({kind:z.enum(['request','artifact','source']),id,totalCharacters:z.number().int().nonnegative(),includedCharacters:z.number().int().nonnegative(),coverage:z.enum(['full','partial']),readCoverage:z.enum(['full','partial','not_applicable']),ranges:z.array(z.object({start:z.number().int().nonnegative(),end:z.number().int().nonnegative()}).strict()).max(8)}).strict()).max(220)}).strict();
export type ContentReviewStructureDiagnostics=z.infer<typeof contentReviewStructureDiagnosticsSchema>;
export const contentReviewIsolatedRepairSchema=z.object({
 version:z.literal('isolated-finding-repair-v1'),inputHash:hash,promptHash:hash,
 globalChecks:z.object({normalStop:z.literal(true),rootEnvelopeValid:z.literal(true),coverageIdentitiesValid:z.literal(true),sourceEvidencePresent:z.literal(true),currentBeforeAndAfter:z.literal(true)}).strict(),
 eligibleFindingIds:z.array(id).min(1).max(3).refine(ids=>new Set(ids).size===ids.length),
}).strict();
export type ContentReviewIsolatedRepair=z.infer<typeof contentReviewIsolatedRepairSchema>;
export type ContentReviewReceipt={schemaVersion:1;id:string;version:typeof CONTENT_REVIEW_VERSION;inputHash:string;promptHash:string;resultHash:string;rawResultHash?:string;rawResponseHash?:string;rawResponseCharacters?:number;responseDiagnostics?:ContentReviewResponseDiagnostics;structureDiagnostics?:ContentReviewStructureDiagnostics;isolatedRepair?:ContentReviewIsolatedRepair;errorMessage?:string;configuredMaxRetries?:number;actualRetries?:'unknown';reviewer:ContentReviewReviewer;startedAt:string;finishedAt:string;durationMs:number|'unknown';usage:unknown;stopReason:string|'unknown';requestedOutputTokens?:number;thinkingLevel?:string;budgetNotice?:string;status:'reviewed'|'issues_found'|'unverified'|'failed';versionState:'current'|'stale'|'unavailable';completion:'completed'|'cancelled'|'failed'|'invalid';humanConfirmed:false;findings:ContentReviewVerifiedFinding[];invalidFindings:ContentReviewInvalidFinding[];coverage?:z.infer<typeof contentReviewCoverageSchema>;coverageLimits:string[];diagnostics:string[];requests:Array<{id:string;sha256:string}>;artifacts:Array<{id:string;sha256:string}>;sources:Array<{id:string;sha256:string;originHash?:string}>;notice:string};
export const CONTENT_REVIEW_NOTICE='引文绑定只证明摘录来自冻结输入，不能证明模型解释正确；独立模型审查不等于用户确认。没有发现问题也不自动判定业务通过。';

const boundQuote=z.object({id,quote,sha256:hash,locator:z.string().max(2048).optional(),start:z.number().int().nonnegative(),end:z.number().int().positive(),startLine:z.number().int().positive(),endLine:z.number().int().positive()}).strict().refine(value=>value.end>value.start&&value.endLine>=value.startLine);
const verifiedFinding=z.object({...contentReviewFindingSchema.shape,binding:z.literal('verified_quotes'),validation:z.literal('bound'),repairEligible:z.boolean(),repairMode:z.enum(['clarify_uncertainty','align_explicit_evidence']),repairConstraint:z.string().min(1).max(4000),artifactBindings:z.array(boundQuote).min(1).max(4),sourceBindings:z.array(boundQuote).max(8),requestBindings:z.array(boundQuote).max(8),notice:z.string().min(1).max(4000)}).strict().refine(value=>value.sourceBindings.length+value.requestBindings.length>0);
export const contentReviewReceiptSchema=z.object({schemaVersion:z.literal(1),id,version:z.literal(CONTENT_REVIEW_VERSION),inputHash:hash,promptHash:hash,resultHash:hash,rawResultHash:hash.optional(),rawResponseHash:hash.optional(),rawResponseCharacters:z.number().int().nonnegative().optional(),responseDiagnostics:contentReviewResponseDiagnosticsSchema.optional(),structureDiagnostics:contentReviewStructureDiagnosticsSchema.optional(),isolatedRepair:contentReviewIsolatedRepairSchema.optional(),errorMessage:z.string().min(1).max(1000).optional(),configuredMaxRetries:z.number().int().min(0).max(1).optional(),actualRetries:z.literal('unknown').optional(),reviewer:contentReviewReviewerSchema,startedAt:z.string().min(1).max(100),finishedAt:z.string().min(1).max(100),durationMs:z.union([z.number().nonnegative(),z.literal('unknown')]),usage:z.unknown(),stopReason:z.string().max(200),requestedOutputTokens:z.number().int().positive().optional(),thinkingLevel:z.string().min(1).max(100).optional(),budgetNotice:z.string().max(2000).optional(),status:z.enum(['reviewed','issues_found','unverified','failed']),versionState:z.enum(['current','stale','unavailable']),completion:z.enum(['completed','cancelled','failed','invalid']),humanConfirmed:z.literal(false),findings:z.array(verifiedFinding).max(100),invalidFindings:z.array(z.object({index:z.number().int().nonnegative(),id:id.optional(),reason:z.string().min(1).max(4000)}).strict()).max(100),coverage:contentReviewCoverageSchema.optional(),coverageLimits:z.array(z.string().max(4000)).max(1000),diagnostics:z.array(z.string().max(4000)).max(200),requests:z.array(z.object({id,sha256:hash}).strict()).min(1).max(100),artifacts:z.array(z.object({id,sha256:hash}).strict()).min(1).max(20),sources:z.array(z.object({id,sha256:hash,originHash:hash.optional()}).strict()).max(100),notice:z.string().min(1).max(4000)}).strict().superRefine((receipt,context)=>{
 const isolated=receipt.isolatedRepair;if(!isolated)return;
 const valid=isolated.inputHash===receipt.inputHash&&isolated.promptHash===receipt.promptHash
  &&receipt.completion==='invalid'&&receipt.status==='unverified'&&receipt.versionState==='current'
  &&receipt.stopReason==='stop'&&!receipt.errorMessage&&!receipt.responseDiagnostics?.textEmpty
  &&receipt.diagnostics.length===0&&receipt.invalidFindings.length>0&&receipt.sources.length>0
  &&!!receipt.coverage&&(['artifactIds','sourceIds','requestIds'] as const).every((key,index)=>{
   const ids=receipt.coverage![key],actual=[receipt.artifacts,receipt.sources,receipt.requests][index];
   return new Set(ids).size===ids.length&&ids.every(id=>actual.some(item=>item.id===id));
  })
  &&!!receipt.rawResultHash&&new Set(receipt.findings.map(f=>f.id)).size===receipt.findings.length
  &&isolated.eligibleFindingIds.every(id=>receipt.findings.some(f=>f.id===id&&f.validation==='bound'
   &&f.binding==='verified_quotes'&&f.repairEligible&&f.confidence==='high'&&f.scope==='in_scope'
   &&f.repairDisposition==='candidate'&&f.requestBindings.length>0
   &&(f.category!=='cross_artifact_consistency'||new Set(f.artifactBindings.map(b=>b.id)).size>=2)
   &&f.artifactBindings.every(b=>receipt.artifacts.some(a=>a.id===b.id&&a.sha256===b.sha256))
   &&f.sourceBindings.every(b=>receipt.sources.some(a=>a.id===b.id&&a.sha256===b.sha256))
   &&f.requestBindings.every(b=>receipt.requests.some(a=>a.id===b.id&&a.sha256===b.sha256))))
  &&receipt.findings.every(f=>!f.repairEligible||isolated.eligibleFindingIds.includes(f.id));
 if(!valid)context.addIssue({code:'custom',path:['isolatedRepair'],message:'宿主逐项修正资格与当前回执不一致'});
});
