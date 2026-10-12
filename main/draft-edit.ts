import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {createEditToolDefinition,type EditOperations} from '@earendil-works/pi-coding-agent';
import {hash,type Files} from './files.js';
import type {Change} from '../shared/types.js';
import {readDraftSchema,editDraftSchema,type ReadDraftInput,type EditDraftInput,type DraftReadReceipt,type DraftEditReceipt} from '../shared/draft-edit.js';

type Target={mountId:string;path:string};
export interface DraftEditHost {
 files:Files;
 changes:()=>Change[];
 assertAllowed:(runId:string,write:boolean)=>void;
 assertOrdinaryChange:(changeId:string)=>void;
 canUsePending?:(runId:string,change:Change)=>boolean;
 transaction:<T>(target:Target,runId:string,operation:()=>Promise<T>)=>Promise<T>;
 commit:(change:Change,receipt:DraftEditReceipt)=>void;
 validate?:(change:Change)=>Promise<void>;
 signal?:(runId:string)=>AbortSignal|undefined;
}
const key=(p:string)=>process.platform==='win32'?path.normalize(p).toLowerCase():path.normalize(p);
function nativeMatchFailure(error:unknown,virtualPath:string,totalEdits:number){
 if(!(error instanceof Error))return;
 for(let index=0;index<totalEdits;index++){
  const missing=totalEdits===1?`Could not find the exact text in ${virtualPath}. The old text must match exactly including all whitespace and newlines.`:`Could not find edits[${index}] in ${virtualPath}. The oldText must match exactly including all whitespace and newlines.`;
  if(error.message===missing)return{code:'DRAFT_MATCH_NOT_FOUND',failedEditIndex:index};
  const duplicate=/^Found ([1-9]\d*) occurrences of /.exec(error.message);
  if(!duplicate)continue;
  const ambiguous=totalEdits===1?`Found ${duplicate[1]} occurrences of the text in ${virtualPath}. The text must be unique. Please provide more context to make it unique.`:`Found ${duplicate[1]} occurrences of edits[${index}] in ${virtualPath}. Each oldText must be unique. Please provide more context to make it unique.`;
  if(error.message===ambiguous)return{code:'DRAFT_MATCH_AMBIGUOUS',failedEditIndex:index};
 }
}
function textGuard(filePath:string,content:string){
 if(!/\.(md|txt|html?|css|js|jsx|tsx?|json|csv|xml|drawio|svg|yaml|yml)$/i.test(filePath))throw Error('DRAFT_TEXT_ONLY: 仅支持已知 UTF-8 文本扩展');
 if(Buffer.byteLength(content)>2_000_000||content.includes('\0')||Buffer.from(content).toString('utf8')!==content)throw Error('DRAFT_TEXT_ONLY: 内容必须是 2 MB 内有效 UTF-8 文本');
 if(path.basename(filePath).toLowerCase()==='agents.md')throw Error('DRAFT_SPECIAL_TOOL_REQUIRED: 工作空间规则须使用专用工具');
 if(/\.json$/i.test(filePath)){try{const json=JSON.parse(content);if(json?.schemaVersion===1&&(Array.isArray(json.sections)||Array.isArray(json.templates)||Array.isArray(json.associations)))throw Error('DRAFT_SPECIAL_TOOL_REQUIRED: 模板元数据须使用专用工具');}catch(e){if(e instanceof Error&&e.message.startsWith('DRAFT_SPECIAL'))throw e;}}
}
async function disk(files:Files,target:Target){
 const absolute=await files.resolve(target.mountId,target.path,true);
 let content:string|null=null;
 try{const stat=await fs.stat(absolute);if(!stat.isFile()||stat.size>2_000_000)throw Error('DRAFT_TEXT_ONLY: 目标须为 2 MB 内普通文本');const bytes=await fs.readFile(absolute);try{content=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes);}catch{throw Error('DRAFT_TEXT_ONLY: 文件不是有效 UTF-8');}textGuard(target.path,content);}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
 return{absolute,content,baseHash:content===null?null:hash(content)};
}
export class DraftEditDomain {
 constructor(private host:DraftEditHost){}
 private guard(runId:string,write:boolean){this.host.assertAllowed(runId,write);if(this.host.signal?.(runId)?.aborted)throw Error('CANCELLED: 草稿操作已取消');}
 private async snapshot(runId:string,target:Target){
  this.guard(runId,false);const base=await disk(this.host.files,target);
  const revision=this.host.changes().map(c=>({id:c.id,status:c.status,content:c.content,before:c.before}));
  let pending:Change|undefined;
  // Resolve aliases physically, and select the newest card rather than stale IDs.
  for(const candidate of this.host.changes().filter(c=>c.status==='pending')){
   let absolute:string;try{absolute=await this.host.files.resolve(candidate.mountId,candidate.path);}catch{continue;}
   if(key(absolute)!==key(base.absolute))continue;
   if(candidate.runId!==runId&&!this.host.canUsePending?.(runId,candidate))throw Error('DRAFT_OTHER_RUN: 目标有其他任务的待应用草稿');
   this.host.assertOrdinaryChange(candidate.id);pending=candidate;break;
  }
  const content=pending?.content??base.content;if(content===null)throw Error('DRAFT_NOT_FOUND: 文件和当前任务草稿均不存在');
  textGuard(target.path,content);if(pending&&pending.before!==base.baseHash)throw Error('VERSION_CONFLICT: 原文件已变化，草稿未修改');
  this.guard(runId,false);await this.host.files.resolve(target.mountId,target.path,true);
  return{...base,pending,content,contentHash:hash(content),revision};
 }
 async read(runId:string,input:ReadDraftInput):Promise<DraftReadReceipt>{
  const p=readDraftSchema.parse(input),s=await this.snapshot(runId,p),offset=Math.min(p.offset??0,s.content.length),end=Math.min(offset+(p.limit??8000),s.content.length);
  return{mountId:p.mountId,path:p.path,source:s.pending?'pending':'applied',...(s.pending?{changeId:s.pending.id,parentRunId:s.pending.runId}:{}),contentHash:s.contentHash,baseHash:s.baseHash,content:s.content.slice(offset,end),offset,total:s.content.length,truncated:offset>0||end<s.content.length,...(end<s.content.length?{nextOffset:end}:{}),notice:'分页仅表示本段已读取；未读部分需继续按 nextOffset 读取。hash 由宿主计算。'+(s.pending?'当前为待应用草稿；编辑须同时传此回执的 changeId 和 contentHash（填入 expectedContentHash）。':'当前为已保存正式文件，没有待应用草稿；编辑须省略 changeId，使用此回执的 contentHash（填入 expectedContentHash）创建新的待应用草稿，不得沿用已应用草稿的旧 ID。')};
 }
 async edit(runId:string,input:EditDraftInput):Promise<DraftEditReceipt>{
  const p=editDraftSchema.parse(input);this.guard(runId,true);
  return this.host.transaction(p,runId,async()=>{
   const s=await this.snapshot(runId,p);this.guard(runId,true);
   if(s.pending&&!p.changeId)throw Error(`DRAFT_ID_REQUIRED: 目标有待应用草稿；请传入 read_draft 返回的 changeId=${s.pending.id} 和 expectedContentHash，再提交编辑。`);
   if(!s.pending&&p.changeId)throw Error('DRAFT_ID_STALE: 目标没有待应用草稿，旧 changeId 不再可用；请重新 read_draft，回执无 changeId 时省略该字段，并用最新 contentHash 作为 expectedContentHash 创建新草稿。');
   if(p.changeId!==s.pending?.id||p.expectedContentHash!==s.contentHash)throw Error('VERSION_CONFLICT: 草稿 ID 或内容哈希已变化，请重新 read_draft');
   let staged:string|undefined;
   // Pi gets virtual operations only. Its write callback stages memory; a
   // cancellation after that callback must never persist a new draft.
   const operations:EditOperations={access:async()=>{this.guard(runId,true);},readFile:async()=>Buffer.from(s.content),writeFile:async(_,content)=>{staged=content;}};
   const native=createEditToolDefinition(path.dirname(s.absolute),{operations});
   // Native edit only consults optional ctx.cwd; no extension context is
   // exposed in this host wrapper (its implementation supports omitted ctx).
   const virtualPath=path.join(path.dirname(s.absolute),`.slash-edit-${randomUUID()}`),edits=p.edits??[{oldText:p.oldText!,newText:p.newText!}];
   const output=await native.execute(randomUUID(),{path:virtualPath,edits},this.host.signal?.(runId),undefined,undefined!).catch(async error=>{
    const failure=nativeMatchFailure(error,virtualPath,edits.length);if(!failure)throw error;
    // Preserve cancellation, authority and version failures even when Pi first
    // notices a match failure. No source text is copied into this recovery hint.
    const latest=await this.snapshot(runId,p);this.guard(runId,true);
    if(latest.absolute!==s.absolute||latest.pending?.id!==s.pending?.id||latest.contentHash!==s.contentHash||latest.baseHash!==s.baseHash)throw Error('VERSION_CONFLICT: 编辑期间草稿或原文件已变化');
    throw Error(`${failure.code}: ${JSON.stringify({mountId:p.mountId,path:p.path,failedEditIndex:failure.failedEditIndex,failedEditNumber:failure.failedEditIndex+1,totalEdits:edits.length,contentHash:latest.contentHash,...(latest.pending?{changeId:latest.pending.id}:{}),position:'unknown',readDraft:{mountId:p.mountId,path:p.path,offset:0,limit:8000},notice:'本次编辑未修改任何草稿；失败位置未知。请用 readDraft 参数调用 read_draft，按 nextOffset 继续读取目标片段，保留原文属性，使用最新回执的 contentHash/changeId 提交较小编辑。'})}`);
   });
   if(staged===undefined)throw Error('DRAFT_EDIT_FAILED: Pi 未返回编辑内容');textGuard(p.path,staged);
   const latest=await this.snapshot(runId,p);this.guard(runId,true);
   if(latest.absolute!==s.absolute||latest.pending?.id!==s.pending?.id||latest.contentHash!==s.contentHash||latest.baseHash!==s.baseHash)throw Error('VERSION_CONFLICT: 编辑期间草稿或原文件已变化');
   const change:Change=s.pending?{...s.pending,runId,content:staged,...(s.pending.runId!==runId?{originRunId:s.pending.originRunId??s.pending.runId,resumptionHistory:[...(s.pending.resumptionHistory??[]),{fromRunId:s.pending.runId,toRunId:runId,at:new Date().toISOString(),contentHash:s.contentHash}]}:{})}:{id:randomUUID(),runId,mountId:p.mountId,path:p.path,before:s.baseHash,content:staged,status:'pending',createdAt:new Date().toISOString()};
   const diff=output.details?.diff??'',receipt:DraftEditReceipt={changeId:change.id,parentRunId:change.runId,path:change.path,status:'pending',contentHash:hash(staged),baseHash:change.before,diff:diff.slice(0,12000),diffHash:hash(diff),diffTruncated:diff.length>12000,firstChangedLine:output.details?.firstChangedLine,notice:'Pi 原生匹配（先精确，必要时规范化模糊匹配）；请核对实际 diff。批量各项匹配同一原内容。未直接写入原文件。'};
   await this.host.validate?.(change);
   // No await between final guard/CAS and host commit.
   this.guard(runId,true);
   const current=this.host.changes();
   if(current.length!==latest.revision.length||current.some((c,i)=>c.id!==latest.revision[i].id||c.status!==latest.revision[i].status||c.content!==latest.revision[i].content||c.before!==latest.revision[i].before))throw Error('VERSION_CONFLICT: 编辑提交前草稿集合已变化，请重新读取');
   this.host.commit(change,receipt);return receipt;
  });
 }
}
