import {randomUUID} from 'node:crypto';
import type {
 ModelRouteCandidate,ModelRouteDecision,ModelRouteRequest,ParallelTask,ParallelTaskOptions,ParallelTaskResult,
 PermissionDecision,PermissionMode,PermissionCapability,ShareConflictDiagnostic,ShareLock,ShareResourceRef,
 SubAgentCallDecision,SubAgentCallRequest,SubAgentPermissionContext,AgentMode,
} from '../shared/types.js';
import {subAgentToolWhitelist} from '../shared/types.js';

/**
 * A model entry is the durable identity used by settings and credential
 * storage.  `modelId` remains on the route for compatibility with callers
 * that predate multiple endpoints for one provider model.
 */
export type ModelRouteCandidateWithEntry=ModelRouteCandidate&{entryId?:string};
export type ModelRouteRequestWithEntry=ModelRouteRequest&{preferredEntryId?:string};
export type ModelRouteDecisionWithEntry=ModelRouteDecision&{entryId?:string};

const WRITE_CAPABILITIES=new Set<PermissionCapability>(['artifact_write','process_execute','connection_config','external_action']);
const DEFAULT_MAX_TASKS=8;
const DEFAULT_MAX_CONCURRENCY=4;
const DEFAULT_TIMEOUT_MS=120_000;

function sameResource(a:ShareResourceRef,b:ShareResourceRef){
 return a.resourceId===b.resourceId && (a.path??'')===(b.path??'');
}

/** A small, deterministic policy gate for model spawned sub agents. The
 * parent run's mode, permissions and mount scope are copied into every call.
 * No model supplied value can extend the whitelist or scope. */
export class ControlledSubAgentBroker {
 constructor(private readonly now:()=>number=Date.now,private readonly maxDepth=1){}
 authorize(request:SubAgentCallRequest,parent:SubAgentPermissionContext,depth=0):SubAgentCallDecision{
  if(depth>this.maxDepth)return{allowed:false,code:'SUB_AGENT_TOOL_DENIED',reason:'Subagent 嵌套层级超过安全上限'};
  if(!subAgentToolWhitelist.includes(request.tool as (typeof subAgentToolWhitelist)[number]))return{allowed:false,code:'SUB_AGENT_TOOL_DENIED',reason:`工具不在Subagent 白名单：${request.tool}`};
  if(request.parentRunId!==parent.parentRunId)return{allowed:false,code:'SUB_AGENT_PERMISSION_DENIED',reason:'Subagent 未继承当前父 Run'};
  if(parent.mode==='plan' && (WRITE_CAPABILITIES.has(request.capability)||request.capability==='workspace_read'&&request.tool==='read_file')){
   // Plan can read workspace files; writes and process/network configuration are disallowed.
   if(WRITE_CAPABILITIES.has(request.capability))return{allowed:false,code:'PLAN_TOOL_DENIED',reason:'Plan 模式的Subagent 只能使用只读工具'};
  }
  const inheritedComputerRead=parent.permissionMode==='full_access'&&request.capability==='workspace_read'&&['read_file','search_files'].includes(request.tool)&&Boolean(parent.computerScope)&&Boolean(request.mountId&&(request.mountId===parent.computerScope||request.mountId.startsWith(parent.computerScope+':root:')));
  if(request.mountId && parent.mountIds && !parent.mountIds.includes(request.mountId)&&!inheritedComputerRead)return{allowed:false,code:'SUB_AGENT_SCOPE_DENIED',reason:'Subagent 请求超出父 Run 的目录范围'};
  const decision:PermissionDecision=parent.capabilities[request.capability]??'deny';
  if(decision==='deny')return{allowed:false,code:'SUB_AGENT_PERMISSION_DENIED',reason:`父 Run 禁止能力：${request.capability}`};
  // `ask` belongs to the parent run. A child cannot turn an outstanding
  // approval into an automatic allow; full access may only inherit it after
  // the host has applied its normal approval semantics.
  if(decision==='ask' && parent.permissionMode!=='full_access' && !(parent.permissionMode==='accept_edits'&&request.capability==='artifact_write'))return{allowed:false,code:'SUB_AGENT_PERMISSION_DENIED',reason:`父 Run 尚未授权能力：${request.capability}`};
  return{allowed:true,code:'ALLOWED',reason:'调用通过Subagent 白名单和父 Run 权限继承',inheritedFrom:parent.parentRunId};
 }
 async call<T>(request:SubAgentCallRequest,parent:SubAgentPermissionContext,handler:(request:SubAgentCallRequest,signal:AbortSignal)=>Promise<T>,options:{signal?:AbortSignal;depth?:number}={}):Promise<T>{
  const decision=this.authorize(request,parent,options.depth??0);if(!decision.allowed)throw Error(`${decision.code}: ${decision.reason}`);
  if(options.signal?.aborted)throw Error('CANCELLED');
  return handler({...request,parentRunId:parent.parentRunId},options.signal??new AbortController().signal);
 }
}

