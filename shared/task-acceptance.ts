import {spreadsheetFieldEvidenceSchema} from './spreadsheet-field-evidence.js';
import {z} from 'zod';
import {prototypeAcceptanceCaseSchema,type PrototypeAcceptanceCase,type PrototypeAcceptanceEvidence} from './prototype-acceptance.js';
import type {QualityReport,WorkflowSourceReceipt} from './types.js';

export const TASK_ACCEPTANCE_NOTICE='自动检查只证明已执行的具体检查；用户要求的完整业务覆盖、规则含义和视觉判断仍需核对。保存草稿不代表验收通过。';
export const TASK_ACCEPTANCE_LIMITS={requests:100,requestCharacters:100000,totalRequestCharacters:500000,outputs:100,criteria:200,baselines:100,reports:50,contentBytes:2000000} as const;
const id=z.string().trim().min(1).max(200),hash=z.string().regex(/^[a-f0-9]{64}$/i);
const text=z.string().trim().min(1).max(20000);
const relativePath=z.string().trim().min(1).max(32767).refine(value=>!value.replaceAll('\\','/').startsWith('/')&&!value.includes(':')&&!/[\0\r\n]/.test(value)&&!value.replaceAll('\\','/').split('/').includes('..'),'必须是挂载内相对路径');
export const taskRequestInputSchema=z.object({id,text:z.string().min(1).max(TASK_ACCEPTANCE_LIMITS.requestCharacters).refine(v=>Boolean(v.trim()),'用户输入不能为空'),source:z.enum(['initial','steer','follow_up','plan_confirmation'])}).strict();
export const taskTargetSchema=z.discriminatedUnion('source',[
 z.object({source:z.literal('draft'),mountId:id,path:relativePath,changeId:id,contentHash:hash,baseHash:hash.nullable(),artifactId:id.optional()}).strict(),
 z.object({source:z.literal('applied'),mountId:id,path:relativePath,contentHash:hash,artifactId:id.optional()}).strict(),
]);
export const taskOutputSchema=z.object({id,kind:z.enum(['markdown','html','flow','other']),target:taskTargetSchema}).strict();
const section=z.object({id,aliases:z.array(z.string().min(1).max(200)).min(1).max(20),required:z.boolean().default(true)}).strict();
export const taskCheckerSchema=z.discriminatedUnion('kind',[
 z.object({kind:z.literal('static_quality'),requiredSections:z.array(section).max(100).optional(),isPrd:z.boolean().optional()}).strict(),
 z.object({kind:z.literal('text_assertion'),expected:z.string().min(1).max(20000),match:z.enum(['contains','equals']).default('contains')}).strict(),
 z.object({kind:z.literal('prototype_cases'),cases:z.array(prototypeAcceptanceCaseSchema).min(1).max(10)}).strict().refine(v=>new Set(v.cases.map(c=>c.id)).size===v.cases.length,'用例ID须唯一'),
 z.object({kind:z.literal('business_provenance'),requirementId:id,constraintIds:z.array(id).min(1).max(100)}).strict(),
 z.object({kind:z.literal('human_review'),reason:text}).strict(),
]);
// The model can propose test definitions, never a status, observation or evidence.
export const taskCriterionSchema=z.object({id,text,requestIds:z.array(id).min(1).max(100),outputIds:z.array(id).min(1).max(100),origin:z.enum(['user_request','source_rule','template','model_proposal']).default('model_proposal'),required:z.boolean().default(true),checker:taskCheckerSchema}).strict();
export const taskSourceReceiptSchema=z.object({mountId:id,path:relativePath,artifactId:id.optional(),versionId:id,contentHash:hash,locator:z.string().max(2000).optional(),readAt:z.string().datetime({offset:true}),characters:z.number().int().nonnegative(),includedCharacters:z.number().int().nonnegative(),truncated:z.boolean(),contentStatus:z.enum(['metadata_only','spreadsheet_catalog']).optional(),processingCopyId:id.optional(),size:z.number().int().nonnegative().optional(),spreadsheetEvidence:z.array(spreadsheetFieldEvidenceSchema).max(8).optional()}).strict();
export const taskPrdEvidenceSchema=z.object({
 sources:z.array(taskSourceReceiptSchema).max(100).default([]),
 assumptions:z.array(z.object({id,text,sourceRefIds:z.array(id).max(100).default([])}).strict()).max(200).default([]),
 coverage:z.array(z.object({requestId:id,requestQuote:text,criterionIds:z.array(id).max(200),note:z.string().max(2000).optional()}).strict()).max(200).default([]),
}).strict();
export const taskAcceptanceDefineSchema=z.object({expectedRevision:z.number().int().positive().optional(),outputs:z.array(taskOutputSchema).max(TASK_ACCEPTANCE_LIMITS.outputs).optional(),criteria:z.array(taskCriterionSchema).max(TASK_ACCEPTANCE_LIMITS.criteria).optional(),prd:taskPrdEvidenceSchema.optional()}).strict();
// Model proposals select host-issued source identities, never source hashes or
// output content. Ordinary draft outputs are automatically registered by host.
export const taskAcceptanceProposalSchema=z.object({expectedRevision:z.number().int().positive().optional(),targets:z.array(z.object({id,kind:z.enum(['markdown','html','flow','other']),mountId:id,path:relativePath}).strict()).max(100).optional(),criteria:z.array(taskCriterionSchema).max(200).optional(),prd:taskPrdEvidenceSchema.omit({sources:true}).safeExtend({sourceIds:z.array(id).max(100).default([])}).optional()}).strict();
export const taskBaselineInputSchema=z.object({id,outputId:id,target:taskTargetSchema,origin:z.enum(['user_confirmed','previous_verified']),cases:z.array(prototypeAcceptanceCaseSchema).min(1).max(10),specId:id.optional(),specRevision:z.number().int().nonnegative().optional(),specHash:hash.optional()}).strict().refine(v=>new Set(v.cases.map(c=>c.id)).size===v.cases.length,'基线用例ID须唯一');
/** Host-only amendment. A matching quote is necessary but the service must also
 * establish that the human actually authorized this expectation change. */
