import {z} from 'zod';

/** File-format filter only; callers must retain scope, authorization and version guards. */
export function isPrototypeSnapshotPath(file:string){return /\.(html?|css|js|mjs|json|svg|png|jpe?g|gif|webp|woff2?|ttf|ico)$/i.test(file);}

export const PROTOTYPE_ACCEPTANCE_LIMITS={cases:10,stepsPerCase:20,totalSteps:100,timeoutMs:60000,files:100,bytes:16*1024*1024,screenshotBytes:2*1024*1024,screenshotsBytes:10*1024*1024} as const;
export const PROTOTYPE_ACCEPTANCE_NOTICE='执行结果仅说明当前版本的具体 DOM 断言表现，不能确认业务规则正确或已获授权。targetState=current仅表示入口及显式依赖当前可核验，不表示规格来源有效或验收通过；执行仍核对来源版本和权限。用例来源核对引用文本版本；若来自表格提取，仍需另行核对原始表格的最新依据。';
const id=z.string().trim().min(1).max(200),hash=z.string().regex(/^[a-f0-9]{64}$/i);
export const prototypeRelativePathSchema=z.string().trim().min(1).max(4096).refine(value=>!value.includes(':')&&!/[\0\r\n?#]/.test(value)&&!value.replaceAll('\\','/').startsWith('/')&&!value.replaceAll('\\','/').split('/').includes('..'),'须为项目内相对文件路径');
const selector=z.string().min(1).max(200),value=z.string().max(2000);
export const prototypeViewportSchema=z.object({width:z.number().int().min(320).max(3840),height:z.number().int().min(240).max(2160)}).strict().describe('用例的CSS像素视口；例如移动端390×844，桌面1440×900。省略保留既有默认浏览器尺寸。');
const actionStep=z.discriminatedUnion('action',[
 z.object({action:z.literal('click'),selector}).strict(),
 z.object({action:z.literal('fill'),selector,value}).strict(),
 z.object({action:z.literal('select'),selector,value}).strict(),
 z.object({action:z.literal('press'),selector,key:z.enum(['Enter','Tab','Escape','Space'])}).strict(),
]);
const assertionStep=z.discriminatedUnion('assertion',[
 z.object({action:z.literal('assert'),assertion:z.literal('visible'),selector,expected:z.boolean()}).strict(),
 z.object({action:z.literal('assert'),assertion:z.literal('readonly'),selector,expected:z.boolean()}).strict(),
 z.object({action:z.literal('assert'),assertion:z.literal('checked'),selector,expected:z.boolean()}).strict(),
 z.object({action:z.literal('assert'),assertion:z.literal('enabled'),selector,expected:z.boolean()}).strict(),
 z.object({action:z.literal('assert'),assertion:z.literal('text'),selector,expected:value,match:z.enum(['equals','contains']).default('equals')}).strict(),
 z.object({action:z.literal('assert'),assertion:z.literal('value'),selector,expected:value,match:z.enum(['equals','contains']).default('equals')}).strict(),
 z.object({action:z.literal('assert'),assertion:z.literal('count'),selector,expected:z.number().int().min(0).max(10000)}).strict(),
 z.object({action:z.literal('assert'),assertion:z.literal('url'),expected:z.string().min(1).max(4096).refine(v=>!v.includes(':')&&!v.startsWith('//')&&!/[\0\r\n]/.test(v),'只允许相对路径及hash')}).strict(),
 z.object({action:z.literal('assert'),assertion:z.literal('no-horizontal-overflow'),selector:selector.optional().describe('省略检查页面整体；提供选择器检查唯一容器的scrollWidth/clientWidth，允许1 CSS像素舍入差。')}).strict(),
 z.object({action:z.literal('assert'),assertion:z.literal('min-target-size'),selector,minPixels:z.number().int().min(1).max(512).default(44).describe('唯一可见目标的边界框宽和高均须至少达到此CSS像素值，默认44；不等于完整可访问性认证。')}).strict(),
]);
export const prototypeStepSchema=z.union([actionStep,assertionStep]);
export const prototypeAcceptanceCaseSchema=z.object({id,title:z.string().trim().min(1).max(300),viewport:prototypeViewportSchema.optional(),expectedDescription:z.string().max(2000).optional(),constraintIds:z.array(id).max(20).optional(),requirementId:id.optional(),steps:z.array(prototypeStepSchema).min(1).max(PROTOTYPE_ACCEPTANCE_LIMITS.stepsPerCase)}).strict().refine(v=>v.steps.some(step=>step.action==='assert'),'每个用例至少一条断言');
export const prototypeDraftReferenceSchema=z.object({changeId:id.describe('宿主最新草稿回执的changeId；不是specId、outputId或artifactId'),expectedContentHash:hash.describe('该pending当前内容的SHA-256，复制宿主最新contentHash；不得用占位值或猜测'),parentRunId:id.optional().describe('该草稿实际所属Run；依赖省略时使用入口的parentRunId，合法续作不得猜成当前Run')}).strict();
export const prototypeDraftTargetSchema=prototypeDraftReferenceSchema.extend({parentRunId:id.describe('入口草稿的实际owner Run；优先复制宿主返回的target/runRequest'),dependencies:z.array(prototypeDraftReferenceSchema).max(PROTOTYPE_ACCEPTANCE_LIMITS.files-1).default([]).describe('仅显式引用当前HTML实际需要的授权Web资源草稿；无草稿依赖可省略，不能包含PRD或任意相邻文件')}).strict().refine(v=>new Set([v.changeId,...v.dependencies.map(d=>d.changeId)]).size===v.dependencies.length+1,'草稿引用ID须唯一');
export const prototypeTargetSchema=z.object({artifactId:id.optional().describe('仅已注册成果的真实artifact.id；验收specId与任务outputId不能填这里。pending优先省略，使用mountId/path+draft，无需先注册或应用'),mountId:id.optional().describe('HTML所在授权目录ID；与path一起提供'),path:prototypeRelativePathSchema.optional().describe('真实HTML相对路径；pending尚未落盘也可用，需同时提供draft'),draft:prototypeDraftTargetSchema.optional().describe('待应用HTML的精确草稿版本，优先复制define/get返回的宿主target/runRequest；不会保存正式文件')}).strict().refine(v=>Boolean(v.mountId)===Boolean(v.path)&&Boolean(v.artifactId||v.mountId),'须指定真实artifactId或mountId/path；pending使用mountId/path+draft，不填specId/outputId');
export const prototypeSourceInputSchema=z.object({mountId:id,path:prototypeRelativePathSchema,contentHash:hash.optional(),locator:z.string().trim().min(1).max(1000),quote:z.string().min(1).max(2000).optional(),startLine:z.number().int().min(1).optional(),endLine:z.number().int().min(1).optional()}).strict().refine(v=>!v.quote||(Boolean(v.startLine)&&Boolean(v.endLine)&&v.endLine!>=v.startLine!&&v.endLine!-v.startLine!<500),'原文摘录须有最多500行有效定位');
export const prototypeAcceptanceDefinitionSchema=prototypeTargetSchema.safeExtend({title:z.string().trim().min(1).max(300),cases:z.array(prototypeAcceptanceCaseSchema).min(1).max(PROTOTYPE_ACCEPTANCE_LIMITS.cases),sourceRefs:z.array(prototypeSourceInputSchema).max(20).default([]),expectedRevision:z.number().int().nonnegative().optional()}).refine(v=>new Set(v.cases.map(c=>c.id)).size===v.cases.length&&v.cases.reduce((n,c)=>n+c.steps.length,0)<=PROTOTYPE_ACCEPTANCE_LIMITS.totalSteps,'用例ID须唯一且总步骤最多100').refine(v=>JSON.stringify(v).length<=128000,'规格输入最多128000字符');
export const prototypeAcceptanceGetSchema=prototypeTargetSchema.safeExtend({limit:z.number().int().min(1).max(20).default(10)});
export const prototypeAcceptanceRunSchema=prototypeTargetSchema.safeExtend({mode:z.enum(['build','plan']),expectedRevision:z.number().int().nonnegative().optional()});
export const prototypeAcceptanceRequiredSchema=prototypeTargetSchema.safeExtend({required:z.boolean(),expectedRevision:z.number().int().nonnegative(),expectedSpecHash:hash,mode:z.enum(['build','plan'])});
export const prototypeAcceptanceCancelSchema=z.object({executionId:id}).strict();
export const prototypeAcceptanceScreenshotSchema=z.object({reportId:id,screenshotId:id}).strict();
export type PrototypeAcceptanceStep=z.infer<typeof prototypeStepSchema>;
export type PrototypeAcceptanceCase=z.infer<typeof prototypeAcceptanceCaseSchema>;
export type PrototypeTarget=z.infer<typeof prototypeTargetSchema>;
export type PrototypeAcceptanceDefinition=z.infer<typeof prototypeAcceptanceDefinitionSchema>;
export type PrototypeAcceptanceSource=z.infer<typeof prototypeSourceInputSchema>&{contentHash:string;readAt:string};
export type PrototypeAcceptanceSpec={id:string;workspaceId:string;mountId:string;path:string;artifactId?:string;revision:number;title:string;cases:PrototypeAcceptanceCase[];sourceRefs:PrototypeAcceptanceSource[];required:boolean;requiredSpecHash?:string;specHash:string;createdAt:string;updatedAt:string};
export type PrototypeAssertionStatus='not_run'|'passed'|'failed'|'unknown';
export type PrototypeStepResult={stepIndex:number;status:PrototypeAssertionStatus;observed?:string|number|boolean;measurements?:{width?:number;height?:number;scrollWidth?:number;availableWidth?:number;minPixels?:number};reason?:string};
export type PrototypeCaseResult={caseId:string;status:PrototypeAssertionStatus;steps:PrototypeStepResult[];viewport?:z.infer<typeof prototypeViewportSchema>;reason?:string};
export type PrototypeDraftTarget=z.infer<typeof prototypeDraftTargetSchema>;
export type PrototypeDependency={path:string;hash:string;bytes:number;draft?:{changeId:string;parentRunId:string;mountId:string;path:string;contentHash:string;baseHash:string|null}};
export type PrototypeCaptureMetadata={sourceWidth:number;sourceHeight:number;cssWidth:number;cssHeight:number;normalized:boolean};
export type PrototypeScreenshot={capture?:PrototypeCaptureMetadata;id:string;caseId:string;stepIndex?:number;mimeType:'image/png';bytes:number;contentHash?:string;expired?:boolean;draft?:PrototypeDraftTarget};
export type PrototypeAcceptanceEvidence={executionId:string;specId:string;specRevision:number;specHash:string;mountId:string;path:string;draft?:PrototypeDraftTarget;validationRunId?:string;authorizationHash?:string;caseOrigin?:'host_baseline';baselineSpecHash?:string;entryHash?:string;manifest:PrototypeDependency[];sourceRefs:PrototypeAcceptanceSource[];status:PrototypeAssertionStatus;cases:PrototypeCaseResult[];screenshots:PrototypeScreenshot[];startedAt:string;finishedAt:string;runnerVersion:string;notice:string;reason?:string;caseDefinitions?:PrototypeAcceptanceCase[];completionVersionState?:'current'|'stale'|'unavailable';completionVersionReasons?:string[]};
export type PrototypeExecutionState='running'|'cancelling'|'completed'|'cancelled'|'unknown';
export type PrototypeAcceptanceActive={executionId:string;status:PrototypeExecutionState;startedAt:string;specHash:string};
export type PrototypeAcceptanceReport={reportId:string;createdAt:string;evidence:PrototypeAcceptanceEvidence;versionState:'current'|'stale'|'unavailable';versionReasons:string[]};
export type PrototypeAcceptanceHistory=Omit<PrototypeAcceptanceReport,'evidence'>&{executionId:string;status:PrototypeAssertionStatus;specHash:string};
export type PrototypeAcceptanceView={workspaceId:string;mountId:string;path:string;spec?:PrototypeAcceptanceSpec;needsConfirmation:boolean;latestReport?:PrototypeAcceptanceReport;activeRun?:PrototypeAcceptanceActive;reports:PrototypeAcceptanceHistory[];notice:string;targetState?:'current'|'unavailable';targetReason?:string;target?:PrototypeTarget;runRequest?:{tool:'run_prototype_acceptance';input:PrototypeTarget}};
export type PrototypeAcceptanceRunReceipt={executionId:string;status:'running'};
export type PrototypeAcceptanceScreenshotView={mimeType:'image/png';dataUrl:string};
