import {mcpPrototypeProjectLocatorSchema,type McpPrototypeProjectLocator,type McpPrototypeProjectBinding} from './prototype-delivery.js';
import {z} from 'zod';
import {modelProxyUrlSchema} from './model-proxy.js';
import {mcpConnectionFields,mcpRequestSchemas,type McpConnectionOptions} from './mcp-connections.js';
import {globalSkillsRequestSchema} from './global-skills.js';
import {runInputEnqueueSchema,runInputClearSchema,runInputMutateSchema} from './run-inputs.js';
import {freshContextResumeSchema} from './run-resume.js';
import {reconcileRunOperationSchema} from './run-recovery.js';
import {taskDeliveryRequestSchemas} from './task-delivery.js';
import {taskAcceptanceOptionalSchema} from './task-acceptance.js';
import {projectCatalogRequestSchemas} from './project-catalog.js';
import {knowledgeDesktopRequestSchemas} from './knowledge-desktop.js';
import {piPackageRequestSchemas} from './pi-packages.js';
import {sharePermissionInspectSchema,sharePermissionUpdateSchema,shareStopSchema,shareDisconnectSchema,shareReconnectSchema} from './network-share-management.js';
export type {SharePermissionView,ShareManagementResult} from './network-share-management.js';
import {businessRuleCheckInputSchema} from './business-rules.js';
import {prototypeAcceptanceDefinitionSchema,prototypeAcceptanceGetSchema,prototypeAcceptanceRunSchema,prototypeAcceptanceRequiredSchema,prototypeAcceptanceCancelSchema,prototypeAcceptanceScreenshotSchema,type PrototypeAcceptanceEvidence} from './prototype-acceptance.js';
export type {PrototypeAcceptanceView,PrototypeAcceptanceSpec,PrototypeAcceptanceEvidence} from './prototype-acceptance.js';
export type {BusinessConstraint,BusinessImplementationRef,BusinessRuleCheckView,BusinessEvidenceStatus} from './business-rules.js';

