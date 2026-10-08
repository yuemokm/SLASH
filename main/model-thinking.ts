import {createHash} from 'node:crypto';
import {getSupportedThinkingLevels,clampThinkingLevel,type Api,type Model,type ThinkingLevelMap} from '@earendil-works/pi-ai';
import {findCatalogModel,resolveModelLimits,parseModelLimitMetadata,UNVERIFIED_MODEL_LIMITS,type ModelLimitMetadata} from './model-limits.js';
import {thinkingLevels,type ModelProtocol,type ModelThinkingCapability,type ThinkingLevel} from '../shared/types.js';
import type {SettingsStore} from './settings.js';

export type ThinkingModelConfig={entryId?:string;baseUrl:string;id:string;protocol:ModelProtocol;contextWindow?:number;maxTokens?:number};
export type ThinkingRuntimeConfig=Pick<Model<Api>,'reasoning'|'thinkingLevelMap'|'compat'>;
export type ThinkingResolution={capability:ModelThinkingCapability;runtime?:ThinkingRuntimeConfig;metadataLimits?:ModelLimitMetadata;limitsNotice?:string};
const TTL_MS=5*60*1000;
const MAX_METADATA_BYTES=256*1024;
const effortLevels=['low','medium','high','xhigh','max'] as const;
const isObject=(value:unknown):value is Record<string,unknown>=>Boolean(value&&typeof value==='object'&&!Array.isArray(value));
const support=(value:unknown)=>isObject(value)&&typeof value.supported==='boolean'?value.supported:undefined;
export function thinkingFingerprint(model:ThinkingModelConfig){return createHash('sha256').update([model.entryId??'',model.baseUrl.replace(/\/$/,''),model.id,model.protocol].join('\0')).digest('hex');}

function nativeValue(model:Model<Api>,level:ThinkingLevel):string{
 const mapped=model.thinkingLevelMap?.[level];if(typeof mapped==='string')return mapped;
 if(model.api==='anthropic-messages'){
  if(level==='off')return 'disabled';
  if(model.compat&&'forceAdaptiveThinking' in model.compat&&model.compat.forceAdaptiveThinking)return level==='minimal'?'low':level;
  const budgets={minimal:1024,low:2048,medium:8192,high:16384,xhigh:32768,max:32768};return `budget_tokens:${Math.min(budgets[level],Math.max(0,model.maxTokens-1024))}`;
 }
 return level==='off'?'none':level;
}
export function describeThinkingModel(input:ThinkingModelConfig,model:Model<Api>|undefined,source:string,reason:string):ThinkingResolution{
 const identity={modelEntryId:input.entryId,modelId:input.id,fingerprint:thinkingFingerprint(input)};
 if(!model)return{capability:{...identity,status:'unknown',levels:[],source,reason,defaultLevel:'off'}};
 if(!model.reasoning)return{capability:{...identity,status:'unsupported',levels:[],source,reason,defaultLevel:'off'}};
 const nativeLevels:Partial<Record<ThinkingLevel,string>>={};const levels:ThinkingLevel[]=[];
 for(const level of getSupportedThinkingLevels(model)){
  const native=nativeValue(model,level);const duplicate=levels.find(prior=>nativeLevels[prior]===native);
  if(duplicate){if(level===native&&duplicate!==native){levels.splice(levels.indexOf(duplicate),1,level);delete nativeLevels[duplicate];nativeLevels[level]=native;}continue;}
  levels.push(level);nativeLevels[level]=native;
 }
 const preferred=clampThinkingLevel(model,'medium');const defaultLevel=levels.includes('off')?'off':levels.includes(preferred)?preferred:levels.find(level=>nativeLevels[level]===nativeValue(model,preferred))??levels[0]??'off';
 return{capability:{...identity,status:levels.some(level=>level!=='off')?'supported':'unsupported',levels,source,reason,defaultLevel,nativeLevels},runtime:{reasoning:model.reasoning,thinkingLevelMap:model.thinkingLevelMap,compat:model.compat}};
}

