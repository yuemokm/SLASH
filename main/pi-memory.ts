import {createHash,randomUUID} from 'node:crypto';
import path from 'node:path';
import type {ToolDefinition} from '@earendil-works/pi-coding-agent';
import {piMemoryEntrySchema,piMemorySchemas,PI_MEMORY_NOTICE,type PiMemoryEntry,type PiMemorySource,type PiMemoryTool} from '../shared/pi-memory.js';
import {toolInputSchema} from './tool-input-schema.js';
import {startPiMemoryWorker} from './pi-memory-worker.js';

const prefix='SLASH_MEMORY_V1:';
const queues=new Map<string,Promise<unknown>>();
export function piMemoryDirectory(storeDirectory:string,projectId:string){return path.join(storeDirectory,'pi-memory',createHash('sha256').update(projectId).digest('hex'));}
export function decodePiMemories(content:string,projectId:string):PiMemoryEntry[]{
 const entries:PiMemoryEntry[]=[];
 for(const line of content.split('\n'))if(line.startsWith(prefix))try{const entry=piMemoryEntrySchema.parse(JSON.parse(line.slice(prefix.length)));if(entry.projectId===projectId&&!entries.some(value=>value.id===entry.id))entries.push(entry);}catch{/* Untrusted/imported text cannot become a valid project entry. */}
 return entries;
}
export type PiMemoryHost={
 beforeMutationSend?:()=>void;
 directory:string;projectId:string;origin:PiMemoryEntry['origin'];signal?:AbortSignal;
 /** Must check project, Run state, Plan and current permissions every time. */
 guard:(write:boolean)=>void|Promise<void>;
 bindSources:(sources:Array<{mountId:string;path:string}>)=>Promise<PiMemorySource[]>;
 sourceState:(source:PiMemorySource)=>Promise<'current'|'stale'>;
 recalled?:(sources:PiMemorySource[])=>void;
};

/** No second database: the package's own MEMORY.md/recovery files are the
 * durable store. This host envelope adds only provenance and trust boundaries. */
