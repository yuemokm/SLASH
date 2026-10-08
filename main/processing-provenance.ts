import fs from 'node:fs/promises';
import type {Stats} from 'node:fs';
import {createHash} from 'node:crypto';
import {z} from 'zod';
import type {Files} from './files.js';
import type {Change,ProcessingCopy,ProcessingResult} from '../shared/types.js';
import {businessPathKey,type BusinessProvenanceStage,type BusinessSourceProvenance} from '../shared/business-rules.js';
import type {BusinessText,BusinessProvenanceResolver} from './business-rules.js';

export const PROVENANCE_LIMITS={fileBytes:100_000_000,totalBytes:256_000_000,files:64,chunkBytes:64_000} as const;
const hash=z.string().regex(/^[a-f0-9]{64}$/i),id=z.string().min(1).max(200),relative=z.string().min(1).max(32767).refine(value=>!value.includes(':')&&!value.includes('\0')&&!value.replaceAll('\\','/').startsWith('/')&&!value.replaceAll('\\','/').split('/').includes('..'));
const fileRef=z.object({mountId:id,path:relative});
const resultSchema=z.object({copyId:id,source:fileRef.extend({contentHash:hash}),copy:fileRef,copyHash:hash,operation:z.enum(['extract_text','script']),output:fileRef,changeId:id,status:z.enum(['pending','applied','conflict']),workspaceId:id.optional(),outputHash:hash.optional()});
const copySchema=z.object({id,source:fileRef.extend({contentHash:hash}),copy:fileRef,size:z.number().nonnegative(),createdAt:z.string(),workspaceRoot:z.string()});
type Kv={get<T>(key:string,fallback:T):T};
type FileIdentity={mountId:string;path:string};
export type ProvenanceDependencies={files:Files;store:Kv;root:string;workspaceId:string;changes:()=>Change[];assertCurrent:()=>void;limits?:Partial<{fileBytes:number;totalBytes:number;files:number;chunkBytes:number}>};
export function processingOutputIndexKey(workspaceId:string,mountId:string,path:string){return`processing-output:v1:${workspaceId}:${createHash('sha256').update(`${mountId}\0${businessPathKey(path)}`).digest('hex')}`;}
function sameRef(a:FileIdentity,b:FileIdentity){return a.mountId===b.mountId&&businessPathKey(a.path)===businessPathKey(b.path);}
function sameStat(a:Stats,b:Stats){return a.dev===b.dev&&a.ino===b.ino&&a.size===b.size&&a.mtimeMs===b.mtimeMs&&a.ctimeMs===b.ctimeMs&&a.birthtimeMs===b.birthtimeMs;}
function unknown(reason:string):BusinessProvenanceStage{return{status:'unverified',reason};}
function summarize(stages:BusinessSourceProvenance['stages']):BusinessSourceProvenance['status']{const states=Object.values(stages).map(item=>item.status);if(states.includes('changed'))return'stale';if(states.includes('unavailable'))return'unavailable';if(states.some(status=>status!=='current'))return'unverified';return'current';}

/** Exact registered output lookup and bounded on-demand binary hashing. No
 * names, file contents, or directory scans are used to infer lineage. */
