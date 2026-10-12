import {InMemoryCredentialStore,type Api,type Model} from '@earendil-works/pi-ai';
import {ModelRuntime} from '@earendil-works/pi-coding-agent';
import type {ModelProtocol} from '../shared/types.js';
import type {ThinkingRuntimeConfig} from './model-thinking.js';
import {resolveModelLimits} from './model-limits.js';
import {openAICompletionsApi} from '@earendil-works/pi-ai/api/openai-completions.lazy';
import {openAIResponsesApi} from '@earendil-works/pi-ai/api/openai-responses.lazy';
import {anthropicMessagesApi} from '@earendil-works/pi-ai/api/anthropic-messages.lazy';
import {modelProxyFetch} from './model-proxy.js';

export const OPENAI_COMPATIBLE_RUNTIME_PROVIDER='baishan';
export type OpenAICompatibleModel={entryId?:string;baseUrl:string;proxyUrl?:string;id:string;protocol:ModelProtocol;supportsVision?:boolean;contextWindow?:number;maxTokens?:number;thinkingRuntime?:ThinkingRuntimeConfig};
type ProviderConfigInput=Parameters<ModelRuntime['registerProvider']>[1];

function runtimeBaseUrl(model:OpenAICompatibleModel):string{
 if(model.protocol!=='anthropic-messages')return model.baseUrl;
 try{
  const url=new URL(model.baseUrl);
  // The Anthropic SDK appends /v1/messages itself. Only the official /v1
  // alias can be normalized; custom gateway prefixes must stay intact.
  if(url.origin==='https://api.anthropic.com'&&!url.username&&!url.password&&!url.search&&!url.hash&&/^\/v1\/?$/.test(url.pathname))return url.origin;
 }catch{}
 return model.baseUrl;
}

export function openAICompatibleProviderConfig(model:OpenAICompatibleModel):ProviderConfigInput{
 const limits=resolveModelLimits(model,'runtime');
 const transport=model.proxyUrl?modelProxyFetch(model.proxyUrl):undefined;
 const api=transport?{'openai-completions':openAICompletionsApi,'openai-responses':openAIResponsesApi,'anthropic-messages':anthropicMessagesApi}[model.protocol]():undefined;
 const compat=model.thinkingRuntime?.compat;
 // Responses may normalize omitted strict and make optional inputs required.
 // Pi's public flag emits strict:false; an explicit opt-out keeps prior wire.
 const responsesCompat=compat as Model<'openai-responses'>['compat'];
 return{baseUrl:runtimeBaseUrl(model),api:model.protocol,...(transport&&api?{streamSimple:((requestModel,context,options)=>api.streamSimple(requestModel,context,{...options,fetch:transport})) as NonNullable<ProviderConfigInput['streamSimple']>}:{}),models:[{
  id:model.id,
  name:model.id,
  reasoning:model.thinkingRuntime?.reasoning??false,
  thinkingLevelMap:model.thinkingRuntime?.thinkingLevelMap,
  compat:model.protocol==='openai-responses'?{...responsesCompat,supportsStrictMode:responsesCompat?.supportsStrictMode??true}:compat,
  input:model.supportsVision===true?['text','image']:['text'],
  cost:{input:0,output:0,cacheRead:0,cacheWrite:0},
  contextWindow:limits.contextWindow,
  maxTokens:limits.maxTokens,
  samplingParams:!model.thinkingRuntime?.reasoning&&model.protocol==='openai-completions'&&/deepseek/i.test(model.id)?{thinking:{type:'disabled'}}:undefined,
 }]};
}

export async function createOpenAICompatibleModelRuntime(modelConfig:OpenAICompatibleModel,key:string):Promise<{runtime:ModelRuntime;model:Model<Api>}> {
 if(!key)throw Error('未配置密钥');
 const runtime=await ModelRuntime.create({credentials:new InMemoryCredentialStore(),modelsPath:null,refreshOnCreate:false});
 runtime.registerProvider(OPENAI_COMPATIBLE_RUNTIME_PROVIDER,openAICompatibleProviderConfig(modelConfig));
 await runtime.setRuntimeApiKey(OPENAI_COMPATIBLE_RUNTIME_PROVIDER,key);
 const model=runtime.getModel(OPENAI_COMPATIBLE_RUNTIME_PROVIDER,modelConfig.id);
 if(!model)throw Error('MODEL_NOT_FOUND');
 return{runtime,model};
}
