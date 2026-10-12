import type {RuntimeContextUsage,RuntimeObservedStatus,RuntimeTokenUsage} from '../shared/runtime-status.js';
import type {RuntimeRequestDiagnostics,RuntimeResponseDiagnostics} from '../shared/runtime-status.js';
import {contentReviewResponseDiagnostics} from './content-review-response.js';

const object=(value:unknown):Record<string,unknown>|undefined=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:undefined;
const count=(value:unknown):value is number=>typeof value==='number'&&Number.isSafeInteger(value)&&value>=0;
const positive=(value:unknown):value is number=>count(value)&&value>0;
const reason=(value:unknown):value is 'manual'|'threshold'|'overflow'=>['manual','threshold','overflow'].includes(String(value));

/** No message content, thinking deltas, request bodies, models or credentials cross this adapter. */
export class RuntimeEventObserver{
 private value?:RuntimeObservedStatus;
 constructor(private redact:(text:string)=>string,private now:()=>Date=()=>new Date()){}
 snapshot(){return this.value?structuredClone(this.value):undefined;}
 private error(value:unknown){if(typeof value!=='string')return undefined;try{return this.redact(value).slice(0,300);}catch{return'运行诊断暂不可用';}}
 private update(patch:Partial<RuntimeObservedStatus>){this.value={activity:'model',...this.value,...patch,updatedAt:this.now().toISOString()};return this.snapshot();}
 observeRequest(requestDiagnostics:RuntimeRequestDiagnostics){return this.update({requestDiagnostics,responseDiagnostics:undefined});}
 observeResponse(content:readonly unknown[],stopReason:unknown){const responseDiagnostics:RuntimeResponseDiagnostics={...contentReviewResponseDiagnostics(content),stopReason:['stop','length','toolUse','error','aborted'].includes(stopReason as string)?stopReason as RuntimeResponseDiagnostics['stopReason']:'unknown'};return this.update({responseDiagnostics});}
 observe(input:unknown):RuntimeObservedStatus|undefined{
  const event=object(input);if(!event)return;
  switch(event.type){
   case'agent_start':case'turn_start':return this.update({activity:'model'});
   case'tool_execution_start':return this.update({activity:'tool'});
   case'tool_execution_end':return this.update({activity:'model'});
   case'agent_settled':return this.update({activity:'settled'});
   case'auto_retry_start':
    if(!positive(event.attempt)||!positive(event.maxAttempts)||!count(event.delayMs))return;
    return this.update({activity:'retry_wait',retry:{attempt:event.attempt,maxAttempts:event.maxAttempts,delayMs:event.delayMs,status:'waiting',error:this.error(event.errorMessage)}});
   case'auto_retry_end':
    if(!positive(event.attempt)||typeof event.success!=='boolean')return;
    return this.update({activity:'model',retry:{...this.value?.retry,attempt:event.attempt,status:event.success?'succeeded':'failed',error:this.error(event.finalError)}});
   case'compaction_start':
    if(!reason(event.reason))return;
    return this.update({activity:'compacting',compaction:{reason:event.reason,status:'running'}});
   case'compaction_end':
    if(!reason(event.reason)||typeof event.aborted!=='boolean'||typeof event.willRetry!=='boolean'||event.result!=null&&!object(event.result))return;
    return this.update({activity:'model',compaction:{reason:event.reason,status:event.aborted?'cancelled':event.result?'completed':'failed',willRetry:event.willRetry,error:this.error(event.errorMessage)}});
   case'summarization_retry_scheduled':
    if(!positive(event.attempt)||!positive(event.maxAttempts)||!count(event.delayMs))return;
    return this.update({summaryRetry:{attempt:event.attempt,maxAttempts:event.maxAttempts,delayMs:event.delayMs,status:'waiting',error:this.error(event.errorMessage)}});
   case'summarization_retry_attempt_start':
    if(!this.value?.summaryRetry||!['compaction','branchSummary'].includes(String(event.source)))return;
    return this.update({summaryRetry:{...this.value.summaryRetry,status:'running',source:event.source as 'compaction'|'branchSummary'}});
   case'summarization_retry_finished':
    if(!this.value?.summaryRetry)return;
    return this.update({summaryRetry:{...this.value.summaryRetry,status:'completed'}});
   case'message_end':{
    const message=object(event.message),usage=object(message?.usage);if(message?.role!=='assistant'||!usage)return;
    const fields=['input','output','cacheRead','cacheWrite','totalTokens'] as const;
    if(!fields.every(field=>count(usage[field])))return;
    const lastUsage=Object.fromEntries(fields.map(field=>[field,usage[field]])) as RuntimeTokenUsage;return this.update({lastUsage});
   }
   default:return;
  }
 }
 /** Pi returns null after compaction until usable post-compaction usage exists. */
 observeContext(input:unknown):RuntimeObservedStatus|undefined{
  const context=object(input);if(!context||!positive(context.contextWindow)||!(context.tokens===null||count(context.tokens))||!(context.percent===null||typeof context.percent==='number'&&Number.isFinite(context.percent)&&context.percent>=0))return;
  const usage:RuntimeContextUsage={tokens:context.tokens,contextWindow:context.contextWindow,percent:context.percent,source:'pi-estimate'};return this.update({context:usage});
 }
}