export function parseThinkingMetadata(input:ThinkingModelConfig,payload:unknown,known?:Model<Api>):ThinkingResolution|undefined{
 if(!isObject(payload)||payload.id!==input.id||!isObject(payload.capabilities))return;
 const capabilities=payload.capabilities;const thinking=capabilities.thinking;const effort=capabilities.effort;
 if(!isObject(thinking)||!isObject(thinking.types)||!isObject(effort))return;
 const adaptive=support(thinking.types.adaptive);const enabled=support(thinking.types.enabled);
 const declared=effortLevels.filter(level=>support(effort[level])===true);
 const fullyDeclared=effortLevels.every(level=>support(effort[level])!==undefined);
 const source='provider-model-metadata';
 if(adaptive===false&&enabled===false&&fullyDeclared&&!declared.length)return describeThinkingModel(input,{...(known??baseModel(input)),reasoning:false},source,'供应商模型元数据明确声明不支持思考与effort档位。');
 if(!declared.length||!(adaptive===true||enabled===true))return;
 // Anthropic effort is serialized only in adaptive mode. Older models use
 // Pi's real token-budget controls and retain their known catalog mapping.
 if(input.protocol==='anthropic-messages'&&adaptive!==true)return known?describeThinkingModel(input,known,'pi-catalog','此模型使用Pi已知的思考预算档位；元数据没有声明可序列化的adaptive effort。'):undefined;
 const allowed=known?new Set(getSupportedThinkingLevels(known)):new Set(thinkingLevels);
 const map:ThinkingLevelMap=Object.fromEntries(thinkingLevels.map(level=>[level,null]));
 for(const level of declared)if(allowed.has(level))map[level]=typeof known?.thinkingLevelMap?.[level]==='string'?known.thinkingLevelMap[level]:level;
 // The metadata schema has no disabled-thinking declaration. Only the exact
 // known catalog may establish that off is valid; do not invent it for proxies.
 if(known&&allowed.has('off'))map.off=known.thinkingLevelMap?.off??(input.protocol==='anthropic-messages'?'disabled':'none');
 const compat=input.protocol==='anthropic-messages'?{...known?.compat,forceAdaptiveThinking:true}:{...known?.compat,supportsReasoningEffort:true,...(!known?{thinkingFormat:'openai' as const}:{})};
 const model={...(known??baseModel(input)),reasoning:true,thinkingLevelMap:map,compat};
 const resolution=describeThinkingModel(input,model,source,'供应商明确声明的effort档位与Pi当前接口适配取交集；重复原生档位已合并。');
 if(!resolution.capability.levels.some(level=>level!=='off'))return;
 return resolution;
}
function baseModel(input:ThinkingModelConfig):Model<Api>{return{id:input.id,name:input.id,api:input.protocol,provider:'custom',baseUrl:input.baseUrl,reasoning:false,input:['text'],cost:{input:0,output:0,cacheRead:0,cacheWrite:0},...UNVERIFIED_MODEL_LIMITS};}

