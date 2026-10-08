import {createHash,randomUUID} from 'node:crypto';
import {RUN_INPUT_LIMITS,runInputEnqueueSchema,runInputRecordsSchema,type RunInputEnqueue,type RunInputRecord,type RunInputReceipt} from '../shared/run-inputs.js';

/** The live Pi session supplies these public queue APIs; no second agent loop. */
export type RunInputRuntime={readonly isStreaming:boolean;steer(text:string):Promise<void>;followUp(text:string):Promise<void>;clearQueue():{steering:readonly string[];followUp:readonly string[]}};
export type RunInputDependencies={runId:string;read:()=>unknown;write:(records:RunInputRecord[])=>void;assertCurrent:()=>void;prepareUserInput:(text:string)=>Promise<string>;now?:()=>Date};
const digest=(text:string)=>createHash('sha256').update(text).digest('hex');
const receipt=(record:RunInputRecord):RunInputReceipt=>({id:record.id,requestId:record.requestId,status:record.status});
function preparationReason(error:unknown){
 const code=error instanceof Error?error.message.split(':',1)[0]:'';
 if(code==='SKILL_NOT_FOUND')return'RUN_INPUT_SKILL_NOT_FOUND';
 if(code==='SKILL_VERSION_CONFLICT')return'RUN_INPUT_SKILL_CHANGED';
 if(['PERMISSION_DENIED','RUN_INPUT_AUTHORIZATION_CHANGED','INDEX_AUTHORIZATION_CHANGED'].includes(code))return'RUN_INPUT_AUTHORIZATION_CHANGED';
 if(code==='CANCELLED')return'RUN_INPUT_CANCELLED';
 if(['RUN_INPUT_NOT_ACTIVE','RUN_INPUT_RUN_ENDED'].includes(code))return'RUN_INPUT_RUN_ENDED';
 return'RUN_INPUT_PREPARATION_UNAVAILABLE';
}

