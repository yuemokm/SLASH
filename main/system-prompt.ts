import {systemPromptContentSchema,type SystemPromptView} from '../shared/types.js';
import type {Store} from './store.js';
import {PROTOTYPE_GUIDANCE} from './prototype-guidance.js';
import {BUSINESS_FACT_GUIDANCE} from './business-fact-guidance.js';

export const DEFAULT_SYSTEM_PROMPT=`# 产品协作方式
你是 slash，产品经理的协作助手。默认用中文 Markdown 回复，表达简洁、清晰，先给结论，再说明必要依据和下一步。

## 资料与判断
先查阅项目资料索引，再按任务关联性读取已授权资料。区分事实、假设与待确认事项，引用真实读取的路径，不编造来源或完成状态。重大业务规则不明确时提问；普通排版和实现细节自行决定。

${BUSINESS_FACT_GUIDANCE}

## 成果交付
按用户范围生成或修改成果，保留版本与来源。PRD 写清目标、角色、流程、字段、规则、异常和验收；原型包含可操作交互与模拟数据；流程图使用可编辑 draw.io XML。避免用大段代码代替实际文件交付。工具或外部服务的结果必须核对后再报告完成。

${PROTOTYPE_GUIDANCE}`;

// Exact runtime text of the default before the 2026-10-06 design advice.
// Keep this historical literal fixed. Do not normalize custom content to match it.
const PRE_GUIDANCE_DEFAULT_SYSTEM_PROMPT=`# 产品协作方式
你是 slash，产品经理的协作助手。默认用中文 Markdown 回复，表达简洁、清晰，先给结论，再说明必要依据和下一步。

## 资料与判断
先查阅项目资料索引，再按任务关联性读取已授权资料。区分事实、假设与待确认事项，引用真实读取的路径，不编造来源或完成状态。重大业务规则不明确时提问；普通排版和实现细节自行决定。

## 成果交付
按用户范围生成或修改成果，保留版本与来源。PRD 写清目标、角色、流程、字段、规则、异常和验收；原型包含可操作交互与模拟数据；流程图使用可编辑 draw.io XML。避免用大段代码代替实际文件交付。工具或外部服务的结果必须核对后再报告完成。`;

export function systemPromptView(store:Store):SystemPromptView{
 const saved=store.get<{content:string;updatedAt:string}|null>('system-prompt:v1',null);
 const parsed=systemPromptContentSchema.safeParse(saved?.content);
 // Validation may trim internally; resolution deliberately compares and returns
 // the saved bytes. Reading never writes defaults or changes accepted run snapshots.
 const content=parsed.success?(saved!.content===PRE_GUIDANCE_DEFAULT_SYSTEM_PROMPT?DEFAULT_SYSTEM_PROMPT:saved!.content):DEFAULT_SYSTEM_PROMPT;
 return{content,defaultContent:DEFAULT_SYSTEM_PROMPT,isDefault:content===DEFAULT_SYSTEM_PROMPT,updatedAt:parsed.success?saved?.updatedAt:undefined,notice:'保存后下一任务生效'};
}
export function saveSystemPrompt(store:Store,content:string){store.set('system-prompt:v1',{content:systemPromptContentSchema.parse(content),updatedAt:new Date().toISOString()});return systemPromptView(store);}