export type Mount={id:string;path:string;name:string;write:boolean;enabled:boolean;readRootIdentity?:string};
/** A locally registered workspace shown in the project switcher. */
export type ProjectConversationSummary={id:string;title:string;archived:boolean};
export type ProjectSummary={id:string;name:string;root:string;lastOpenedAt:string;conversationCount:number;conversations?:ProjectConversationSummary[];current?:boolean;pinned?:boolean;activeRunCount?:number;removedAt?:string};
export type ProjectRegistry={projects:ProjectSummary[];defaultProjectId?:string};
export type ImportCategory='reference'|'resource'|'prototype'|'output'|'process'|'knowledge';
export type ImportedFile={sourcePath:string;mountId:string;path:string;category:ImportCategory;size:number;isDirectory?:boolean};
export type ProcessingCopy={id:string;runId?:string;source:{mountId:string;path:string;contentHash:string};copy:{mountId:string;path:string};size:number;createdAt:string};
/** Older receipts omit workspace/output hashes and remain explicitly unverified. */
export type ProcessingResult={copyId:string;source:ProcessingCopy['source'];copy:ProcessingCopy['copy'];copyHash:string;operation:'extract_text'|'script';output:{mountId:string;path:string};changeId:string;status:Change['status'];workspaceId?:string;outputHash?:string;reuse?:{requestedCopyId:string;parserVersion:string;notice:string}};
export type FileRef={mountId:string;path:string;size:number;referenceProtected?:boolean};
export type Message={role:'user'|'assistant'|'tool';text:string;time:string;runId?:string;completedAt?:string;generationDurationMs?:number;attachmentIds?:string[];attachments?:unknown;evidenceText?:string};
export type SystemPromptView={content:string;defaultContent:string;isDefault:boolean;updatedAt?:string;notice:string};
export type ProjectTreeRole='resource'|'output'|'process';
export type ProjectTreeNode={id:string;name:string;role:ProjectTreeRole;children:ProjectTreeNode[];path?:string;mountId?:string};
export type AgentIndexStatus={path:'AGENTS.md'|'agent.md';syncedAt:string;contentHash:string;entryCount:number;truncated:boolean;warnings:string[];lastError?:string};
export type AgentIndexReceipt=AgentIndexStatus&{readAt:string;context?:import('./agent-index-context.js').AgentIndexContextReceipt};
export type ProjectTreeView={workspaceId:string;root:string;revision:number;nodes:ProjectTreeNode[];appliedNodes:ProjectTreeNode[];preservedDirectories:string[];mounts:Mount[];mountRoles?:Record<string,ProjectTreeRole>;index?:AgentIndexStatus;initializationWarnings?:string[]};
export type Conversation={id:string;title:string;archived:boolean;messages:Message[];permissionMode?:'standard'|'accept_edits'|'full_access'};
export type Change={id:string;runId:string;originRunId?:string;resumptionHistory?:Array<{fromRunId:string;toRunId:string;at:string;contentHash:string}>;mountId:string;path:string;before:string|null;content:string;status:'pending'|'applied'|'conflict';createdAt:string};
export type RunStatus='queued'|'running'|'waiting_user'|'awaiting_plan'|'cancelling'|'cancelled'|'interrupted'|'validating'|'succeeded'|'failed';
export type RunPhase='queued'|'preparing_context'|'starting_model'|'generating'|'tool_call'|'waiting_approval'|'waiting_plan'|'validating'|'cancelling'|'completed'|'cancelled'|'interrupted'|'failed';
export type AgentMode='plan'|'build';
export type PermissionMode='standard'|'accept_edits'|'full_access';
export const pmWorkflowKinds=['prototype','prd','research','meeting','prototype_to_prd','change_summary','test_cases'] as const;
export type PmWorkflowKind=(typeof pmWorkflowKinds)[number];
export type WorkflowSource={mountId:string;path:string;artifactId?:string;versionId?:string;contentHash?:string;locator?:string};
export type WorkflowSourceReceipt=WorkflowSource&{textExtraction?:import('./docx-read-identity.js').DocxTextExtraction;versionId:string;contentHash:string;readAt:string;characters:number;includedCharacters:number;truncated:boolean;contentStatus?:'metadata_only'|'spreadsheet_catalog';processingCopyId?:string;size?:number;spreadsheetEvidence?:import('./spreadsheet-field-evidence.js').SpreadsheetFieldEvidence[]};
export type PmWorkflow={kind:PmWorkflowKind;sources:WorkflowSource[];template?:WorkflowSource};
export type RunWorkflow=PmWorkflow&{receipts:WorkflowSourceReceipt[];templateSnapshot?:import('./prd-template.js').TaskPrdTemplate;diff?:{fromVersionId:string;toVersionId:string;fromHash:string;toHash:string;added:number;removed:number;unchanged:boolean;truncated:boolean};preparedAt?:string};
export type RunPlan={status:'accepted'|'in_progress'|'completed'|'blocked';steps:string[];source:'heuristic'|'user';createdAt:string;completedAt?:string};
export type PlanProposal={status:'pending'|'confirmed';summary:string;options:Array<{id:string;title:string;steps:string[]}>;selectedOptionIds:string[];customText:string;createdAt:string;approvedInput?:string;buildRunId?:string;confirmedAt?:string};
export const thinkingLevels=['off','minimal','low','medium','high','xhigh','max'] as const;
export type ThinkingLevel=(typeof thinkingLevels)[number];
export type ModelLimitsCapability={contextWindow:number;maxTokens:number;status:'verified'|'unverified';source:string;reason:string;contextWindowSource:string;maxTokensSource:string;fingerprint:string;modelEntryId?:string;modelId:string;stale?:boolean;checkedAt?:string};
export type ModelThinkingCapability={status:'supported'|'unsupported'|'unknown';levels:ThinkingLevel[];source:string;reason:string;defaultLevel?:ThinkingLevel;modelEntryId?:string;modelId:string;fingerprint:string;nativeLevels?:Partial<Record<ThinkingLevel,string|null>>;stale?:boolean;checkedAt?:string;limits?:ModelLimitsCapability};
export type RunReasoning={requestedLevel?:ThinkingLevel;effectiveLevel:ThinkingLevel;source:string;status:ModelThinkingCapability['status'];fingerprint:string};
export type Run={piChildTasks?:import('./pi-packages.js').PiChildTaskView[];piPlanReview?:import('./pi-packages.js').PiPlanReviewView;acceptance?:{contractId:string;contractRevision:number;reportId?:string;status:import('./task-acceptance.js').TaskAcceptanceStatus;summary?:string;businessCoverage:'unverified'|'needs_human'|'confirmed';outputCount:number;repairRounds:number};sourceReads?:WorkflowSourceReceipt[];id:string;conversationId:string;status:RunStatus|string;phase?:RunPhase;mode?:AgentMode;permissionMode?:PermissionMode;modelEntryId?:string;reasoning?:RunReasoning;systemPromptHash?:string;agentIndexReceipt?:AgentIndexReceipt;skillDiscovery?:import('./skills.js').SkillDiscoveryReceipt;skillLoads?:import('./skills.js').SkillLoadReceipt[];imageReads?:import('./image-reading.js').ImageReadReceipt[];inputs?:import('./run-inputs.js').RunInputRecord[];runtimeStatus?:import('./runtime-status.js').RuntimeObservedStatus;generationStartedAt?:string;generationFinishedAt?:string;generationDurationMs?:number;modelRoute?:{strategy:string;taskType:string;modelId:string;provider:string;reason:string;fallbackUsed:boolean;entryId?:string};attachmentIds?:string[];attachments?:unknown;evidenceText?:string;plan?:RunPlan;proposal?:PlanProposal;sourcePlanRunId?:string;input?:string;error?:string;startedAt:string;updatedAt?:string;finishedAt?:string;attempt?:number;resumable?:boolean;resumedFromRunId?:string;workflow?:RunWorkflow;checkpointRef?:string;piSessionFile?:string;contextResume?:import('./run-resume.js').RunContextResume;interruptionReason?:'model_output_limit'|'context_budget'|'context_compaction_failed';modelStopReason?:string;contextRecovery?:{status:'compacting'|'compacted'|'failed';reason:string;error?:string}};
export type RunCheckpoint={runId:string;attempt:number;phase:RunPhase|string;updatedAt:string;assistantText:string;completedOperations:Array<{id:string;tool:string;state:string;result?:string;createdAt:string}>;contextManifestRef?:string;safeToResume:boolean};
export type ConnectionHealthStatus='unknown'|'healthy'|'degraded'|'failed';
export type ConnectionHealthSnapshot={connectionId:string;checkedAt:string;status:ConnectionHealthStatus;summary:string;version?:string;capabilities:string[];diagnostic?:string};
export type Connection=McpConnectionOptions&{id:string;name:string;kind:'mcp'|'cli';command:string;args:string[];url?:string;enabled:boolean;provider?:string;source?:'manual'|'discovered';discoveryId?:string;executableVersion?:string;capabilities?:string[];available?:boolean;diagnostic?:string;healthStatus?:ConnectionHealthStatus;lastCheckedAt?:string;healthSummary?:string;capabilityHash?:string};
export const connectionDiscoverySchema=z.object({id:z.string(),provider:z.string(),name:z.string(),command:z.string(),version:z.string().optional(),source:z.enum(['path','known-location']),capabilities:z.array(z.string()),available:z.boolean(),diagnostic:z.string().optional()});
/** Host UI discovery response contains official CLI candidates, not the merged agent connection view. */
export const connectionDiscoveriesSchema=z.array(connectionDiscoverySchema);
export type ConnectionDiscovery=z.infer<typeof connectionDiscoverySchema>;
export type DiscoveredCli=ConnectionDiscovery;
export const modelProtocols=['openai-completions','openai-responses','anthropic-messages'] as const;
export type ModelProtocol=(typeof modelProtocols)[number];
export type ModelEntry={id:string;provider:string;name:string;baseUrl:string;proxyUrl?:string;modelId:string;protocol:ModelProtocol;hasKey:boolean;supportsVision?:boolean;contextWindow?:number;maxTokens?:number;createdAt?:string;updatedAt?:string};
export type ModelGroup={provider:string;models:ModelEntry[]};
export type PermissionDecision='ask'|'allow'|'deny';
export const permissionCapabilities=['workspace_read','web_read','connection_config','process_execute','external_action','artifact_write'] as const;
export type PermissionCapability=(typeof permissionCapabilities)[number];
export type PermissionSettings=Record<PermissionCapability,PermissionDecision>;
export type ApprovalRequest={id:string;runId?:string;conversationId?:string;capability:PermissionCapability;summary:string;details?:Record<string,unknown>;status:'pending'|'allowed'|'denied'|'cancelled'|'expired';createdAt:string;resolvedAt?:string;reason?:string};
export type ShareSetupInfo={supported:boolean;host:string;currentUser:{name:string;qualifiedName:string;description:string;sid?:string;status?:'verified'|'unavailable';principalSource?:string};accounts:Array<{name:string;qualifiedName:string;current:boolean;sid?:string;displayName?:string;principalSource?:string}>;existingShares:Array<{name:string;path:string;description?:string;special:boolean}>;availableDrives:string[];mappings:Array<{drive:string;remotePath:string;status:string}>;diagnostic?:string};
export type ShareFolderSelection={path:string;folderName:string;suggestedShareName:string;existingShare?:{name:string;path:string}};
export type OperationStatus='pending'|'preview'|'executing'|'succeeded'|'failed'|'outcome_unknown';
export type OperationSummary={id:string;runId:string;tool:string;state:OperationStatus|string;result:string;createdAt:string};
export type VersionSummary={id:string;label:string;createdAt:string;runId:string|null;source:'current'|'change_snapshot';contentHash:string;size:number;restorable:boolean};
export type DocumentContent={content:string;version:string;format:'markdown'|'text'|'word';notice?:string;wordPresentation?:'host-structured-v1'};
export type PreviewHandle={url:string;version:string};
export type FlowPreview={version:string;report:{valid:boolean;specId:string;specVersion:number;issues:Array<{code:string;severity:'error'|'warning';message:string;diagramId:string;cellId?:string}>;counts:{diagrams:number;vertices:number;edges:number;errors:number;warnings:number}};limitations:Array<{code:string;message:string;diagramId?:string;cellId?:string}>;previews:Array<{diagramId:string;name:string;svg:string|null;limitations:Array<{code:string;message:string;diagramId?:string;cellId?:string}>}>};
export type QualityIssue={severity:'blocking'|'warning';code:string;message:string;line?:number;locator?:string};
export type QualityAcceptanceMapping={id?:string;line:number;text:string;references:string[];mapped:boolean};
export type QualityReportDetails={
 metrics:Record<string,number>;
 prototypeAcceptance?:PrototypeAcceptanceEvidence;
 interactions?:{controls:number;buttons:number;forms:number;links:number;actions:number;brokenTargets:number;stateMarkers:number;externalResources:number};
 markdown?:{headings:number;sections:number;requiredSections:number;missingSections:string[];emptySections:string[];acceptanceCriteria:number;acceptanceMapped:number;acceptanceUnmapped:number;acceptance?:QualityAcceptanceMapping[]};
};
export type QualityReport={kind:'flow'|'html'|'markdown';valid:boolean;issues:QualityIssue[];counts:{blocking:number;warnings:number};summary:string;passed?:boolean;blockingIssues?:QualityIssue[];warnings?:QualityIssue[];recommendations?:string[];checkedVersion?:string;contentHash?:string;checkerVersion?:string;checkedAt?:string;inputSources?:string[];requiresHumanConfirmation?:boolean;details?:QualityReportDetails};
export type QualityCheckReport=QualityReport;
export type QualityGate={allowed:boolean;code:'QUALITY_PASSED'|'QUALITY_BLOCKED'|'VERSION_CONFLICT';reasons:string[]};
export type QualityCheckResult={artifactId?:string;artifact:{kind:string;title:string;mountId:string;path:string;versionId:string;contentHash:string;currentVersionHash?:string};check:QualityReport;gate:QualityGate;versions:VersionSummary[];deliveries:ExternalActionProposal[]};
export type DeliveryPreflightStatus='passed'|'warning'|'blocked'|'unknown';
export type DeliveryPreflightCheck={id:string;label:string;status:DeliveryPreflightStatus;detail:string};
export type DeliveryChecklist={identity:string;contentReviewed:boolean;destinationConfirmed:boolean;updatedAt?:string};
/** The same enforced result is used by the UI, Agent approval, and execution. */
export type DeliveryPreflight={allowed:boolean;sourceHash:string;currentHash:string;checkedAt:string;checks:DeliveryPreflightCheck[];checklist:DeliveryChecklist;quality?:QualityReport;gate?:QualityGate};
/** A persisted quality check snapshot. The report is immutable and can be
 * compared with the current artifact hash before delivery. */
