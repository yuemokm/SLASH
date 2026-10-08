import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import type {Stats} from 'node:fs';
import {z} from 'zod';
import type {Change,ProcessingCopy,ProcessingResult} from '../shared/types.js';
import type {Files} from './files.js';
import {businessPathKey} from '../shared/business-rules.js';

const hash=z.string().regex(/^[a-f0-9]{64}$/),id=z.string().min(1).max(200);
const ref=z.object({mountId:id,path:z.string().min(1).max(32767)}).strict();
const stampSchema=z.object({workspaceId:id,parserVersion:z.string().min(1).max(200),format:z.enum(['.docx','.xlsx']),source:ref.extend({contentHash:hash}),copy:ref,copyId:id,copyHash:hash,output:ref,outputHash:hash,changeId:id}).strict();
const receiptSchema=z.object({workspaceId:id,source:ref.extend({contentHash:hash}),copy:ref,copyId:id,copyHash:hash,operation:z.literal('extract_text'),output:ref,outputHash:hash,changeId:id,status:z.enum(['pending','applied','conflict'])});
const copySchema=z.object({id,source:ref.extend({contentHash:hash}),copy:ref,size:z.number().nonnegative(),createdAt:z.string(),workspaceRoot:z.string()});
type Stamp=z.infer<typeof stampSchema>;
export type VerifiedProcessingFile={ref:{mountId:string;path:string};selected:string;real:string;stat:Stats};
type Kv={get<T>(key:string,fallback:T):T;set(key:string,value:unknown):void};
type Snapshot={copy:ProcessingCopy;contentHash:string};
export const PROCESSING_REUSE_LIMITS={verificationBytes:256_000_000,fileBytes:100_000_000,outputBytes:2_000_000,chunkBytes:64_000} as const;
const sameRef=(a:{mountId:string;path:string},b:{mountId:string;path:string})=>a.mountId===b.mountId&&businessPathKey(a.path)===businessPathKey(b.path);
const sameStat=(a:Stats,b:Stats)=>a.dev===b.dev&&a.ino===b.ino&&a.size===b.size&&a.mtimeMs===b.mtimeMs&&a.ctimeMs===b.ctimeMs&&a.birthtimeMs===b.birthtimeMs;
export function processingReuseIndexKey(workspaceId:string,snapshot:Snapshot,parserVersion:string){
 return 'processing-extract-reuse:v1:'+createHash('sha256').update(JSON.stringify({workspaceId,source:{mountId:snapshot.copy.source.mountId,path:businessPathKey(snapshot.copy.source.path),contentHash:snapshot.copy.source.contentHash},copyHash:snapshot.contentHash,format:path.extname(snapshot.copy.copy.path).toLowerCase(),parserVersion})).digest('hex');
}

/** This write is called only after Service's genuine built-in Office extraction
 * and draft commit succeed. Public writeProcessedOutput never calls it. */
export function registerOfficeExtractionReuse(store:Kv,result:ProcessingResult,snapshot:Snapshot,parserVersion:string){
 const stamp=stampSchema.parse({workspaceId:result.workspaceId,parserVersion,format:path.extname(snapshot.copy.copy.path).toLowerCase(),source:result.source,copy:result.copy,copyId:result.copyId,copyHash:result.copyHash,output:result.output,outputHash:result.outputHash,changeId:result.changeId});
 store.set('processing-extract-trust:v1:'+result.changeId,stamp);
 store.set(processingReuseIndexKey(stamp.workspaceId,snapshot,parserVersion),result.changeId);
}

/** Exact single-entry lookup: no directory or KV enumeration and no global
 * cache. Legacy/untrusted results are cold misses, even when hashes match. */