/** Chooses among configured models without making a provider request. Every
 * strategy has a deterministic fallback and excludes unavailable candidates. */
export function selectModelRoute(candidates:ModelRouteCandidateWithEntry[],request:ModelRouteRequestWithEntry):ModelRouteDecisionWithEntry{
 const usable=candidates.filter(item=>item.available!==false&&(!request.minContextWindow||!item.contextWindow||item.contextWindow>=request.minContextWindow)&&(!request.requiresReasoning||item.reasoning==='advanced'));
 if(!usable.length)throw Error('MODEL_ROUTE_UNAVAILABLE: 没有满足上下文、推理和凭据要求的可用模型');
 const byEntryId=(id?:string)=>id?usable.find(item=>item.entryId===id):undefined;
 const byModelId=(id?:string)=>id?usable.find(item=>item.modelId===id):undefined;
 // An entry id is authoritative.  Falling through to a same-named modelId
 // would select the first endpoint and can silently use the wrong credential.
 const requested=()=>request.preferredEntryId?byEntryId(request.preferredEntryId):byModelId(request.preferredModelId);
 let selected:ModelRouteCandidateWithEntry|undefined;
 let fallbackUsed=false;
 let fallbackReason='';
 if(request.strategy==='fixed'){
  const target=request.preferredEntryId||request.preferredModelId;
  if(target){
   selected=requested();
   if(!selected)throw Error(`MODEL_ROUTE_FIXED_UNAVAILABLE: 显式模型 ${target} 不可用或未配置凭据`);
  }else selected=usable[0];
 }
 else if(request.strategy==='fallback'){
  const preferred=requested();
  selected=(request.fallbackModelIds??[]).map(byModelId).find(Boolean)??preferred??usable[0];
  fallbackUsed=Boolean((request.preferredEntryId||request.preferredModelId)&&selected!==preferred);
  if(fallbackUsed)fallbackReason=`显式模型 ${request.preferredEntryId||request.preferredModelId} 不可用，已按 fallback 列表选择`;
 }else if(request.strategy==='cost_aware'){
  const affordable=usable.filter(item=>request.budget===undefined||item.costPer1k===undefined||item.costPer1k<=request.budget);
  selected=(affordable.length?affordable:usable).slice().sort((a,b)=>(a.costPer1k??Number.POSITIVE_INFINITY)-(b.costPer1k??Number.POSITIVE_INFINITY)||(b.priority??0)-(a.priority??0))[0];
 }else{
  const preferred=requested();
  const taskMatched=usable.filter(item=>item.taskTypes?.includes(request.taskType));
  selected=preferred??(taskMatched.length?taskMatched:usable).slice().sort((a,b)=>(b.priority??0)-(a.priority??0))[0];
  if(!preferred&&(request.preferredEntryId||request.preferredModelId)){fallbackUsed=true;fallbackReason=`task_type 配置模型 ${request.preferredEntryId||request.preferredModelId} 不可用，已选择候选模型`;
  }
 }
 if(!selected)throw Error('MODEL_ROUTE_UNAVAILABLE: 路由策略没有候选模型');
 const reason=fallbackReason||`${request.strategy} 策略选择 ${selected.provider}/${selected.modelId}${selected.entryId?`（配置 ${selected.entryId}）`:''}`;
 return{modelId:selected.modelId,provider:selected.provider,strategy:request.strategy,fallbackUsed,reason,entryId:selected.entryId};
}

/** Bounded worker pool for independent read/analysis tasks. It refuses more
 * than maxTasks and maxConcurrency before invoking any task. */
export async function runParallelTasks<T>(tasks:ParallelTask<T>[],options:ParallelTaskOptions={}):Promise<ParallelTaskResult<T>[]>{
 const maxTasks=options.maxTasks??DEFAULT_MAX_TASKS,maxConcurrency=options.maxConcurrency??DEFAULT_MAX_CONCURRENCY,timeout=options.taskTimeoutMs??DEFAULT_TIMEOUT_MS;
 if(tasks.length>maxTasks)throw Error(`PARALLEL_LIMIT: 最多允许 ${maxTasks} 个并行任务`);
 if(maxConcurrency<1||maxConcurrency>maxTasks)throw Error('PARALLEL_LIMIT: 并发上限无效');
 const ids=new Set<string>();for(const task of tasks){if(!task.id||ids.has(task.id))throw Error(`PARALLEL_INVALID: 重复任务 ID ${task.id}`);ids.add(task.id);}
 const output:Array<ParallelTaskResult<T>>=[];let cursor=0;
 const worker=async()=>{while(true){if(options.signal?.aborted)return;const index=cursor++;if(index>=tasks.length)return;const task=tasks[index];const started=Date.now();const controller=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined;
   const abort=()=>controller.abort();options.signal?.addEventListener('abort',abort,{once:true});
   try{timer=setTimeout(()=>controller.abort(),timeout);const value=await task.run(controller.signal);output[index]={id:task.id,status:controller.signal.aborted?'timed_out':'succeeded',value:controller.signal.aborted?undefined:value,error:controller.signal.aborted?'任务超时':undefined,durationMs:Date.now()-started};}
   catch(error){const aborted=controller.signal.aborted||options.signal?.aborted;output[index]={id:task.id,status:aborted?'cancelled':'failed',error:error instanceof Error?error.message:String(error),durationMs:Date.now()-started};}
   finally{if(timer)clearTimeout(timer);options.signal?.removeEventListener('abort',abort);}
  }};
 await Promise.all(Array.from({length:Math.min(maxConcurrency,tasks.length)},()=>worker()));
 if(options.signal?.aborted)for(let i=0;i<tasks.length;i++)if(!output[i])output[i]={id:tasks[i].id,status:'cancelled',error:'任务已取消',durationMs:0};
 return output;
}