export type QualityReportRecord={id:string;workspaceId:string;artifactId?:string;mountId:string;path:string;report:QualityReport;gate:QualityGate;createdAt:string};
export type QualityHistoryView={workspaceId:string;artifactId?:string;mountId:string;path:string;reports:QualityReportRecord[]};
export type ImpactGraphNode={id:string;kind:'artifact'|'requirement'|'review'|'delivery';title:string;path?:string;status?:string;certainty?:'confirmed'|'candidate';depth:number;metadata?:Record<string,unknown>};
export type ImpactGraphEdge={id:string;from:string;to:string;relation:string;certainty?:'confirmed'|'candidate';rationale?:string;locator?:string};
export type ImpactGraphView={workspaceId:string;revision:number;originArtifactId:string;nodes:ImpactGraphNode[];edges:ImpactGraphEdge[]};
export type RuleLayerKind='host_policy'|'workspace_rules'|'confirmed_knowledge'|'task_context';
export type RuleLayer={kind:RuleLayerKind;label:string;authority:'enforced'|'instruction'|'evidence';priority:number;description:string};
export type DecisionKind='requirement_question'|'assumption'|'confirmed_fact'|'design_tradeoff'|'review_issue'|'delivery_blocker'|'external_action'|'decision';
export type DecisionStatus='pending'|'confirmed'|'rejected'|'needs_verification'|'superseded';
export type DecisionSourceRef={kind:'conversation'|'file'|'requirement'|'artifact'|'review'|'run'|'manual';id:string;label?:string;path?:string};
export type DecisionHistoryEntry={from:DecisionStatus;to:DecisionStatus;at:string;actor?:string;note?:string};
export type DecisionRecord={id:string;workspaceId:string;kind:Exclude<DecisionKind,'requirement_question'|'review_issue'|'external_action'>;title:string;description:string;status:DecisionStatus;sourceRefs:DecisionSourceRef[];requirementIds:string[];artifactIds:string[];conversationIds:string[];impact:string;nextAction:string;confirmedBy?:string;confirmedAt?:string;createdAt:string;updatedAt:string;history:DecisionHistoryEntry[]};
export type DecisionCenterItem={id:string;kind:DecisionKind;title:string;description:string;status:string;sourceId:string;artifactId?:string;mountId?:string;path?:string;updatedAt:string;recordId?:string;impact?:string;nextAction?:string;sourceRefs?:DecisionSourceRef[];artifactIds?:string[];conversationIds?:string[];requirementIds?:string[];history?:DecisionHistoryEntry[];conversationId?:string;confirmedBy?:string};
export type DecisionCenterView={workspaceId:string;revision:number;items:DecisionCenterItem[];ruleLayers:RuleLayer[]};
export type TemplateMigrationPreviewView={previewId:string;template:{id:string;version:string;title:string};impacts:Array<{target:{mountId:string;path:string};sourceHash:string;proposedHash:string;changed:boolean;canDraft:boolean;sectionChanges:Array<{sectionId:string;line:number;from:{title:string;level:number};to:{title:string;level:number}}>;retainedSectionIds:string[];issues:Array<{severity:'blocking'|'warning';code:string;message:string;sectionId?:string;line?:number}>}>;createdAt:string};
export type TemplateMigrationGroupView={id:string;previewId:string;runId:string;changeIds:string[];status:'pending'|'applied'|'partial'|'conflict';appliedChangeIds:string[];remainingChangeIds:string[];createdAt:string;updatedAt:string;error?:string};
export type WorkspaceRuleChangeView={id:string;runId:string;relativePath:'AGENTS.md';beforeHash:string|null;content:string;status:'pending'|'applied'|'conflict';createdAt:string};
export type TemplateWorkflowView={previews:TemplateMigrationPreviewView[];groups:TemplateMigrationGroupView[];ruleChanges:WorkspaceRuleChangeView[]};
export type ExternalResult={operationId:string;status:OperationStatus;receipt?:unknown;diagnostic:string;remoteId?:string;url?:string};
export type ShareConnectResult={operationId:string;status:'succeeded'|'partial'|'failed'|'outcome_unknown';drive:string;unc:string;mappingStatus?:string;diagnostic:string;diagnosticCode?:string;retryWithCredentials?:boolean};
export type ShareCreateResult={operationId:string;status:'succeeded'|'failed'|'outcome_unknown';invitation?:string;diagnostic:string};
export type DocumentDeliveryInput={kind:'document_delivery';mountId:string;path:string;title:string;provider:'feishu'|'dingtalk';remoteId?:string;sourceHash:string};
export type McpArtifactBinding={mountId:string;path:string;changeId?:string;argumentPath:string[]};
export type McpTaskDeliveryBinding=McpArtifactBinding&{deliveryKind?:'single_file_text';projectCompleteness?:'not_asserted';runId:string;reportId:string;outputId:string;sourceHash:string;bindingHash:string;argsHash:string;contractHash:string;versionHash:string};
export type McpCallInput={kind:'mcp_call';tool:string;args:Record<string,unknown>;artifactBinding?:McpArtifactBinding;deliveryBinding?:McpTaskDeliveryBinding;prototypeProject?:McpPrototypeProjectLocator;prototypeDeliveryBinding?:McpPrototypeProjectBinding};
export type ExternalActionProposal={id:string;runId:string;conversationId:string;kind:'document_delivery'|'mcp_call';connectionId:string;target:string;userAuthorizationExcerpt:string;status:'pending'|'approved'|'executing'|'succeeded'|'failed'|'outcome_unknown'|'rejected';request:DocumentDeliveryInput|McpCallInput;createdAt:string;updatedAt:string;operationId?:string;receipt?:unknown;diagnostic?:string};
export type State={root:string;mounts:Mount[];conversations:Conversation[];changes:Change[];runs:Run[];connections:Connection[];model:{baseUrl:string;id:string;hasKey:boolean};models?:ModelEntry[];defaultModelId?:string;permissions?:PermissionSettings;pendingApprovals?:ApprovalRequest[]};
export type AppPreferences={qualityGateEnabled:boolean;forceQualityCheckBeforeDelivery:boolean;maxParallelTasks:number;maxParallelConcurrency:number;subAgentMaxDepth:number;subAgentMaxTasks:number;shareLockTtlMs:number;modelRouting:{strategy:'fixed'|'task_type'|'cost_aware'|'fallback';taskTypes:Record<string,string>};subAgentTools:string[];visionModelId?:string;visionAutoFallback?:boolean};
export type ContextSourceRef={mountId:string;path:string;contentHash:string;locator?:string;readAt:string;versionId?:string;hashKind?:'text'|'file';textExtraction?:import('./docx-read-identity.js').DocxTextExtraction};
export type ContextManifest={runId:string;workspaceRoot:string;mounts:Array<{id:string;path:string;write:boolean}>;workspaceRulesHash?:string;agentIndexReceipt?:AgentIndexReceipt;systemPromptHash?:string;skillDiscovery?:import('./skills.js').SkillDiscoveryReceipt;skillLoads?:import('./skills.js').SkillLoadReceipt[];imageReads?:import('./image-reading.js').ImageReadReceipt[];inputs?:import('./run-inputs.js').RunInputRecord[];runtimeStatus?:import('./runtime-status.js').RuntimeObservedStatus;sourceRefs?:ContextSourceRef[];truncations?:Array<{source:string;reason:string;limit:number}>;createdAt:string};
export type DeliveryRecord={id:string;runId:string;conversationId:string;artifactVersionHash?:string;preflightTrace?:DeliveryPreflightCheck[];target:string;kind:'document_delivery'|'mcp_call';status:string;operationId?:string;remoteId?:string;receipt?:unknown;diagnostic?:string;createdAt:string;updatedAt:string};

