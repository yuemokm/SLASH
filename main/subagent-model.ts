import type {ModelEntry,ThinkingLevel} from '../shared/types.js';
import type {SubagentProfile} from '../shared/subagent-settings.js';
import type {OpenAICompatibleModel} from './model-runtime.js';
import type {ThinkingModelConfig,ThinkingResolution} from './model-thinking.js';

export type SubagentModelSelection={model:OpenAICompatibleModel;key:string;thinkingLevel:ThinkingLevel;modelLabel:string};
/** Resolve only host-saved identities. Never silently substitute a missing model. */
export async function resolveSubagentModel(config:SubagentProfile&{enabled:boolean},parent:SubagentModelSelection,deps:{
 models:()=>ModelEntry[];credential:(entryId:string)=>string;
 thinking:(model:ThinkingModelConfig)=>Promise<ThinkingResolution>;
}):Promise<SubagentModelSelection>{
 if(!config.enabled)throw Error('SUBAGENTS_DISABLED: Subagent 已关闭');
 if(!config.modelEntryId&&config.thinkingLevel==='auto')return parent;
 const selected=config.modelEntryId?deps.models().find(model=>model.id===config.modelEntryId):undefined;
 if(config.modelEntryId&&!selected)throw Error('SUBAGENT_MODEL_UNAVAILABLE: 所选 Subagent 模型已删除，请到设置重新选择');
 const key=selected?deps.credential(selected.id):parent.key;
 if(!key)throw Error('SUBAGENT_MODEL_CREDENTIAL_MISSING: 所选 Subagent 模型未配置密钥');
 const model:OpenAICompatibleModel=selected?{entryId:selected.id,baseUrl:selected.baseUrl,proxyUrl:selected.proxyUrl,id:selected.modelId,protocol:selected.protocol,supportsVision:selected.supportsVision,contextWindow:selected.contextWindow,maxTokens:selected.maxTokens}:parent.model;
 const resolution=await deps.thinking(model);
 const level=config.thinkingLevel==='auto'?(selected?resolution.capability.defaultLevel??'off':parent.thinkingLevel):config.thinkingLevel;
 if((level!=='off'&&resolution.capability.status!=='supported')||(resolution.capability.status==='supported'&&!resolution.capability.levels.includes(level)))throw Error(`SUBAGENT_THINKING_UNAVAILABLE: 所选模型不能使用 ${level} 思考强度；${resolution.capability.reason}`);
 return{model:{...model,contextWindow:resolution.capability.limits?.contextWindow??model.contextWindow,maxTokens:resolution.capability.limits?.maxTokens??model.maxTokens,thinkingRuntime:resolution.runtime},key,thinkingLevel:level,modelLabel:selected?`${selected.provider}/${selected.modelId}`:parent.modelLabel};
}
