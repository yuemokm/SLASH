import type {Api,Model} from '@earendil-works/pi-ai';
import {getBuiltinModels,getBuiltinProviders} from '@earendil-works/pi-ai/providers/all';
import type {ModelLimitsCapability,ModelProtocol} from '../shared/types.js';

export type ModelLimitsInput={entryId?:string;baseUrl:string;id:string;protocol:ModelProtocol;contextWindow?:number;maxTokens?:number};
export type ModelLimitMetadata={contextWindow?:number;maxTokens?:number;checkedAt?:string;stale?:boolean;contextKind?:'input'};
// Compatibility values for existing and unverified custom endpoints. They are
// never presented as a provider declaration or persisted as user overrides.
export const UNVERIFIED_MODEL_LIMITS={contextWindow:65536,maxTokens:12000} as const;
export const validTokenLimit=(value:unknown):value is number=>typeof value==='number'&&Number.isSafeInteger(value)&&value>0;
function normalizedEndpoint(value:string){
 try{const url=new URL(value);if(url.username||url.password||url.search||url.hash)return;const pathname=url.pathname.replace(/\/$/,'');return `${url.origin}${url.origin==='https://api.anthropic.com'&&(pathname===''||pathname==='/v1')?'':pathname}`;}catch{return;}
}
export function findCatalogModel(input:ModelLimitsInput):Model<Api>|undefined{
 const endpoint=normalizedEndpoint(input.baseUrl);if(!endpoint)return;
 for(const provider of getBuiltinProviders()){
  const found=getBuiltinModels(provider).find(model=>model.id===input.id&&model.api===input.protocol&&normalizedEndpoint(model.baseUrl)===endpoint);
  if(found)return found as Model<Api>;
 }
}
export function parseModelLimitMetadata(input:ModelLimitsInput,payload:unknown):ModelLimitMetadata|undefined{
 if(!payload||typeof payload!=='object'||Array.isArray(payload))return;
 const value=payload as Record<string,unknown>;if(value.id!==input.id)return;
 // These are explicit numeric limit declarations, unlike a standard model
 // listing's id/owned_by fields. Do not coerce strings or infer from names.
 const context=value.context_window??value.contextWindow??(input.protocol==='anthropic-messages'?value.max_input_tokens:undefined);
 const output=value.max_tokens??value.max_output_tokens??value.maxTokens;
 if((context!==undefined&&!validTokenLimit(context))||(output!==undefined&&!validTokenLimit(output)))return;
 if(context===undefined&&output===undefined)return;
 if(context!==undefined&&output!==undefined&&(output as number)>=(context as number))return;
 return{...(context!==undefined?{contextWindow:context as number}: {}),...(output!==undefined?{maxTokens:output as number}: {}),...(value.context_window===undefined&&value.contextWindow===undefined&&input.protocol==='anthropic-messages'&&value.max_input_tokens!==undefined?{contextKind:'input' as const}: {})};
}
export function resolveModelLimits(input:ModelLimitsInput,fingerprint:string,metadata?:ModelLimitMetadata,known=findCatalogModel(input)):ModelLimitsCapability{
 if((input.contextWindow!==undefined&&!validTokenLimit(input.contextWindow))||(input.maxTokens!==undefined&&!validTokenLimit(input.maxTokens)))throw Error('MODEL_LIMITS_INVALID: 模型限额须为有限正整数');
 if(metadata&&((metadata.contextWindow!==undefined&&!validTokenLimit(metadata.contextWindow))||(metadata.maxTokens!==undefined&&!validTokenLimit(metadata.maxTokens))||(metadata.contextWindow!==undefined&&metadata.maxTokens!==undefined&&metadata.maxTokens>=metadata.contextWindow)))metadata=undefined;
 const sourceFor=(field:'contextWindow'|'maxTokens')=>input[field]!==undefined?'user-override':validTokenLimit(metadata?.[field])?'provider-model-metadata':validTokenLimit(known?.[field])?`pi-catalog:${known!.provider}`:'unverified-compatibility';
 const contextWindowSource=sourceFor('contextWindow'),maxTokensSource=sourceFor('maxTokens');
 let contextWindow=input.contextWindow??metadata?.contextWindow??known?.contextWindow??UNVERIFIED_MODEL_LIMITS.contextWindow;
 let maxTokens=input.maxTokens??metadata?.maxTokens??known?.maxTokens??UNVERIFIED_MODEL_LIMITS.maxTokens;
 // Partial declarations can meet a larger compatibility value. Only the
 // unverified fallback is adjustable; explicit/verified contradictions block.
 if(maxTokens>=contextWindow){
  if(maxTokensSource==='unverified-compatibility'&&contextWindow>1)maxTokens=Math.min(maxTokens,contextWindow-1);
  else throw Error('MODEL_LIMITS_INVALID: 最大输出必须小于已解析的上下文窗口，请同时明确配置上下文与输出限额');
 }
 const status=contextWindowSource==='unverified-compatibility'||maxTokensSource==='unverified-compatibility'?'unverified':'verified';
 const source=contextWindowSource===maxTokensSource?contextWindowSource:'mixed';
 let reason=status==='unverified'?'当前端点尚未提供完整可验证限额；未验证字段暂用兼容值，不代表上游真实能力。可手动填写或刷新供应商元数据。':source==='user-override'?'使用用户明确配置的上下文与输出限额；数值来自用户声明。':'按用户配置、当前端点模型元数据、精确匹配的Pi目录顺序解析各项限额。';
 if(contextWindowSource==='provider-model-metadata'&&metadata?.contextKind==='input')reason+=' 此端点声明的是输入上下文上限，Pi以此值保守约束上下文，不将其宣称为总窗口精确值。';
 const usesMetadata=contextWindowSource==='provider-model-metadata'||maxTokensSource==='provider-model-metadata';
 return{modelEntryId:input.entryId,modelId:input.id,fingerprint,contextWindow,maxTokens,status,source,reason,contextWindowSource,maxTokensSource,...(usesMetadata?{checkedAt:metadata?.checkedAt,stale:metadata?.stale}: {})};
}