const safeId=z.string().trim().min(1).max(200).refine(value=>!/[\0\r\n]/.test(value),'ID contains invalid characters');
export const taskAcceptanceRecheckSchema=z.object({runId:safeId,expectedContractHash:z.string().regex(/^[a-f0-9]{64}$/i),expectedReportId:safeId.nullable()}).strict();
export type TaskAcceptanceRecheckInput=z.infer<typeof taskAcceptanceRecheckSchema>;
export const mcpArtifactBindingSchema=z.object({mountId:safeId,path:z.string().min(1).max(4000).refine(value=>!/[\0\r\n]/.test(value)),changeId:safeId.optional(),argumentPath:z.array(z.string().min(1).max(100).refine(value=>!['__proto__','constructor','prototype'].includes(value))).min(1).max(8)}).strict();
export const systemPromptContentSchema=z.string().trim().min(1).max(16000).refine(value=>!value.includes('\0'),'提示词不能包含空字符');
const directoryName=z.string().min(1).max(120).refine(value=>value===value.trim()&&!/[<>:"/\\|?*\x00-\x1f]/.test(value)&&!/[. ]$/.test(value)&&value!=='.'&&value!=='..'&&!/^(?:con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i.test(value),'目录名不合法');
export const projectTreeNodeSchema:z.ZodType<ProjectTreeNode>=z.lazy(()=>z.object({id:z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,119}$/),name:directoryName,role:z.enum(['resource','output','process']),children:z.array(projectTreeNodeSchema).max(200)}).strict());
export const projectTreeNodesSchema=z.array(projectTreeNodeSchema).min(3).max(200).superRefine((nodes,ctx)=>{
 let count=0;const ids=new Set<string>();
 const walk=(items:ProjectTreeNode[],depth:number,role?:ProjectTreeRole)=>{const names=new Set<string>();for(const node of items){count++;const name=node.name.toLowerCase();if(names.has(name)||ids.has(node.id)||depth>6||role&&node.role!==role)ctx.addIssue({code:'custom',message:'目录结构含重复名称/ID、跨分类节点或超过6层'});names.add(name);ids.add(node.id);walk(node.children,depth+1,node.role);}};
 walk(nodes,1);if(count>200)ctx.addIssue({code:'custom',message:'目录结构最多200个节点'});for(const role of ['resource','output','process'])if(nodes.filter(node=>node.role===role).length!==1)ctx.addIssue({code:'custom',message:'资源、成果和过程各需要一个根目录'});
});
export const workflowSourceSchema=z.object({mountId:safeId,path:z.string().min(1).max(4096).refine(value=>!/[\0\r\n]/.test(value),'Invalid source path'),artifactId:safeId.optional(),versionId:z.string().min(1).max(220).optional(),contentHash:z.string().regex(/^[a-f0-9]{64}$/i).optional(),locator:z.string().max(1000).optional()});
export const pmWorkflowSchema=z.object({kind:z.enum(pmWorkflowKinds),sources:z.array(workflowSourceSchema).max(12),template:workflowSourceSchema.optional()}).superRefine((value,ctx)=>{if(['meeting','prototype_to_prd','test_cases'].includes(value.kind)&&!value.sources.length)ctx.addIssue({code:'custom',message:'此工作流需要至少一份真实资料'});if(value.kind==='change_summary'&&value.sources.length!==2)ctx.addIssue({code:'custom',message:'变更说明需要旧、新两个真实版本'});if(value.template&&(value.kind!=='prd'||! /\.(?:docx|md|markdown)$/i.test(value.template.path)||value.template.versionId&&value.template.versionId!=='current'))ctx.addIssue({code:'custom',path:['template'],message:'PRD模板请选择当前Word或Markdown文件'});});

const command=z.string().max(2048).refine(value=>!/[\0\r\n]/.test(value),'Command contains invalid characters').refine(value=>!/[.](?:cmd|bat|ps1)$/i.test(value),'不支持脚本包装器，请选择可直接执行的 .exe');