export const taskCriterionAmendmentSchema=z.object({requestId:id,authorizationQuote:text,criterionId:id,replacement:taskCriterionSchema}).strict();
export const taskBaselineAmendmentSchema=z.object({requestId:id,authorizationQuote:text,baselineId:id,cases:z.array(prototypeAcceptanceCaseSchema).min(1).max(10)}).strict().refine(v=>new Set(v.cases.map(c=>c.id)).size===v.cases.length,'基线用例ID须唯一');

export type TaskAcceptanceStatus='not_applicable'|'unverified'|'passed'|'failed'|'needs_human';
export type TaskRequestInput=z.infer<typeof taskRequestInputSchema>;
export type TaskAcceptanceRequest=TaskRequestInput&{textHash:string;recordedAt:string};
export type TaskAcceptanceTarget=z.infer<typeof taskTargetSchema>;
export type TaskAcceptanceOutput=z.infer<typeof taskOutputSchema>;
export type TaskAcceptanceCriterion=z.infer<typeof taskCriterionSchema>;
export type TaskAcceptanceDefine=z.infer<typeof taskAcceptanceDefineSchema>;
export type TaskPrdEvidence=z.infer<typeof taskPrdEvidenceSchema>;
export type TaskAcceptanceBaseline=z.infer<typeof taskBaselineInputSchema>&{specHash:string;capturedAt:string};
export type TaskDependency={mountId:string;path:string;contentHash:string};
export type TaskCriterionAmendment=z.infer<typeof taskCriterionAmendmentSchema>&{previous:TaskAcceptanceCriterion;recordedAt:string};
export type TaskAcceptanceContract={schemaVersion:1;id:string;workspaceId:string;runId:string;revision:number;contractHash:string;scope:'conversation'|'deliverable';requests:TaskAcceptanceRequest[];outputs:TaskAcceptanceOutput[];criteria:TaskAcceptanceCriterion[];criterionAmendments:TaskCriterionAmendment[];baseline:TaskAcceptanceBaseline[];baselineAmendments:Array<z.infer<typeof taskBaselineAmendmentSchema>&{previous:TaskAcceptanceBaseline;recordedAt:string}>;prd:TaskPrdEvidence;createdAt:string;updatedAt:string};
export type TaskCheckEvidence={kind:'static_quality'|'text_observation'|'prototype_report'|'business_check'|'human_decision'|'model_content_review';targetHash:string;checkerVersion:string;observed?:string|number|boolean;reportId?:string;quality?:QualityReport;prototype?:PrototypeAcceptanceEvidence;locator?:string;contentFinding?:import('./content-review.js').ContentReviewVerifiedFinding};
export type TaskHostCheckOutcome={status:Exclude<TaskAcceptanceStatus,'not_applicable'>;reason:string;evidence:TaskCheckEvidence[]};
export type TaskCheckResult=TaskHostCheckOutcome&{criterionId:string;outputId:string;required:boolean;baselineId?:string};
export type TaskCoverageState={status:'unverified'|'needs_human'|'confirmed';reason:string;unmappedRequestIds:string[];assumptionIds:string[]};
export type TaskAcceptanceReport={schemaVersion:1;id:string;workspaceId:string;runId:string;contractId:string;contractRevision:number;contractHash:string;status:TaskAcceptanceStatus;automaticStatus?:TaskAcceptanceStatus;contentReview?:import('./content-review.js').ContentReviewReceipt;contentReviewRequired?:boolean;contentReviewNotice?:string;summary:string;checkedAt:string;checkerVersion:string;targets:TaskAcceptanceOutput[];dependencies:TaskDependency[];outputDependencies:Record<string,TaskDependency[]>;sources:WorkflowSourceReceipt[];results:TaskCheckResult[];regression:TaskCheckResult[];businessCoverage:TaskCoverageState;versionState:'current'|'stale'|'unavailable';versionReasons:string[];notice:string};
export type TaskAcceptanceView={contract:TaskAcceptanceContract;latestReport?:TaskAcceptanceReport;reports:Array<{id:string;status:TaskAcceptanceStatus;checkedAt:string}>;notice:string};
export type TaskHostCheckInput={contract:TaskAcceptanceContract;criterion:TaskAcceptanceCriterion;output:TaskAcceptanceOutput;content:string;dependencies:TaskDependency[];baseline?:TaskAcceptanceBaseline;signal?:AbortSignal};
export type TaskTargetSnapshot={content:string;dependencies?:TaskDependency[]};
export type TaskPrototypeCases=PrototypeAcceptanceCase[];
