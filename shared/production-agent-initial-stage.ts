import {z} from 'zod';
import {BUSINESS_BENCHMARK_BASE_PROMPT,type BenchmarkCase,type BenchmarkCheck} from './quality-evaluation.js';
import {prototypeStepSchema} from './prototype-acceptance.js';
export const PRODUCTION_PROTOTYPE_PROMPT_SUFFIX="\n独立浏览器验收将核对真实资料的编码只读与名称50字符规则，以及本地成功/重复/服务失败路径、失败保留输入、390×844/1280×800/1440×900视口。请提供可定位且能操作的控件，页面只保留业务内容和正常反馈，不添加制作/演示元说明；未实际接通的服务与模拟范围在Slash交付说明如实记录。禁止调用实际业务网络。后续修改须保留上一轮已确认的原型基线，不得弱化断言。";
const hash=z.string().regex(/^[a-f0-9]{64}$/),text=z.string().trim().min(1);
export const productionInitialCheckSchema=z.object({id:text,expected:text,basis:z.enum(['verified_source','test_requirement']),sourceIds:z.array(text),locator:text,evidenceKind:z.enum(['business_review','browser','runtime'])}).strict();
export const productionInitialStageSchema=z.object({schemaVersion:z.literal(1),stage:z.literal('initial'),executionProfile:z.enum(['base','prototype-checks']),profilePromptSha256:hash,promptSha256:hash,checksSha256:hash,checks:z.array(productionInitialCheckSchema).min(1).max(100),requiredArtifactRoles:z.array(z.enum(['prd','prototype','trace'])).max(3)}).strict();
export const productionInitialRoleBindingSchema=z.object({role:z.enum(['prd','prototype','trace']),artifactSha256:hash,locator:text.max(1000),quote:text.max(5000)}).strict();
export const productionInitialRoleBindingsSchema=z.array(productionInitialRoleBindingSchema).length(3).refine(value=>new Set(value.map(item=>item.role)).size===3);
export type ProductionInitialStage=z.infer<typeof productionInitialStageSchema>;
const native=prototypeStepSchema.refine(value=>value.action!=='assert'),actions=z.array(native).max(8),selector=z.string().min(1).max(200),fileEvidence=z.object({path:text,sha256:hash}).strict();
export const productionInitialBindingsSchema=z.object({schemaVersion:z.literal(1),artifactHash:hash,reviewed:z.literal(true),entrySteps:actions.default([]),selectors:z.object({code:selector,name:selector,submit:selector}).strict(),actions:z.object({name50:actions,name51:actions,submit:actions}).strict()}).strict().superRefine((binding,ctx)=>{
 for(const [key,length]of [['name50',50],['name51',51]] as const)if(!binding.actions[key].some(step=>step.action==='fill'&&step.selector===binding.selectors.name&&step.value==='甲'.repeat(length)))ctx.addIssue({code:'custom',message:'须实际输入原50/51字符边界'});
 if(!binding.actions.submit.some(step=>step.action==='click'&&step.selector===binding.selectors.submit)||!binding.actions.submit.some(step=>step.action==='fill'&&step.selector===binding.selectors.name&&step.value.length>0&&step.value.length<=50))ctx.addIssue({code:'custom',message:'基本操作须实际填写并点击原初提交'});
});
export const productionInitialBrowserSchema=z.object({schemaVersion:z.literal(1),caseId:text,runId:text,artifactHash:hash,observationEvidence:fileEvidence,observedAt:z.string().datetime(),bindingEvidence:fileEvidence,beforeEvidence:fileEvidence,probes:z.array(z.object({id:z.enum(['name50','name51','submit']),evidence:fileEvidence,screenshot:fileEvidence}).strict()).length(3),notice:text}).strict().refine(value=>JSON.stringify(value.probes.map(probe=>probe.id))===JSON.stringify(['name50','name51','submit']));
// Defined before prepare and before any model output. Later review requirements never rewrite these.
const initialChecks:BenchmarkCheck[]=[
 {id:'deliverables',expected:'首轮保存中文模块PRD、可交互自包含HTML及来源/落实对照三种完整成果内容；允许自行命名或PRD附录包含对照，不能仅回复、空壳或缺少任何一种内容。独立核对逐角色绑定实际文件hash、章节位置和原句。',basis:'test_requirement',sourceIds:[],locator:'首prompt：交付中文模块PRD、可交互自包含HTML和来源/落实对照；未规定文件名或独立文件数',evidenceKind:'business_review'},
 {id:'rules',expected:'机会门店编码自动计算且唯一，JHWD+10位顺序码，新增展示不可手填；名称手工录入50字符，命名说明/新增展示/后续不可变更按03机会门店原文，PRD与HTML一致。',basis:'verified_source',sourceIds:['fields'],locator:'03机会门店 D2/F2/I2/K2/O2/P2；D3/F3/G3/K3/O3/P3',evidenceKind:'business_review'},
 {id:'trace',expected:'按业务对象和阶段逐项对照资料，来源坐标可定位；资料没有给出的接口/规则在PRD或Slash说明保留待确认，不能编造已集成服务。',basis:'verified_source',sourceIds:['fields','flow','policy'],locator:'首prompt按业务对象/阶段核对字段；03机会门店表、新增流程和门店制度',evidenceKind:'business_review'},
 {id:'interaction',expected:'实际浏览器中核心表单可填写/提交并有正常有意义的业务反馈；编码展示不可手填、名称50字符规则可操作。留真实原初版本的操作、DOM和截图供独立核对。',basis:'test_requirement',sourceIds:['fields'],locator:'首prompt可交互HTML及03机会门店编码/名称规则；不添加后续失败位置、重复查看或三种状态要求',evidenceKind:'browser'},
 {id:'business-ui',expected:'页面呈现业务内容和正常操作反馈，无制作注释、演示标签、未接通接口等元说明；模拟/未集成范围如实留在PRD或Slash交付说明。需看真实页面截图与可见内容。',basis:'test_requirement',sourceIds:[],locator:'首prompt明确的产品界面要求',evidenceKind:'browser'},
 {id:'version-set',expected:'首轮实际保存的完整成果文件集由真实Run绑定，官方读取/当前版本/文件hash一致，封存后不被后续改稿覆盖；内容角色独立核对，不凭文件名或文件数自动判语义。',basis:'test_requirement',sourceIds:[],locator:'首轮官方Run/保存/读取/封存回执',evidenceKind:'runtime'},
];
export type ProductionInitialExecutionProfile='base'|'prototype-checks';
const profileChecks:BenchmarkCheck[]=[
 {id:'profile-submit-states',expected:'首prompt明确启用的prototype-checks profile：实际填写并提交成功、重复、服务失败三状态，失败保留所有输入并可再提交；本地场景不等于真实业务服务。独立核对原首轮完整浏览器报告和截图。',basis:'test_requirement',sourceIds:[],locator:'首prompt生成器明确追加的prototype-checks要求',evidenceKind:'browser'},
 {id:'profile-viewports',expected:'首prompt明确启用的prototype-checks profile：390×844、1280×800、1440×900三种尺寸的核心表单/操作/反馈完整可见，保存真实截图独立核对。',basis:'test_requirement',sourceIds:[],locator:'首prompt生成器明确追加的三视口要求',evidenceKind:'browser'},
];
export function initialStageChecks(testCase:BenchmarkCase,profile:ProductionInitialExecutionProfile='base'):BenchmarkCheck[]{
 if(!testCase.prompts[0].startsWith(BUSINESS_BENCHMARK_BASE_PROMPT)){if(profile!=='base')throw Error('INITIAL_PROFILE_CASE_INVALID');return structuredClone(testCase.checks);}
 const common=[...initialChecks,...(profile==='prototype-checks'?profileChecks:[])].map(check=>({...check,id:testCase.id+'-initial-'+check.id,sourceIds:[...check.sourceIds]}));
 return testCase.prompts.length===1?[...common,...structuredClone(testCase.checks).filter(check=>!common.some(item=>item.expected===check.expected&&item.evidenceKind===check.evidenceKind))]:common;
}
export function initialStageArtifactRoles(testCase:BenchmarkCase){return testCase.prompts[0].startsWith(BUSINESS_BENCHMARK_BASE_PROMPT)?['prd','prototype','trace'] as const:[];}