export class SharedResourceCoordinator {
 private readonly locks=new Map<string,ShareLock>();
 constructor(private readonly now:()=>number=Date.now,private readonly id:()=>string=randomUUID){}
 private key(resource:ShareResourceRef){return`${resource.resourceId}\0${(resource.path??'').replaceAll('\\','/')}`;}
 private purge(now=this.now()){for(const [key,lock] of this.locks)if(lock.expiresAt<=new Date(now).toISOString())this.locks.delete(key);}
 restore(locks:ShareLock[]){this.locks.clear();for(const lock of locks){if(lock.expiresAt>new Date(this.now()).toISOString())this.locks.set(this.key(lock.resource),{...lock,resource:{...lock.resource}});}}
 /** Guard a write without creating a lock. The caller may already hold the
  * resource lock (for example after an explicit shareLock IPC call). */
 assertWritable(resource:ShareResourceRef,ownerId?:string){
  this.purge();const existing=this.locks.get(this.key(resource));
  if(existing&&existing.ownerId!==ownerId)throw Error(`LOCK_HELD: 共享资源由 ${existing.ownerId} 锁定（${existing.id}）`);
  return existing?{...existing,resource:{...existing.resource}}:undefined;
 }
 diagnose(resource:ShareResourceRef,expectedVersion?:string,actualVersion?:string):ShareConflictDiagnostic{
  this.purge();const lock=this.locks.get(this.key(resource));
  // This diagnostic is used by write/apply flows, so an active read lock is
  // also a conflict: a writer must first obtain exclusive ownership.
  if(lock)return{code:'LOCK_HELD',resource,ownerId:lock.ownerId,lockId:lock.id,message:`共享资源由 ${lock.ownerId} 锁定`,retryable:true};
  if(expectedVersion!==undefined&&actualVersion!==undefined&&expectedVersion!==actualVersion)return{code:'VERSION_CONFLICT',resource,expectedVersion,actualVersion,message:'共享文件版本已变化，请重新读取并生成变更草稿',retryable:false};
  return{code:'NO_CONFLICT',resource,message:'未发现共享资源锁或版本冲突',retryable:true};
 }
 acquire(resource:ShareResourceRef,ownerId:string,mode:'read'|'write'='write',ttlMs=120_000):ShareLock{
  if(!ownerId.trim())throw Error('SHARE_LOCK_INVALID: ownerId 不能为空');if(ttlMs<1_000||ttlMs>86_400_000)throw Error('SHARE_LOCK_INVALID: 锁租期超出范围');
  this.purge();const existing=this.locks.get(this.key(resource));
  if(existing&&existing.ownerId!==ownerId&&(existing.mode==='write'||mode==='write'))throw Error(`LOCK_HELD: 共享资源由 ${existing.ownerId} 锁定`);
  if(existing&&existing.ownerId===ownerId){existing.expiresAt=new Date(this.now()+ttlMs).toISOString();if(mode==='write')existing.mode='write';return{...existing};}
  const lock:ShareLock={id:this.id(),resource:{...resource},ownerId,acquiredAt:new Date(this.now()).toISOString(),expiresAt:new Date(this.now()+ttlMs).toISOString(),mode};this.locks.set(this.key(resource),lock);return{...lock};
 }
 release(lockId:string,ownerId:string){for(const [key,lock] of this.locks){if(lock.id===lockId){if(lock.ownerId!==ownerId)throw Error('SHARE_LOCK_OWNER_MISMATCH: 只有锁持有者可释放');this.locks.delete(key);return true;}}return false;}
 list(){this.purge();return Array.from(this.locks.values()).map(lock=>({...lock,resource:{...lock.resource}}));}
}

export const phase3Defaults={maxParallelTasks:DEFAULT_MAX_TASKS,maxParallelConcurrency:DEFAULT_MAX_CONCURRENCY,taskTimeoutMs:DEFAULT_TIMEOUT_MS,subAgentMaxDepth:1};