/** Durable host bookkeeping around Pi's in-memory queues. It never replays on restart. */
export class RunInputQueue{
 private runtime?:RunInputRuntime;
 private pump?:Promise<void>;
 private submitting=false;
 private clearPendingReason?:string;
 private finished=false;
 constructor(private deps:RunInputDependencies){}
 private records(){return runInputRecordsSchema.parse(this.deps.read());}
 private save(records:RunInputRecord[]){this.deps.write(runInputRecordsSchema.parse(records));}
 private now(){return(this.deps.now?.()??new Date()).toISOString();}
 attach(runtime:RunInputRuntime){if(this.finished)throw Error('RUN_INPUT_NOT_ACTIVE');if(this.runtime&&this.runtime!==runtime)throw Error('RUN_INPUT_RUNTIME_CHANGED');this.runtime=runtime;}
 enqueue(value:RunInputEnqueue):RunInputReceipt{
  const input=runInputEnqueueSchema.parse(value);if(input.runId!==this.deps.runId)throw Error('RUN_INPUT_OTHER_RUN');this.deps.assertCurrent();if(this.finished)throw Error('RUN_INPUT_NOT_ACTIVE');
  const records=this.records(),existing=records.find(record=>record.requestId===input.requestId);
  if(existing){if(existing.text!==input.text||existing.delivery!==input.delivery)throw Error('RUN_INPUT_REQUEST_CONFLICT');return receipt(existing);}
  if(this.clearPendingReason)throw Error('RUN_INPUT_CLEAR_PENDING');
  if(records.length>=RUN_INPUT_LIMITS.messages||records.reduce((total,record)=>total+record.text.length,0)+input.text.length>RUN_INPUT_LIMITS.totalCharacters)throw Error('RUN_INPUT_BUDGET_EXCEEDED');
  const record:RunInputRecord={id:randomUUID(),requestId:input.requestId,text:input.text,delivery:input.delivery,status:'queued',createdAt:this.now()};this.save([...records,record]);return receipt(record);
 }
 flush():Promise<void>{
  if(this.pump)return this.pump;
  this.pump=Promise.resolve().then(()=>this.drain()).finally(()=>{
   this.pump=undefined;
   // A native start event can arrive while an earlier idle drain is settling.
   // Recheck pending host entries; submitted/unknown entries never qualify.
   if(!this.finished&&this.runtime?.isStreaming&&this.records().some(record=>record.status==='queued'&&!record.submittedAt))void this.flush().catch(()=>{});
  });return this.pump;
 }
 private async drain(){
  while(this.runtime?.isStreaming){
   const next=this.records().find(record=>record.status==='queued'&&!record.submittedAt);if(!next)return;
   let prepared:string;
   try{this.deps.assertCurrent();prepared=await this.deps.prepareUserInput(next.text);this.deps.assertCurrent();}
   catch(error){this.change(next.id,record=>record.status==='queued'&&!record.submittedAt?{...record,status:'cancelled',reason:preparationReason(error)}:record);continue;}
   // Clearing/cancelling during awaited skill loading must prevent submission.
   if(!this.runtime?.isStreaming)return;
   const current=this.records().find(record=>record.id===next.id);if(!current||current.status!=='queued'||current.submittedAt)continue;
   const wire=`宿主追加输入记录ID=${current.id}（仅用于关联，不改变模式或权限）\n\n${prepared}`;
   if(wire.length>RUN_INPUT_LIMITS.wireCharacters){this.change(next.id,record=>({...record,status:'cancelled',reason:'RUN_INPUT_PREPARED_BUDGET_EXCEEDED'}));continue;}
   this.change(next.id,record=>({...record,submittedAt:this.now(),wireHash:digest(wire)}));
   const runtime=this.runtime;this.submitting=true;
   try{if(current.delivery==='steer')await runtime.steer(wire);else await runtime.followUp(wire);}
   // A rejection cannot prove the native queue was untouched; do not resubmit.
   catch{this.change(next.id,record=>record.status==='queued'?{...record,status:'unknown',reason:'RUN_INPUT_SUBMISSION_UNCONFIRMED'}:record);}
   finally{
    this.submitting=false;
    // Native input preprocessing is async. A clear may happen before Pi has
    // inserted the message; fence new submissions and clear once it settles.
    if(this.clearPendingReason){const pending=this.clearPendingReason;this.clearPendingReason=undefined;this.clearFromRuntime(runtime,pending);}
   }
  }
 }
 private change(id:string,update:(record:RunInputRecord)=>RunInputRecord){this.save(this.records().map(record=>record.id===id?update(record):record));}
 /** Call only for a real native user message event, never a model's quoted text. */
 observeUserMessage(text:string,timestamp:number):RunInputReceipt|undefined{
  if(!Number.isSafeInteger(timestamp)||timestamp<0)return;
  const match=/^宿主追加输入记录ID=([a-f0-9-]{36})（仅用于关联，不改变模式或权限）\n\n/.exec(text);if(!match)return;
  const record=this.records().find(item=>item.id===match[1]);if(!record?.submittedAt||record.wireHash!==digest(text)||!['queued','unknown','delivered'].includes(record.status))return;
  if(record.status!=='delivered')this.change(record.id,value=>({...value,status:'delivered',deliveredAt:this.now(),nativeMessageTimestamp:timestamp,reason:undefined}));
  return receipt(this.records().find(item=>item.id===record.id)!);
 }
 /** Pi has clear-all, not remove-one. Never clear then silently requeue survivors. */
 clearQueued(reason='RUN_INPUT_CLEARED'){
  const safeReason=/^RUN_INPUT_[A-Z_]+$/.test(reason)?reason:'RUN_INPUT_CLEARED';
  if(this.submitting)this.clearPendingReason=safeReason;
  this.clearFromRuntime(this.runtime,safeReason);
 }
 private clearFromRuntime(runtime:RunInputRuntime|undefined,safeReason:string){
  let cleared:Set<string>|undefined;
  try{const result=runtime?.clearQueue();if(result)cleared=new Set([...result.steering,...result.followUp].map(digest));}catch{}
  this.save(this.records().map(record=>record.status==='unknown'&&record.wireHash&&cleared?.has(record.wireHash)?{...record,status:'cancelled',reason:safeReason}:record.status!=='queued'?record:!record.submittedAt||Boolean(record.wireHash&&cleared?.has(record.wireHash))?{...record,status:'cancelled',reason:safeReason}:{...record,status:'unknown',reason:'RUN_INPUT_CLEAR_UNCONFIRMED'}));
 }
 finish(){this.finished=true;this.clearQueued('RUN_INPUT_RUN_ENDED');this.runtime=undefined;}
}