export function createProcessingProvenanceResolver(deps:ProvenanceDependencies){
 const limits={...PROVENANCE_LIMITS};for(const key of Object.keys(limits) as Array<keyof typeof limits>){const requested=deps.limits?.[key];if(requested!==undefined&&Number.isSafeInteger(requested)&&requested>0)(limits as Record<string,number>)[key]=Math.min(requested,PROVENANCE_LIMITS[key]);}
 const lookupCache=new Map<string,{receipt?:ProcessingResult;problem?:string;known:boolean}>(),hashCache=new Map<string,Promise<BusinessProvenanceStage>>();let bytes=0,files=0;
 const lookup=(ref:FileIdentity)=>{const key=`${ref.mountId}:${businessPathKey(ref.path)}`,previous=lookupCache.get(key);if(previous)return previous;
  const indexed=deps.store.get<unknown>(processingOutputIndexKey(deps.workspaceId,ref.mountId,ref.path),null),ids=new Set<string>();if(typeof indexed==='string'&&indexed.length<=200)ids.add(indexed);
  for(const change of deps.changes())if(sameRef(change,ref)&&deps.store.get<unknown>(`processing-result:${change.id}`,null)!==null){ids.add(change.id);if(ids.size>1)break;}
  let result:{receipt?:ProcessingResult;problem?:string;known:boolean};if(!ids.size)result={known:false};else if(ids.size>1)result={known:true,problem:'同一输出存在多份登记回执，需明确来源'};else{const receiptId=[...ids][0],parsed=resultSchema.safeParse(deps.store.get<unknown>(`processing-result:${receiptId}`,null));result=!parsed.success||parsed.data.changeId!==receiptId||!sameRef(parsed.data.output,ref)?{known:true,problem:'登记处理回执缺失或身份不一致'}:parsed.data.workspaceId&&parsed.data.workspaceId!==deps.workspaceId?{known:true,problem:'登记处理回执属于其他项目'}:{known:true,receipt:parsed.data};}lookupCache.set(key,result);return result;
 };
 const hashStage=(ref:FileIdentity,expectedHash:string,label:string)=>{const key=`${ref.mountId}:${businessPathKey(ref.path)}:${expectedHash}`,previous=hashCache.get(key);if(previous)return previous;if(hashCache.size>=limits.files)return Promise.resolve<BusinessProvenanceStage>({status:'limit_exceeded',reason:`${label}尚未核对：本次文件预算已用尽`});
  const pending=(async():Promise<BusinessProvenanceStage>=>{let handle:Awaited<ReturnType<typeof fs.open>>|undefined;try{
   deps.assertCurrent();const selected=await deps.files.resolve(ref.mountId,ref.path),real=await fs.realpath(selected),before=await fs.lstat(selected);deps.assertCurrent();if(!before.isFile()||before.isSymbolicLink())return{status:'unavailable',reason:`${label}不是可核对的普通文件`};
   if(before.size>limits.fileBytes||files>=limits.files||bytes+before.size>limits.totalBytes)return{status:'limit_exceeded',reason:`${label}版本核对超出本次读取预算，尚未核对`};files++;bytes+=before.size;
   handle=await fs.open(real,'r');if(!sameStat(before,await handle.stat()))return{status:'changed',reason:`${label}在核对开始时已被替换`};const digest=createHash('sha256'),buffer=Buffer.alloc(limits.chunkBytes);let position=0;
   while(position<before.size){deps.assertCurrent();const read=await handle.read(buffer,0,Math.min(buffer.length,before.size-position),position);if(!read.bytesRead)return{status:'changed',reason:`${label}在核对期间长度变化`};position+=read.bytesRead;digest.update(buffer.subarray(0,read.bytesRead));}
   const selectedAfter=await deps.files.resolve(ref.mountId,ref.path),after=await fs.lstat(selectedAfter),realAfter=await fs.realpath(selectedAfter),handleAfter=await handle.stat();deps.assertCurrent();if(selected!==selectedAfter||real!==realAfter||after.isSymbolicLink()||!sameStat(before,after)||!sameStat(before,handleAfter))return{status:'changed',reason:`${label}在核对期间被修改或替换`};
   const actualHash=digest.digest('hex');return{status:actualHash===expectedHash.toLowerCase()?'current':'changed',reason:actualHash===expectedHash.toLowerCase()?`${label}仍与登记版本一致`:`${label}已变化，登记处理文本需要重新核对`,mountId:ref.mountId,path:ref.path,expectedHash,actualHash};
  }catch{return{status:'unavailable',reason:`${label}当前无法读取或核对，未返回路径及内容`};}finally{await handle?.close().catch(()=>{});}})();hashCache.set(key,pending);return pending;
 };
 const resolve=async(mountId:string,path:string,text:BusinessText):Promise<BusinessSourceProvenance|undefined>=>{
  deps.assertCurrent();const found=lookup({mountId,path});if(!found.known)return undefined;
  const receipt=found.receipt;if(!receipt)return{kind:'processing_chain',receiptId:'unverified',operation:'extract_text',status:'unverified',stages:{original:unknown(found.problem??'登记信息无法核对'),copy:unknown('登记信息无法核对'),output:unknown('登记信息无法核对')},notice:'处理来源登记需要人工核对，未认定其为完整来源链。'};
  const change=deps.changes().find(item=>item.id===receipt.changeId&&sameRef(item,receipt.output)),registered=copySchema.safeParse(deps.store.get<unknown>(`processing-copy:${receipt.copyId}`,null));
  const copy=registered.success?registered.data:undefined,validCopy=copy&&copy.workspaceRoot===deps.root&&copy.id===receipt.copyId&&sameRef(copy.copy,receipt.copy)&&sameRef(copy.source,receipt.source)&&copy.source.contentHash===receipt.source.contentHash;
  const legacy=!receipt.workspaceId||!receipt.outputHash;
  let output:BusinessProvenanceStage=!change?unknown('找不到实际变更记录，无法确认输出是否已应用'):change.status!=='applied'?{status:'not_applied',reason:'处理文本尚未应用为正式文件'}:!receipt.outputHash?unknown('旧回执没有输出哈希，无法完整验证提取文本版本'):createHash('sha256').update(change.content).digest('hex')!==receipt.outputHash?unknown('输出哈希与登记变更内容不一致，无法完整验证来源链'):{status:text.contentHash===receipt.outputHash?'current':'changed',reason:text.contentHash===receipt.outputHash?'提取文本仍与登记输出版本一致':'提取文本已变化，不能当作原登记输出',mountId,path,expectedHash:receipt.outputHash,actualHash:text.contentHash};
  let original:BusinessProvenanceStage,processingCopy:BusinessProvenanceStage;
  if(!validCopy){original=unknown('原件与登记副本身份无法完整核对');processingCopy=unknown('处理副本登记缺失、项目或身份不一致');}
  else{original=await hashStage(receipt.source,receipt.source.contentHash,'原始资料');processingCopy=await hashStage(receipt.copy,receipt.copyHash,'处理副本');
   // One hop must never be presented as a verified root when the original
   // input itself is registered processing output. Explicitly retain unknown.
   if(original.status==='current'&&lookup(receipt.source).known)original={...original,status:'unverified',reason:sameRef(receipt.source,receipt.output)||sameRef(receipt.source,receipt.copy)?'登记来源形成循环，无法认定完整来源链':'本次原始输入也是登记处理输出，还有上游资料尚未核对'};
  }
  if(legacy&&output.status==='current')output={...output,status:'unverified',reason:'旧回执没有项目或输出哈希，无法完整验证来源链'};
  const stages={original,copy:processingCopy,output};
  // Repeat path authorization after all stream awaits. Upstream revocation
  // redacts only that stage; independently authorized extraction remains usable.
  for(const stage of Object.values(stages))if(stage.mountId&&stage.path)try{await deps.files.resolve(stage.mountId,stage.path);deps.assertCurrent();}catch{stage.status='unavailable';stage.reason='该阶段当前无法读取或核对，未返回路径及内容';delete stage.mountId;delete stage.path;delete stage.expectedHash;delete stage.actualHash;}
  deps.assertCurrent();return{kind:'processing_chain',receiptId:receipt.changeId,operation:receipt.operation,status:summarize(stages),stages,notice:receipt.copyHash===receipt.source.contentHash?'版本链只核对登记字节版本，不验证Office字段含义或业务解释。':'处理副本在提取前可能已修改；按处理时副本版本核对，不宣称与原件内容相同。'};
 };
 return Object.assign(resolve,{assertCurrent:deps.assertCurrent,registered:(mountId:string,path:string)=>{deps.assertCurrent();return lookup({mountId,path});}});
}