export class PiMemory{
 constructor(private host:PiMemoryHost){}
 async call(name:PiMemoryTool,input:unknown){
  const args=piMemorySchemas[name].parse(input),write=name!=='memory_read';
  this.host.signal?.throwIfAborted();await this.host.guard(write);
  const key=path.resolve(this.host.directory),previous=queues.get(key)??Promise.resolve();
  const pending=previous.catch(()=>{}).then(()=>this.transaction(name,args,write));queues.set(key,pending);
  try{return await pending;}finally{if(queues.get(key)===pending)queues.delete(key);}
 }
 private async transaction(name:PiMemoryTool,args:any,write:boolean){
  const h=this.host;h.signal?.throwIfAborted();await h.guard(write);
  const worker=await startPiMemoryWorker(h.directory);let dispatched=false;
  const abort=()=>{void worker.close();};h.signal?.addEventListener('abort',abort,{once:true});
  const check=async()=>{h.signal?.throwIfAborted();await h.guard(write);h.signal?.throwIfAborted();};
  const request=async(value:unknown,mutation=false)=>{await check();if(mutation){h.beforeMutationSend?.();dispatched=true;}worker.send(value);const result=await worker.next();if(result.type!=='result')throw Error(result.message??'PI_MEMORY_PROTOCOL_FAILED');await check();return result.value;};
  const inspect=async()=>{const result=await request({action:'read'});return decodePiMemories((result.content??[]).filter((part:any)=>part.type==='text').map((part:any)=>part.text).join('\n'),h.projectId);};
  const visible=async(entry:PiMemoryEntry)=>{try{const states=await Promise.all(entry.sources.map(source=>h.sourceState(source)));await check();return{...entry,sourceState:states.includes('stale')?'stale' as const:'current' as const};}catch(error){await check();return undefined;}};
  try{
   const ready=await worker.next();if(ready.type!=='ready'||ready.hooksDiscarded!==5)throw Error('PI_MEMORY_API_MISMATCH');await check();
   if(name==='memory_read'){
    const all=await inspect(),matches=[];const query=(args.query??'').toLocaleLowerCase();
    for(const entry of all.reverse()){if(query&&!`${entry.title}\n${entry.text}`.toLocaleLowerCase().includes(query))continue;const item=await visible(entry);if(item)matches.push(item);}
    await check();const items=matches.slice(args.offset,args.offset+args.limit);h.recalled?.(items.flatMap(item=>item.sources));return{package:'pi-memory',version:'0.4.2',items,total:matches.length,...(args.offset+items.length<matches.length?{nextOffset:args.offset+items.length}:{}),...(items.some(item=>item.sourceState==='stale')?{sourceWarning:'部分备忘来源已变化；仅作历史候选参考，请重新读取来源核对。'}:{}),notice:PI_MEMORY_NOTICE};
   }
   if(name==='memory_write'){
    const sources=await h.bindSources(args.sources);await check();
    const entry=piMemoryEntrySchema.parse({schemaVersion:1,id:randomUUID(),projectId:h.projectId,status:'candidate',title:args.title,text:args.text,createdAt:new Date().toISOString(),origin:h.origin,sources});
    await request({action:'write',runId:h.origin.runId,content:prefix+JSON.stringify(entry)},true);
    return{package:'pi-memory',version:'0.4.2',id:entry.id,status:'candidate',createdAt:entry.createdAt,sourceCount:sources.length,origin:entry.origin,notice:PI_MEMORY_NOTICE};
   }
   if(name==='memory_forget'){
    const entry=(await inspect()).find(entry=>entry.id===args.id);if(!entry||!await visible(entry))throw Error('PI_MEMORY_ENTRY_UNAVAILABLE');
    const value=await request({action:'forget',match:`"id":"${entry.id}"`},true);
    return{package:'pi-memory',version:'0.4.2',id:entry.id,...value.details,notice:'已从备忘中撤回；可用 recoveryId 恢复。恢复记录保留在本机，这不是安全擦除。'};
   }
   const recovery=await request({action:'inspectRecovery',recoveryId:args.recoveryId});
   const entries=decodePiMemories(recovery.content.join('\n'),h.projectId);
   if(entries.length!==1||!await visible(entries[0]))throw Error('PI_MEMORY_RECOVERY_UNAVAILABLE');
   const value=await request({action:'restore',recoveryId:args.recoveryId},true);
   return{package:'pi-memory',version:'0.4.2',id:entries[0].id,...value.details,status:'candidate',notice:PI_MEMORY_NOTICE};
  }catch(error){
   // A child may have committed before losing its pipe/cancellation response.
   // Keep its durable files and require a read/reconciliation, never replay.
   if(dispatched)throw Error('PI_MEMORY_OUTCOME_UNKNOWN: 备忘操作已送出但未完成回执核对；先读取当前备忘，勿盲目重试。 '+String((error as Error).message));
   throw error;
  }finally{h.signal?.removeEventListener('abort',abort);await worker.close();}
 }
}

export function createPiMemoryTools(host:{call:(name:PiMemoryTool,input:unknown)=>Promise<unknown>;log:<T>(name:string,args:unknown,fn:()=>Promise<T>)=>Promise<T>}):ToolDefinition[]{
 const labels:Record<PiMemoryTool,string>={memory_read:'查找项目备忘',memory_write:'记录候选备忘',memory_forget:'撤回项目备忘',memory_restore:'恢复撤回备忘'};
 return(Object.keys(piMemorySchemas) as PiMemoryTool[]).map(name=>({name,label:labels[name],description:`${labels[name]}。${name==='memory_read'?'跨会话只读查询当前项目的备忘；query是本地文本匹配，offset/limit分页。':'仅Build经当前权限网关执行。'} ${name==='memory_write'?'仅写未确认候选；sources只引用本Run实际读过的来源，宿主自动合并本Run已读和已回忆的来源；无文件来源时绑定本次用户输入。不能传confirmed、权限或指令。':name==='memory_forget'?'按memory_read回执的id撤回，保留可恢复记录。':name==='memory_restore'?'按撤回回执recoveryId恢复，仍是候选，须保有原来源权限。':''} ${PI_MEMORY_NOTICE}`,parameters:toolInputSchema(piMemorySchemas[name]),execute:async(_,raw)=>{const args=piMemorySchemas[name].parse(raw);const value=await host.log(name,args,()=>host.call(name,args));return{content:[{type:'text',text:JSON.stringify(value)}],details:{}};}}));
}