const httpUrl=z.string().url().max(4096).refine(value=>/^https?:\/\//i.test(value),'鍙厑璁?HTTP 鎴?HTTPS 鍦板潃').refine(value=>{try{const parsed=new URL(value);return!parsed.username&&!parsed.password;}catch{return false;}},'URL 涓嶈兘鍖呭惈鐢ㄦ埛鍚嶆垨瀵嗙爜').refine(value=>{try{const parsed=new URL(value);return![...parsed.searchParams.keys()].some(key=>/^(?:access_?token|api_?key|auth|authorization|client_?secret|credential|key|password|secret|signature|token)$/i.test(key));}catch{return false;}},'URL 鏌ヨ鍙傛暟涓嶈兘鎼哄甫鍑嵁');
const tokenLimit=z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const validateModelLimits=(value:{contextWindow?:number|null;maxTokens?:number|null},ctx:z.RefinementCtx)=>{if(value.contextWindow!=null&&value.maxTokens!=null&&value.maxTokens>=value.contextWindow)ctx.addIssue({code:'custom',path:['maxTokens'],message:'最大输出必须小于上下文窗口'});};
export const modelEntrySchema=z.object({
 id:safeId,
 provider:z.string().trim().min(1).max(100),
 name:z.string().trim().min(1).max(100),
 baseUrl:httpUrl,
 proxyUrl:modelProxyUrlSchema.optional(),
 modelId:z.string().trim().min(1).max(200),
 protocol:z.enum(modelProtocols).default('openai-completions'),
 hasKey:z.boolean(),
 supportsVision:z.boolean().optional(),
 contextWindow:tokenLimit.optional(),
 maxTokens:tokenLimit.optional(),
 createdAt:z.string().datetime().optional(),
 updatedAt:z.string().datetime().optional(),
}).strict().superRefine(validateModelLimits);
export const permissionSettingsSchema=z.object({
 workspace_read:z.enum(['ask','allow','deny']),
 web_read:z.enum(['ask','allow','deny']),
 connection_config:z.enum(['ask','allow','deny']),
 process_execute:z.enum(['ask','allow','deny']),
 external_action:z.enum(['ask','allow','deny']),
 artifact_write:z.enum(['ask','allow','deny']),
}).strict();
export const connectionSchema=z.object({
 ...mcpConnectionFields,
 id:safeId,
 name:z.string().trim().min(1).max(100),
 kind:z.enum(['mcp','cli']),
 command,
 args:z.array(z.string().max(4000)).max(100),
 url:httpUrl.optional(),
 enabled:z.boolean(),
 provider:z.string().trim().min(1).max(100).optional(),
 source:z.enum(['manual','discovered']).optional(),
 discoveryId:z.string().max(300).optional(),
 executableVersion:z.string().max(2000).optional(),
 capabilities:z.array(z.string().trim().min(1).max(200)).max(2000).optional(),
 available:z.boolean().optional(),
 diagnostic:z.string().max(2000).optional(),
 healthStatus:z.enum(['unknown','healthy','degraded','failed']).optional(),
 lastCheckedAt:z.string().datetime().optional(),
 healthSummary:z.string().max(2000).optional(),
 capabilityHash:z.string().regex(/^[a-f0-9]{64}$/i).optional(),
}).superRefine((value,ctx)=>{
  if(value.kind==='cli'&&!value.command.trim()&&(value.available!==false||value.enabled))ctx.addIssue({code:'custom',path:['command'],message:'CLI executable is required; unavailable candidates cannot be enabled'});
  if(value.kind==='mcp'&&!value.mcpPublisher&&!value.url&&!value.command.trim())ctx.addIssue({code:'custom',path:['command'],message:'MCP connection needs a URL or executable'});
  if(value.kind==='mcp'&&value.url&&value.command.trim())ctx.addIssue({code:'custom',path:['url'],message:'MCP URL and stdio command are mutually exclusive'});
  if(value.mcpPublisher&&(value.kind!=='mcp'||value.url||value.command.trim()||value.args.length||value.mcpAuth==='oauth'||value.mcpPreset||value.mcpNetworkAllowedOrigins?.length))ctx.addIssue({code:'custom',path:['mcpPublisher'],message:'Private publisher uses a fixed host transport and API credential only'});
  if(value.mcpAuth==='oauth'&&(value.kind!=='mcp'||!value.url))ctx.addIssue({code:'custom',path:['mcpAuth'],message:'OAuth requires an HTTP MCP connection'});
  if(value.mcpPreset){try{const url=new URL(value.url??'');const valid=value.kind==='mcp'&&value.mcpAuth==='oauth'&&(value.mcpPreset==='vercel'?url.href==='https://mcp.vercel.com/':url.origin==='https://mcp.supabase.com'&&url.pathname==='/mcp'&&[...url.searchParams.keys()].every(key=>['project_ref','read_only','features'].includes(key)));if(!valid)throw Error();}catch{ctx.addIssue({code:'custom',path:['mcpPreset'],message:'Official MCP preset endpoint or authentication does not match'});}}
});
const mcpArgs=z.record(z.string().max(200),z.unknown()).superRefine((value,ctx)=>{
 let json='';try{json=JSON.stringify(value);}catch{ctx.addIssue({code:'custom',message:'鍙傛暟蹇呴』鍙簭鍒楀寲'});return;}
 if(json.length>100_000)ctx.addIssue({code:'too_big',origin:'string',maximum:100_000,inclusive:true,message:'鍙傛暟瓒呰繃 100 KB'});
 const visit=(item:unknown,depth:number):boolean=>{
  if(depth>10)return false;
  if(Array.isArray(item))return item.length<=1000&&item.every(v=>visit(v,depth+1));
  if(item&&typeof item==='object')return Object.entries(item).every(([key,v])=>!['__proto__','prototype','constructor'].includes(key)&&visit(v,depth+1));
  return typeof item!=='string'||item.length<=50_000;
 };
  if(!visit(value,0))ctx.addIssue({code:'custom',message:'MCP arguments are too deeply nested, too large, or contain unsafe fields'});
});

export const requestSchema=z.discriminatedUnion('type',[
 runInputEnqueueSchema.extend({type:z.literal('runInputEnqueue')}),
 runInputClearSchema.extend({type:z.literal('runInputClearQueued')}),
 runInputMutateSchema.safeExtend({type:z.literal('runInputMutate')}),
 z.object({type:z.literal('runPermissionModeSet'),conversationId:z.string().min(1).max(200),runId:z.string().min(1).max(200).optional(),permissionMode:z.enum(['standard','accept_edits','full_access'])}).strict(),
 ...projectCatalogRequestSchemas,
 ...knowledgeDesktopRequestSchemas,
 ...piPackageRequestSchemas,
  z.object({type:z.literal('state')}),
  z.object({type:z.literal('eventReplay'),streamId:safeId,afterSequence:z.number().int().nonnegative().default(0),limit:z.number().int().min(1).max(1000).default(500)}),
  z.object({type:z.literal('deliveryRecords'),runId:safeId.optional()}),
  z.object({type:z.literal('contextManifest'),runId:safeId}),
  z.object({type:z.literal('runCheckpoint'),runId:safeId}),
  z.object({type:z.literal('taskAcceptanceGet'),runId:safeId}).strict(),
  taskAcceptanceRecheckSchema.extend({type:z.literal('taskAcceptanceRecheck')}),
  ...taskDeliveryRequestSchemas,
  taskAcceptanceOptionalSchema.extend({type:z.literal('taskAcceptanceOptional')}),
  z.discriminatedUnion('action',[globalSkillsRequestSchema.options[0].extend({type:z.literal('globalSkills')}),...globalSkillsRequestSchema.options.slice(1).map(schema=>schema.extend({type:z.literal('globalSkills')}))]),
  z.object({type:z.literal('globalSkillsChooseFolder')}).strict(),
  z.object({type:z.literal('skillCommands')}).strict(),
  z.object({type:z.literal('appPreferences'),patch:z.record(z.string(),z.unknown()).optional()}),
  z.object({type:z.literal('systemPromptGet')}).strict(),
  z.object({type:z.literal('systemPromptSave'),content:systemPromptContentSchema}).strict(),
  z.object({type:z.literal('systemPromptReset')}).strict(),
  z.object({type:z.literal('projectTreeGet')}).strict(),
  z.object({type:z.literal('projectTreeSave'),workspaceId:safeId,expectedRevision:z.number().int().min(0),nodes:projectTreeNodesSchema}).strict(),
  z.object({type:z.literal('projectTreeApply'),workspaceId:safeId,expectedRevision:z.number().int().min(0)}).strict(),
  z.object({type:z.literal('visionAttach'),path:z.string().min(1).max(32767)}),
  z.object({type:z.literal('visionAnalyze'),path:z.string().min(1).max(32767),prompt:z.string().max(5000).optional(),modelEntryId:safeId.optional()}),
  z.object({type:z.literal('windowTheme'),theme:z.enum(['reference','graphite','sand'])}),
  z.object({type:z.literal('workspace'),path:z.string().max(32767).optional()}),
  z.object({type:z.literal('projects')}),
  z.object({type:z.literal('project'),path:z.string().max(32767).optional(),id:safeId.optional()}),
  z.object({type:z.literal('projectDefault'),path:z.string().max(32767).optional(),id:safeId.optional()}),
  z.object({type:z.literal('projectRename'),id:safeId,name:z.string().trim().min(1).max(120).refine(value=>!/[\0\r\n]/.test(value),'Invalid project display name')}),
  z.object({type:z.literal('projectPin'),id:safeId,pinned:z.boolean()}),
  z.object({type:z.literal('projectRemove'),id:safeId}),
  z.object({type:z.literal('projectReveal'),id:safeId}),
  z.object({type:z.literal('modelThinkingCapability'),modelEntryId:safeId.optional(),taskType:z.enum(['research','analysis','writing','coding','review','orchestration','general']).optional(),refresh:z.boolean().optional()}),
  z.object({type:z.literal('mount'),path:z.string().max(32767).optional(),write:z.boolean().default(false)}),
 z.object({type:z.literal('mountAccess'),id:safeId,write:z.boolean(),enabled:z.boolean()}),
 z.object({type:z.literal('conversation'),id:safeId.optional(),title:z.string().trim().min(1).max(120).optional(),archived:z.boolean().optional()}),
 z.object({type:z.literal('conversationDelete'),id:safeId}),
  z.object({type:z.literal('send'),id:safeId,text:z.string().min(1).max(50000),mode:z.enum(['plan','build']).default('build'),permissionMode:z.enum(['standard','accept_edits','full_access']).default('standard'),modelEntryId:safeId.optional(),thinkingLevel:z.enum(thinkingLevels).nullable().optional(),taskType:z.enum(['research','analysis','writing','coding','review','orchestration','general']).optional(),attachmentIds:z.array(safeId).max(8).optional(),workflow:pmWorkflowSchema.optional()}),
  z.object({type:z.literal('planDraft'),id:safeId,selectedOptionIds:z.array(safeId).max(20),customText:z.string().max(50000)}),
  z.object({type:z.literal('planConfirm'),id:safeId,selectedOptionIds:z.array(safeId).max(20),customText:z.string().max(50000),permissionMode:z.enum(['standard','accept_edits','full_access']),modelEntryId:safeId.optional(),thinkingLevel:z.enum(thinkingLevels).nullable().optional()}),
  z.object({type:z.literal('resume'),id:safeId,freshContext:freshContextResumeSchema.optional()}).strict(),
 z.object({type:z.literal('runRecoveryGet'),runId:safeId}).strict(),
 reconcileRunOperationSchema.safeExtend({type:z.literal('runRecoveryReconcile')}),
 z.object({type:z.literal('cancel'),id:safeId}),
  z.object({type:z.literal('files'),query:z.string().max(500).default('')}),
   z.object({type:z.literal('importFiles'),files:z.array(z.string().min(1).max(32767)).max(200).optional(),paths:z.array(z.string().min(1).max(32767)).max(200).optional(),category:z.enum(['reference','resource','prototype','output','process','knowledge','参考资料','资源','原型','产出材料','过程文件','产品知识库']).optional(),target:z.object({mountId:safeId,path:z.string().max(4096).refine(value=>!/[\0\r\n]/.test(value),'Invalid directory')}).strict().optional()}).superRefine((value,ctx)=>{if(!(value.files?.length||value.paths?.length))ctx.addIssue({code:'custom',message:'至少提供一个待导入文件路径'});}),
 z.object({type:z.literal('read'),mountId:safeId,path:z.string().min(1).max(32767)}),
 z.object({type:z.literal('fileProtection'),mountId:safeId,path:z.string().max(32767)}).strict(),
 z.object({type:z.literal('copyForProcessing'),mountId:safeId,path:z.string().min(1).max(32767),targetMountId:safeId.optional(),directory:z.string().max(32767).optional()}).strict(),
 z.object({type:z.literal('processProcessingCopy'),id:safeId,operation:z.enum(['extract_text','script']),script:z.string().min(1).max(65536).optional()}).strict().superRefine((value,ctx)=>{if(value.operation==='script'&&!value.script?.trim())ctx.addIssue({code:'custom',path:['script'],message:'隔离脚本处理需要非空脚本正文'});if(value.operation==='extract_text'&&value.script!==undefined)ctx.addIssue({code:'custom',path:['script'],message:'内置文本提取不接受脚本正文'});}),
 z.object({type:z.literal('readDocument'),mountId:safeId,path:z.string().min(1).max(32767)}),
 z.object({type:z.literal('apply'),id:safeId,source:z.literal('ui').optional()}),
 z.object({type:z.literal('preview'),mountId:safeId,path:z.string().min(1).max(32767)}),
 z.object({type:z.literal('reveal'),mountId:safeId,path:z.string().min(1).max(32767)}),
 z.object({type:z.literal('changeReveal'),id:safeId}).strict(),
 z.object({type:z.literal('model'),baseUrl:httpUrl,id:z.string().trim().min(1).max(200),key:z.string().max(20000).optional()}),
 z.object({type:z.literal('testModel')}),
 z.object({type:z.literal('models')}),
 z.object({type:z.literal('modelUpsert'),model:z.object({id:safeId.optional(),provider:z.string().trim().min(1).max(100),name:z.string().trim().min(1).max(100),baseUrl:httpUrl,proxyUrl:modelProxyUrlSchema.nullable().optional(),modelId:z.string().trim().min(1).max(200),protocol:z.enum(modelProtocols).default('openai-completions'),supportsVision:z.boolean().optional(),contextWindow:tokenLimit.nullable().optional(),maxTokens:tokenLimit.nullable().optional()}).superRefine(validateModelLimits),key:z.string().max(20000).optional()}),
 z.object({type:z.literal('modelRemove'),id:safeId}),
 z.object({type:z.literal('modelDefault'),id:safeId}),
 z.object({type:z.literal('modelTest'),id:safeId}),
 z.object({type:z.literal('connection'),connection:connectionSchema}),
 ...mcpRequestSchemas,
 z.object({type:z.literal('connectionRemove'),id:safeId}),
 z.object({type:z.literal('testConnection'),id:safeId}),
 z.object({type:z.literal('connectionDiscover')}),
 z.object({type:z.literal('connectionSelectExecutable')}),
 z.object({type:z.literal('deliver'),connectionId:safeId,mountId:safeId,path:z.string().min(1).max(32767),title:z.string().trim().min(1).max(200),provider:z.enum(['dingtalk','feishu']),remoteId:z.string().trim().max(2000).optional(),sourceHash:z.string().regex(/^[a-f0-9]{64}$/i),dryRun:z.boolean().default(true)}),
 z.object({type:z.literal('deliveryPreflight'),connectionId:safeId,mountId:safeId,path:z.string().min(1).max(32767),title:z.string().trim().min(1).max(200),provider:z.enum(['dingtalk','feishu']),remoteId:z.string().trim().max(2000).optional(),sourceHash:z.string().regex(/^[a-f0-9]{64}$/i)}),
 z.object({type:z.literal('deliveryChecklist'),connectionId:safeId,mountId:safeId,path:z.string().min(1).max(32767),title:z.string().trim().min(1).max(200),provider:z.enum(['dingtalk','feishu']),remoteId:z.string().trim().max(2000).optional(),sourceHash:z.string().regex(/^[a-f0-9]{64}$/i),patch:z.object({contentReviewed:z.boolean().optional(),destinationConfirmed:z.boolean().optional()}).strict().optional()}),
 z.object({type:z.literal('mcpCall'),connectionId:safeId,tool:z.string().regex(/^[\w./:-]{1,200}$/),args:mcpArgs,artifactBinding:mcpArtifactBindingSchema.optional(),prototypeProject:mcpPrototypeProjectLocatorSchema.optional()}).strict(),
 z.object({type:z.literal('externalActions'),conversationId:safeId.optional()}),
 z.object({type:z.literal('externalAction'),id:safeId,decision:z.enum(['approve','reject']),input:z.record(z.string(),z.unknown()).optional(),reason:z.string().max(2000).optional()}),
 z.object({type:z.literal('permissionSet'),capability:z.enum(permissionCapabilities),decision:z.enum(['ask','allow','deny'])}),
 z.object({type:z.literal('pendingApprovals'),conversationId:safeId.optional()}),
 z.object({type:z.literal('approvalResolve'),id:safeId,decision:z.enum(['allow_once','allow','deny']),reason:z.string().trim().max(2000).optional()}),
 z.object({type:z.literal('operations'),limit:z.number().int().min(1).max(200).default(50)}),
  z.object({type:z.literal('productRecords')}),
  z.object({type:z.literal('reviewIssueTransition'),reviewId:safeId,issueId:safeId,status:z.enum(['open','accepted','rejected','needs_clarification','resolved']),note:z.string().trim().max(10000).optional(),clarificationQuestion:z.string().trim().max(10000).optional(),resolution:z.string().trim().max(10000).optional(),expectedRevision:z.number().int().nonnegative().optional()}),
  z.object({type:z.literal('decisionCenter')}),
  prototypeAcceptanceGetSchema.safeExtend({type:z.literal('prototypeAcceptanceGet')}),
  prototypeAcceptanceDefinitionSchema.safeExtend({type:z.literal('prototypeAcceptanceSave'),mode:z.enum(['build','plan'])}),
  prototypeAcceptanceRunSchema.safeExtend({type:z.literal('prototypeAcceptanceRun')}),
  prototypeAcceptanceRequiredSchema.safeExtend({type:z.literal('prototypeAcceptanceRequired')}),
  prototypeAcceptanceCancelSchema.extend({type:z.literal('prototypeAcceptanceCancel')}),
  prototypeAcceptanceScreenshotSchema.extend({type:z.literal('prototypeAcceptanceScreenshot')}),
  businessRuleCheckInputSchema.safeExtend({type:z.literal('businessRuleCheck')}),
  z.object({type:z.literal('requirementQuestionAnswer'),requirementId:safeId,conversationId:safeId,answers:z.array(z.object({questionId:safeId,answer:z.string().trim().min(1).max(20000)}).strict()).min(1).max(50),expectedRevision:z.number().int().nonnegative().optional()}),
  z.object({type:z.literal('decisionCreate'),decision:z.object({kind:z.enum(['assumption','confirmed_fact','design_tradeoff','delivery_blocker','decision']).default('decision'),title:z.string().trim().min(1).max(500),description:z.string().trim().min(1).max(20000),sourceRefs:z.array(z.object({kind:z.enum(['conversation','file','requirement','artifact','review','run','manual']),id:safeId,label:z.string().trim().max(500).optional(),path:z.string().trim().max(32767).optional()}).strict()).min(1).max(50),requirementIds:z.array(safeId).max(200).default([]),artifactIds:z.array(safeId).max(200).default([]),conversationIds:z.array(safeId).max(200).default([]),impact:z.string().trim().min(1).max(10000),nextAction:z.string().trim().min(1).max(10000),confirmedBy:z.string().trim().max(120).optional()}).strict(),expectedRevision:z.number().int().nonnegative().optional()}),
  z.object({type:z.literal('decisionTransition'),id:safeId,status:z.enum(['pending','confirmed','rejected','needs_verification','superseded']),actor:z.string().trim().max(120).optional(),note:z.string().trim().max(10000).optional(),expectedRevision:z.number().int().nonnegative().optional()}),
 z.object({type:z.literal('templateWorkflow')}),
 z.object({type:z.literal('applyTemplateMigrationGroup'),id:safeId}),
 z.object({type:z.literal('applyWorkspaceRuleChange'),id:safeId}),
 z.object({type:z.literal('flowPreview'),mountId:safeId,path:z.string().min(1).max(32767)}),
 z.object({type:z.literal('qualityCheck'),artifactId:safeId.optional(),mountId:safeId.optional(),path:z.string().min(1).max(32767).optional(),versionId:z.string().min(1).max(220).optional()}).superRefine((value,ctx)=>{if(!value.artifactId&&(!value.mountId||!value.path))ctx.addIssue({code:'custom',message:'质量检查需要 artifactId 或 mountId/path'});}),
 z.object({type:z.literal('qualityHistory'),artifactId:safeId.optional(),mountId:safeId.optional(),path:z.string().min(1).max(32767).optional(),limit:z.number().int().min(1).max(200).default(30)}).superRefine((value,ctx)=>{if(!value.artifactId&&(!value.mountId||!value.path))ctx.addIssue({code:'custom',message:'质量历史需要 artifactId 或 mountId/path'});}),
 z.object({type:z.literal('artifactImpactGraph'),artifactId:safeId,direction:z.enum(['outgoing','incoming','both']).default('both'),includeCandidates:z.boolean().default(true),maxDepth:z.number().int().min(1).max(20).default(5)}),
 z.object({type:z.literal('artifactDiff'),artifactId:safeId,fromVersionId:z.string().min(1).max(220),toVersionId:z.string().min(1).max(220).optional()}),
 z.object({type:z.literal('versions'),mountId:safeId,path:z.string().min(1).max(32767)}),
 z.object({type:z.literal('versionContent'),mountId:safeId,path:z.string().min(1).max(32767),versionId:z.string().min(1).max(220)}),
 z.object({type:z.literal('restore'),mountId:safeId,path:z.string().min(1).max(32767),versionId:z.string().min(1).max(220),conversationId:safeId}),
 z.object({type:z.literal('export'),mountId:safeId,path:z.string().min(1).max(32767),format:z.enum(['copy','docx','zip','test_cases_markdown','test_cases_xlsx']),changeId:safeId.optional(),expectedContentHash:z.string().regex(/^[a-f0-9]{64}$/i).optional()}),
 z.object({type:z.literal('shareConnect'),invitation:z.string().min(1).max(20000),drive:z.string().regex(/^[D-Z]:$/),authentication:z.discriminatedUnion('mode',[z.object({mode:z.literal('current-user')}),z.object({mode:z.literal('username-password'),username:z.string().trim().min(1).max(256),password:z.string().min(1).max(1024)})]).default({mode:'current-user'})}),
 z.object({type:z.literal('shareInvite'),host:z.string().trim().min(1).max(255),shareName:z.string().trim().min(1).max(80)}),
 z.object({type:z.literal('shareSetup')}),
 z.object({type:z.literal('shareSelectFolder')}),
 z.object({type:z.literal('shareCreate'),path:z.string().max(32767).optional(),shareName:z.string().regex(/^[A-Za-z0-9_-]{1,50}$/),account:z.string().trim().min(1).max(200).optional(),access:z.literal('read_write').optional()}),
 shareDisconnectSchema,
 shareReconnectSchema,
 sharePermissionInspectSchema,
 sharePermissionUpdateSchema,
 shareStopSchema,
 z.object({type:z.literal('subAgentAuthorize'),parentRunId:safeId,tool:z.string().min(1).max(100),capability:z.enum(permissionCapabilities),mountId:safeId.optional(),mode:z.enum(['plan','build']),permissionMode:z.enum(['standard','accept_edits','full_access']),capabilities:permissionSettingsSchema.partial().optional()}),
 z.object({type:z.literal('subAgentRun'),parentRunId:safeId,tool:z.enum(['read_file','search_files','read_workspace_rules','list_artifact_versions','list_product_records','query_artifact_impact','read_web_page','list_connections']),capability:z.enum(permissionCapabilities),mountId:safeId.optional(),input:z.record(z.string(),z.unknown()).default({})}),
 z.object({type:z.literal('parallelRun'),parentRunId:safeId,tasks:z.array(
   z.object({id:safeId,tool:z.enum(['read_file','search_files','read_workspace_rules','list_artifact_versions','list_product_records','query_artifact_impact','read_web_page','list_connections']),capability:z.enum(permissionCapabilities),mountId:safeId.optional(),input:z.record(z.string(),z.unknown()).default({})}).strict()
  ).min(1).max(20)}),
 z.object({type:z.literal('modelRoute'),strategy:z.enum(['fixed','task_type','cost_aware','fallback']).optional(),preferredEntryId:safeId.optional(),taskType:z.enum(['research','analysis','writing','coding','review','orchestration','general']),preferredModelId:safeId.optional(),minContextWindow:z.number().int().positive().optional(),requiresReasoning:z.boolean().optional(),budget:z.number().nonnegative().optional(),fallbackModelIds:z.array(safeId).max(20).optional()}),
 z.object({type:z.literal('shareConflictDiagnose'),resourceId:safeId,path:z.string().max(32767).optional(),expectedVersion:z.string().max(200).optional(),actualVersion:z.string().max(200).optional()}),
 z.object({type:z.literal('shareLock'),resourceId:safeId,path:z.string().max(32767).optional(),ownerId:safeId,mode:z.enum(['read','write']).default('write'),version:z.string().max(200).optional(),ttlMs:z.number().int().min(1000).max(86_400_000).optional()}),
 z.object({type:z.literal('shareUnlock'),lockId:safeId,ownerId:safeId}),
 z.object({type:z.literal('shareLocks')}),
 z.object({type:z.literal('openFolder')}),
]);
export type Request=z.infer<typeof requestSchema>;
/**
 * Host events are durable enough to bridge a renderer reconnect.  The
 * sequence is scoped to streamId; callers that predate the durable event log
 * may still emit the legacy shape and the host will fill these fields in.
 */
export type Event={runtimeStatus?:import('./runtime-status.js').RuntimeObservedStatus;type:'state'|'delta'|'status';runId?:string;text?:string;eventId?:string;streamId?:string;sequence?:number;occurredAt?:string};

/** Phase 3 orchestration contracts. These are host-side contracts; model text
 * and untrusted task input never widen these allowlists or permissions. */
export const subAgentToolWhitelist=['read_file','search_files','read_workspace_rules','list_artifact_versions','list_product_records','query_artifact_impact','read_web_page','list_connections'] as const;
export type SubAgentToolName=(typeof subAgentToolWhitelist)[number];
export type SubAgentPermissionContext={
 parentRunId:string;
 mode:AgentMode;
 permissionMode:PermissionMode;
 capabilities:Partial<PermissionSettings>;
 mountIds?:string[];
};
export type SubAgentCallRequest={tool:SubAgentToolName|string;input:Record<string,unknown>;capability:PermissionCapability;mountId?:string;parentRunId:string;subAgentId?:string};
export type SubAgentCallDecision={allowed:boolean;code:'ALLOWED'|'SUB_AGENT_TOOL_DENIED'|'SUB_AGENT_PERMISSION_DENIED'|'SUB_AGENT_SCOPE_DENIED'|'SUB_AGENT_LIMIT_REACHED'|'PLAN_TOOL_DENIED';reason:string;inheritedFrom?:string};
export type ModelTaskType='research'|'analysis'|'writing'|'coding'|'review'|'orchestration'|'general';
export type ModelRouteStrategy='fixed'|'task_type'|'cost_aware'|'fallback';
export type ModelRouteCandidate={modelId:string;provider:string;taskTypes?:ModelTaskType[];priority?:number;costPer1k?:number;contextWindow?:number;reasoning?:'basic'|'advanced';available?:boolean};
export type ModelRouteRequest={strategy:ModelRouteStrategy;taskType:ModelTaskType;preferredModelId?:string;minContextWindow?:number;requiresReasoning?:boolean;budget?:number;fallbackModelIds?:string[]};
export type ModelRouteDecision={modelId:string;provider:string;strategy:ModelRouteStrategy;reason:string;fallbackUsed:boolean};
export type ParallelTask<T=unknown>={id:string;run:(signal:AbortSignal)=>Promise<T>};
export type ParallelTaskOptions={maxTasks?:number;maxConcurrency?:number;taskTimeoutMs?:number;signal?:AbortSignal};
export type ParallelTaskResult<T=unknown>={id:string;status:'succeeded'|'failed'|'cancelled'|'timed_out';value?:T;error?:string;durationMs:number};
export type ShareResourceRef={resourceId:string;path?:string;version?:string};
export type ShareLock={id:string;resource:ShareResourceRef;ownerId:string;acquiredAt:string;expiresAt:string;mode:'read'|'write'};
export type ShareConflictDiagnostic={code:'LOCK_HELD'|'VERSION_CONFLICT'|'TARGET_UNAVAILABLE'|'PERMISSION_DENIED'|'NO_CONFLICT';resource:ShareResourceRef;ownerId?:string;lockId?:string;expectedVersion?:string;actualVersion?:string;message:string;retryable:boolean};