export function officeExtractionReuseCandidate(store:Kv,changes:Change[],workspaceId:string,snapshot:Snapshot,parserVersion:string){
 const selected=store.get<unknown>(processingReuseIndexKey(workspaceId,snapshot,parserVersion),null);
 if(typeof selected!=='string'||selected.length>200)return undefined;
 const parsed=stampSchema.safeParse(store.get<unknown>('processing-extract-trust:v1:'+selected,null));
 if(!parsed.success)return undefined;const stamp=parsed.data;
 if(stamp.changeId!==selected||stamp.workspaceId!==workspaceId||stamp.parserVersion!==parserVersion||stamp.format!==path.extname(snapshot.copy.copy.path).toLowerCase()||!sameRef(stamp.source,snapshot.copy.source)||stamp.source.contentHash!==snapshot.copy.source.contentHash||stamp.copyHash!==snapshot.contentHash)return undefined;
 const receipt=receiptSchema.safeParse(store.get<unknown>('processing-result:'+selected,null)),copy=copySchema.safeParse(store.get<unknown>('processing-copy:'+stamp.copyId,null)),change=changes.find(c=>c.id===selected);
 if(!receipt.success||!copy.success)return undefined;const result=receipt.data,registered=copy.data;
 if(!change||change.status!=='applied'||result.workspaceId!==workspaceId||result.copyId!==stamp.copyId||result.copyHash!==stamp.copyHash||result.outputHash!==stamp.outputHash||result.changeId!==selected||!sameRef(result.source,stamp.source)||result.source.contentHash!==stamp.source.contentHash||!sameRef(result.copy,stamp.copy)||!sameRef(result.output,stamp.output)||!sameRef(change,stamp.output)||createHash('sha256').update(change.content).digest('hex')!==stamp.outputHash)return undefined;
 if(registered.id!==stamp.copyId||!sameRef(registered.source,stamp.source)||registered.source.contentHash!==stamp.source.contentHash||!sameRef(registered.copy,stamp.copy))return undefined;
 return{stamp,result,registered};
}

/** Repeated verification uses fresh bytes and a cumulative finite allowance.
 * Missing/changed/unsupported files are misses; authorization and unexpected
 * filesystem errors propagate instead of being treated as cache misses. */
export async function verifyOfficeExtractionReuse(files:Files,stamp:Stamp,guard:()=>void,budget:{remaining:number},verified?:VerifiedProcessingFile[]):Promise<boolean>{
 for(const item of [{ref:stamp.source,hash:stamp.source.contentHash,max:PROCESSING_REUSE_LIMITS.fileBytes},{ref:stamp.copy,hash:stamp.copyHash,max:PROCESSING_REUSE_LIMITS.fileBytes},{ref:stamp.output,hash:stamp.outputHash,max:PROCESSING_REUSE_LIMITS.outputBytes}]){
  let handle:Awaited<ReturnType<typeof fs.open>>|undefined;
  try{
   guard();const selected=await files.resolve(item.ref.mountId,item.ref.path);guard();const before=await fs.lstat(selected);guard();
   if(!before.isFile()||before.isSymbolicLink()||before.nlink>1||before.size>item.max||before.size>budget.remaining)return false;
   budget.remaining-=before.size;const real=await fs.realpath(selected);guard();handle=await fs.open(real,'r');guard();if(!sameStat(before,await handle.stat()))return false;
   const digest=createHash('sha256'),buffer=Buffer.alloc(PROCESSING_REUSE_LIMITS.chunkBytes);let position=0;
   while(position<before.size){guard();const read=await handle.read(buffer,0,Math.min(buffer.length,before.size-position),position);guard();if(!read.bytesRead)return false;position+=read.bytesRead;digest.update(buffer.subarray(0,read.bytesRead));}
   const afterPath=await files.resolve(item.ref.mountId,item.ref.path);guard();const after=await fs.lstat(afterPath),realAfter=await fs.realpath(afterPath),handleAfter=await handle.stat();guard();
   if(selected!==afterPath||real!==realAfter||after.isSymbolicLink()||!sameStat(before,after)||!sameStat(before,handleAfter)||digest.digest('hex')!==item.hash)return false;
   verified?.push({ref:item.ref,selected,real,stat:after});
  }catch(error){guard();if(['ENOENT','ENOTDIR'].includes((error as NodeJS.ErrnoException).code??''))return false;throw error;}
  finally{await handle?.close();}
 }
 guard();return true;
}

// The final requested-copy hash read also awaits I/O. Do not let any old-chain
// file change in that gap and still return the earlier verified result.
export async function processingReuseFilesUnchanged(files:Files,verified:VerifiedProcessingFile[],guard:()=>void){
 for(const item of verified)try{guard();const selected=await files.resolve(item.ref.mountId,item.ref.path),real=await fs.realpath(selected),stat=await fs.lstat(selected);guard();if(selected!==item.selected||real!==item.real||stat.isSymbolicLink()||!sameStat(stat,item.stat))return false;}catch(error){guard();if(['ENOENT','ENOTDIR'].includes((error as NodeJS.ErrnoException).code??''))return false;throw error;}
 guard();return true;
}
