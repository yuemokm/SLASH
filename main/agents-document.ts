import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';

export const INDEX_START='<!-- slash:resource-index:start -->',INDEX_END='<!-- slash:resource-index:end -->';
export const AGENTS_DOCUMENT_MAX_BYTES=128*1024,AGENTS_MANUAL_MAX_BYTES=64_000;
export const documentHash=(content:string)=>createHash('sha256').update(content).digest('hex');
export type AgentsParts={prefix:string;managed:string;suffix:string;manual:string};
export function splitAgentsDocument(content:string):AgentsParts{
 const start=content.indexOf(INDEX_START),end=content.indexOf(INDEX_END);if((start>=0)!==(end>=0)||start>=0&&(end<start||content.indexOf(INDEX_START,start+INDEX_START.length)>=0||content.indexOf(INDEX_END,end+INDEX_END.length)>=0))throw Error('AGENT_INDEX_MARKERS_INVALID: AGENTS.md受管理索引标记损坏，已保留原文件');
 const prefix=start<0?content:content.slice(0,start),managed=start<0?'':content.slice(start,end+INDEX_END.length),suffix=start<0?'':content.slice(end+INDEX_END.length);return{prefix,managed,suffix,manual:prefix+suffix};
}
export function validateAgentsDocument(content:string){if(Buffer.byteLength(content)>AGENTS_DOCUMENT_MAX_BYTES)throw Error('AGENT_INDEX_TOO_LARGE: AGENTS.md超过128KiB，已保留原文件');const parts=splitAgentsDocument(content);if(Buffer.byteLength(parts.manual)>AGENTS_MANUAL_MAX_BYTES)throw Error('VALIDATION_FAILED: AGENTS.md人工规则超过64 KB，已保留原文件');return parts;}
const queues=new Map<string,Promise<unknown>>();
export async function withAgentsDocumentLock<T>(root:string,operation:()=>Promise<T>):Promise<T>{const real=await fs.realpath(root),key=process.platform==='win32'?real.toLowerCase():real;const previous=queues.get(key)??Promise.resolve();const next=previous.catch(()=>{}).then(operation);queues.set(key,next);try{return await next;}finally{if(queues.get(key)===next)queues.delete(key);}}
export type AgentsSnapshot={path:string;exists:boolean;content:string;fullHash:string|null;parts:AgentsParts};
export async function readAgentsDocument(root:string,legacy=false):Promise<AgentsSnapshot>{
 const realRoot=await fs.realpath(root),canonical=legacy?'agent.md':'AGENTS.md';const names=(await fs.readdir(realRoot)).filter(name=>process.platform==='win32'?name.toLowerCase()===canonical.toLowerCase():name===canonical);if(names.length>1)throw Error('AGENT_INDEX_UNSAFE: 存在多个大小写不同的AGENTS文件，请人工整理');const filename=path.join(realRoot,names[0]??canonical);let content='';let exists=false;let stat;
 try{stat=await fs.lstat(filename);}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;if(names.length)throw Error('VERSION_CONFLICT: AGENTS文档在读取前被删除');return{path:filename,exists:false,content:'',fullHash:null,parts:splitAgentsDocument('')};}
 try{if(stat.isSymbolicLink()||!stat.isFile())throw Error('PERMISSION_DENIED: AGENTS文档必须是项目根目录普通文件，不能是链接');if(stat.size>AGENTS_DOCUMENT_MAX_BYTES)throw Error('AGENT_INDEX_TOO_LARGE: AGENTS.md超过128KiB，已保留原文件');const real=await fs.realpath(filename),relative=path.relative(realRoot,real);if(process.platform==='win32'?relative.toLowerCase()!==canonical.toLowerCase():relative!==canonical)throw Error('PERMISSION_DENIED: AGENTS文档路径越界');content=await fs.readFile(filename,'utf8');const latest=await fs.lstat(filename);if(latest.isSymbolicLink()||latest.ino!==stat.ino||latest.mtimeMs!==stat.mtimeMs||latest.size!==stat.size)throw Error('VERSION_CONFLICT: AGENTS文档在读取中变化');exists=true;}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')throw Error('VERSION_CONFLICT: AGENTS文档在读取中被删除');throw error;}
 return{path:filename,exists,content,fullHash:exists?documentHash(content):null,parts:validateAgentsDocument(content)};
}
export async function assertAgentsSnapshot(root:string,expected:AgentsSnapshot,legacy=false){const current=await readAgentsDocument(root,legacy);if(current.exists!==expected.exists||current.fullHash!==expected.fullHash||current.path!==expected.path)throw Error('VERSION_CONFLICT: AGENTS文档已修改，原内容已保留');return current;}
export async function writeAgentsDocument(root:string,expected:AgentsSnapshot,content:string,validate?:()=>void|Promise<void>){validateAgentsDocument(content);await assertAgentsSnapshot(root,expected);const temporary=expected.path+'.'+randomUUID()+'.tmp';try{await fs.writeFile(temporary,content,{flag:'wx'});await assertAgentsSnapshot(root,expected);await validate?.();await fs.rename(temporary,expected.path);}finally{await fs.rm(temporary,{force:true});}}
export function mergeLegacyManual(current:AgentsParts,legacy:AgentsParts){
 const legacyManual=(legacy.prefix==='# 项目资料索引\n\n'?'':legacy.prefix)+legacy.suffix;if(!legacyManual.trim())return current;
 const hash=documentHash(legacyManual),marker=`<!-- slash:legacy-agent-manual:${hash} -->`,block=`${marker}\n${legacyManual}\n<!-- slash:legacy-agent-manual:end -->`;
 if(current.manual.includes(marker)){if(!current.manual.includes(block))throw Error('VERSION_CONFLICT: 已合并的旧agent.md人工内容被修改，保留两份文件待核对');return current;}
 const prefix=current.prefix+(current.prefix&&!current.prefix.endsWith('\n')?'\n':'')+'\n'+block+'\n';return{...current,prefix,manual:prefix+current.suffix};
}