export class ModelThinkingResolver{
 private cache=new Map<string,{expiresAt:number;resolution:ThinkingResolution}>();
 constructor(private fetcher:typeof fetch=fetch,private store?:SettingsStore){}
 private snapshot(input:ThinkingModelConfig){
  const fingerprint=thinkingFingerprint(input);const cached=this.cache.get(fingerprint)??this.store?.get<{expiresAt:number;resolution:ThinkingResolution}|undefined>(`model-thinking:v1:${fingerprint}`,undefined);
  if(cached?.resolution?.capability?.fingerprint!==fingerprint||!Array.isArray(cached.resolution.capability.levels)||!cached.resolution.capability.levels.every(level=>thinkingLevels.includes(level))||!['supported','unsupported','unknown'].includes(cached.resolution.capability.status)||typeof cached.resolution.capability.reason!=='string'||!Number.isFinite(cached.expiresAt))return;
  return cached;
 }
 limits(input:ThinkingModelConfig){const cached=this.snapshot(input);return resolveModelLimits(input,thinkingFingerprint(input),cached?.resolution.metadataLimits);}
 async resolve(input:ThinkingModelConfig,options:{refresh?:boolean;key?:string}={}):Promise<ThinkingResolution>{
  const fingerprint=thinkingFingerprint(input);const cached=this.snapshot(input);
  if(!options.refresh&&cached?.resolution?.capability?.fingerprint===fingerprint){
   const resolution=structuredClone(cached.resolution);
   if(cached.expiresAt<=Date.now()&&resolution.capability.source==='provider-model-metadata'){
    resolution.capability.stale=true;resolution.capability.reason+=' 已验证的能力快照超过5分钟，可刷新供应商能力后再核对；已选档位保持不变。';
   }
   return this.withLimits(input,resolution,cached.expiresAt);
  }
  const known=findCatalogModel(input);let resolution=(cached?.resolution?.capability?.source==='provider-model-metadata'||cached?.resolution?.metadataLimits)?structuredClone(cached.resolution):describeThinkingModel(input,known,known?`pi-catalog:${known.provider}`:'unverified-endpoint',known?'使用安装的Pi模型能力表，完整API地址、模型ID和协议一致。':'当前端点没有可信档位声明。标准/v1/models与同名官方模型都不能证明中转支持思考。');
  let verifiedRefresh=false;
  if(options.refresh)delete resolution.limitsNotice;
  if(options.refresh&&resolution.metadataLimits)resolution.metadataLimits.stale=true;
  if(options.refresh&&resolution.capability.source==='provider-model-metadata')resolution.capability.stale=true;
  if(options.refresh){
   if(!options.key){resolution.limitsNotice='尚未配置密钥，未查询供应商元数据。';resolution.capability.reason+=' '+resolution.limitsNotice;}
   else try{
    const endpoint=new URL(input.baseUrl);if(endpoint.username||endpoint.password||endpoint.search||endpoint.hash||!['https:','http:'].includes(endpoint.protocol))throw Error('无效模型API地址');
    const basePath=endpoint.pathname.replace(/\/$/,'');endpoint.pathname=(input.protocol==='anthropic-messages'&&basePath===''?'/v1':basePath)+`/models/${encodeURIComponent(input.id)}`;
    const headers:Record<string,string>=input.protocol==='anthropic-messages'?{'x-api-key':options.key,'anthropic-version':'2023-06-01'}:{Authorization:`Bearer ${options.key}`};
    const response=await this.fetcher(endpoint,{headers,redirect:'error',signal:AbortSignal.timeout(5000)});if(!response.ok)throw Error(`HTTP ${response.status}`);
    if(Number(response.headers.get('content-length')??0)>MAX_METADATA_BYTES)throw Error('模型元数据响应过大');
    if(!response.body)throw Error('模型元数据为空');const reader=response.body.getReader();let bytes=0;const chunks:Uint8Array[]=[];
    try{while(true){const next=await reader.read();if(next.done)break;bytes+=next.value.byteLength;if(bytes>MAX_METADATA_BYTES)throw Error('模型元数据响应过大');chunks.push(next.value);}}finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
    const payload=JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
    const declaredLimits=parseModelLimitMetadata(input,payload);
    if(!declaredLimits)resolution.limitsNotice='供应商查询没有提供可验证的数字限额，保留原有容量结论。';
    const metadataLimits=declaredLimits?{...resolution.metadataLimits,...declaredLimits}:undefined;
    if(metadataLimits){resolveModelLimits(input,fingerprint,metadataLimits,known);metadataLimits.checkedAt=new Date().toISOString();metadataLimits.stale=Boolean(resolution.metadataLimits&&((resolution.metadataLimits.contextWindow!==undefined&&declaredLimits?.contextWindow===undefined)||(resolution.metadataLimits.maxTokens!==undefined&&declaredLimits?.maxTokens===undefined)));}
    const limits=resolveModelLimits(input,fingerprint,metadataLimits??resolution.metadataLimits,known);
    const parsed=parseThinkingMetadata(input,payload,known);
    const priorLimits=resolution.metadataLimits;resolution=parsed??resolution;resolution.metadataLimits=metadataLimits??priorLimits;if(parsed||metadataLimits){verifiedRefresh=true;resolution.capability.checkedAt=new Date().toISOString();}
    if(!parsed)resolution.capability.reason+=' 供应商模型查询没有提供可验证的思考档位，保留原能力结论。';
   }catch(error){resolution.limitsNotice=`元数据查询未完成（${error instanceof Error?error.message:'查询失败'}），保留原有容量结论。`;resolution.capability.reason+=' '+resolution.limitsNotice+' 没有据此判定不支持。';}
  }
  const snapshot={expiresAt:cached&&!verifiedRefresh?cached.expiresAt:Date.now()+TTL_MS,resolution};this.cache.set(fingerprint,snapshot);if(verifiedRefresh)this.store?.set(`model-thinking:v1:${fingerprint}`,snapshot);return this.withLimits(input,structuredClone(resolution),snapshot.expiresAt);
 }
 private withLimits(input:ThinkingModelConfig,resolution:ThinkingResolution,expiresAt:number):ThinkingResolution{
  if(resolution.metadataLimits&&expiresAt<=Date.now())resolution.metadataLimits.stale=true;
  const limits=resolveModelLimits(input,thinkingFingerprint(input),resolution.metadataLimits);resolution.capability.limits=limits;
  if(resolution.limitsNotice)limits.reason+=' '+resolution.limitsNotice;
  if(input.protocol==='anthropic-messages'&&resolution.capability.nativeLevels){
   const budgets={minimal:1024,low:2048,medium:8192,high:16384,xhigh:32768,max:32768};
   for(const level of resolution.capability.levels)if(level!=='off'&&resolution.capability.nativeLevels[level]?.startsWith('budget_tokens:'))resolution.capability.nativeLevels[level]=`budget_tokens:${Math.min(budgets[level],Math.max(0,limits.maxTokens-1024))}`;
   const distinct:ThinkingLevel[]=[];for(const level of resolution.capability.levels)if(!distinct.some(prior=>resolution.capability.nativeLevels?.[prior]===resolution.capability.nativeLevels?.[level]))distinct.push(level);
   resolution.capability.levels=distinct;if(!distinct.includes(resolution.capability.defaultLevel??'off'))resolution.capability.defaultLevel=distinct[0]??'off';
  }
  return resolution;
 }
}
