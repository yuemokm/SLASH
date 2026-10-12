import type {AgentSession} from '@earendil-works/pi-coding-agent';
import type {RuntimeRequestDiagnostics} from '../shared/runtime-status.js';

const object=(value:unknown):Record<string,unknown>|undefined=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:undefined;
const positive=(value:unknown):value is number=>typeof value==='number'&&Number.isSafeInteger(value)&&value>0;
/** Fixed projection only. Never clone, stringify or retain the provider body. */
export function runtimeRequestDiagnostics(input:unknown):RuntimeRequestDiagnostics{
 const payload=object(input),thinking=object(payload?.thinking),reasoning=object(payload?.reasoning),type=thinking?.type,effort=payload?.reasoning_effort??reasoning?.effort;
 return{source:'pi-on-payload',thinkingType:type===undefined?'absent':['enabled','disabled','adaptive'].includes(type as string)?type as RuntimeRequestDiagnostics['thinkingType']:'unrecognized',reasoningEffort:effort===undefined?'absent':['none','minimal','low','medium','high','xhigh','max'].includes(effort as string)?effort as RuntimeRequestDiagnostics['reasoningEffort']:'unrecognized',
  ...(positive(payload?.max_tokens)?{maxTokens:payload.max_tokens}:{}),...(positive(payload?.max_completion_tokens)?{maxCompletionTokens:payload.max_completion_tokens}:{}),...(positive(payload?.max_output_tokens)?{maxOutputTokens:payload.max_output_tokens}:{})};
}

/** Preserve Pi's stream and existing onPayload transformation/exception contract.
 * Observing a request must never change its parameters, budget or retry policy. */
export function observeRuntimePayloads(session:Pick<AgentSession,'agent'>,observe:(diagnostics:RuntimeRequestDiagnostics)=>void){
 const original=session.agent.streamFunction;
 session.agent.streamFunction=(model,context,options)=>original(model,context,{...options,onPayload:async(payload,payloadModel)=>{
  const transformed=await options?.onPayload?.(payload,payloadModel);
  try{observe(runtimeRequestDiagnostics(transformed===undefined?payload:transformed));}catch{/* Diagnostics cannot fail a request. */}
  return transformed;
 }});
}
