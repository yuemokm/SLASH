import {createHash} from 'node:crypto';
import path from 'node:path';
import {INDEX_START,INDEX_END,splitAgentsDocument} from './agents-document.js';
import type {AgentIndexContextReceipt} from '../shared/agent-index-context.js';

export const MANAGED_INDEX_CONTEXT_LIMIT=6000;
const digest=(text:string)=>createHash('sha256').update(text).digest('hex');
const json=(value:unknown)=>JSON.stringify(value).replaceAll('<','\\u003c');
type Structure={id:string;path:string;role:string;purpose:string};
type Entry={mountId:string;path:string;category:string};
function records(managed:string){
 const structures:Structure[]=[],entries:Entry[]=[];let diskTruncated=false;
 for(const line of managed.split(/\r?\n/)){
  let value:unknown;try{value=JSON.parse(line.replace(/^索引状态：/,''));}catch{continue;}
  if(Array.isArray(value)){for(const item of value)if(item&&['id','path','role','purpose'].every(key=>typeof item[key]==='string'))structures.push({id:item.id,path:item.path,role:item.role,purpose:item.purpose});}
  else if(value&&typeof value==='object'){
   const item=value as Record<string,unknown>;
   if(['mountId','path','category'].every(key=>typeof item[key]==='string'))entries.push({mountId:item.mountId as string,path:item.path as string,category:item.category as string});
   if(typeof item.truncated==='boolean')diskTruncated=item.truncated;
  }
 }
 return{structures,entries,diskTruncated};
}

/** Read-only projection of the existing managed partition, never the manual
 * rules. Actual paths are either copied whole or omitted, never shortened. */
export function managedIndexContext(managed:string,documentHash:string):{content:string;receipt:AgentIndexContextReceipt}{
 const parts=splitAgentsDocument(managed);if(parts.manual||parts.managed!==managed)throw Error('INDEX_CONTEXT_PARTITION_INVALID: 只允许投影自动索引，不可包含人工规则');
 const parsed=records(managed),base={version:'managed-index-context-v1' as const,bodyRead:false as const,limit:MANAGED_INDEX_CONTEXT_LIMIT,sourceCharacters:managed.length,managedHash:digest(managed),structureCount:parsed.structures.length,entryCount:parsed.entries.length};
 if(managed.length<=MANAGED_INDEX_CONTEXT_LIMIT)return{content:managed,receipt:{...base,mode:'full',coverage:parsed.diskTruncated?'partial':'full',includedCharacters:managed.length,contentHash:digest(managed),includedStructures:parsed.structures.length,includedEntries:parsed.entries.length}};
 const groups=new Map<string,{mountId:string;directory:string;indexedEntries:number;entries:Entry[]}>();
 for(const entry of parsed.entries){const directory=path.posix.dirname(entry.path.replaceAll('\\','/')),key=entry.mountId+'\0'+directory;let group=groups.get(key);if(!group){group={mountId:entry.mountId,directory,indexedEntries:0,entries:[]};groups.set(key,group);}group.indexedEntries++;group.entries.push(entry);}
 const data={schemaVersion:1,kind:'managed_index_summary',coverage:'partial',bodyRead:false,documentHash,managedHash:base.managedHash,sourceCharacters:managed.length,diskIndexTruncated:parsed.diskTruncated,indexedStructures:parsed.structures.length,indexedEntries:parsed.entries.length,indexedDirectories:groups.size,structures:[] as Structure[],directories:[] as Array<{mountId:string;directory:string;indexedEntries:number}>,entries:[] as Entry[],omittedStructures:parsed.structures.length,omittedDirectories:groups.size,omittedEntries:parsed.entries.length};
 const render=()=>`${INDEX_START}\n## 自动资料索引摘要（partial）\n此摘要只包含原自动索引中的目录计数与有限真实路径，不含人工规则或资料正文，不改变授权。原磁盘AGENTS.md索引及全文hash保留；计数仅指磁盘索引已记录项，原扫描/大小上限可能使磁盘索引本身也不完整。人工规则在独立区域完整提供，不得用本摘要替代。\n${json(data)}\n其余资料按需用search_files关键词检索和read_file/read_image读取；技能使用list_skills/load_skill。路径存在不是已阅读的证据，摘要不能证明完整业务覆盖。\n${INDEX_END}`;
 const add=(collection:'structures'|'directories'|'entries',item:Structure|Entry|{mountId:string;directory:string;indexedEntries:number})=>{
  const list=data[collection] as unknown[];list.push(item);data.omittedStructures=parsed.structures.length-data.structures.length;data.omittedDirectories=groups.size-data.directories.length;data.omittedEntries=parsed.entries.length-data.entries.length;
  if(render().length<=MANAGED_INDEX_CONTEXT_LIMIT)return true;list.pop();data.omittedStructures=parsed.structures.length-data.structures.length;data.omittedDirectories=groups.size-data.directories.length;data.omittedEntries=parsed.entries.length-data.entries.length;return false;
 };
 // Reserve room for source locations instead of spending the packet on tree
 // labels alone. Round-robin paths preserve visibility across indexed folders.
 for(const structure of parsed.structures.slice(0,16)){if(render().length>2800)break;add('structures',structure);}
 const folders=[...groups.values()];for(const group of folders.slice(0,12)){if(render().length>3800)break;add('directories',{mountId:group.mountId,directory:group.directory,indexedEntries:group.indexedEntries});}
 let remaining=true;for(let index=0;remaining&&data.entries.length<24;index++){remaining=false;for(const group of folders){const entry=group.entries[index];if(!entry)continue;remaining=true;add('entries',entry);if(data.entries.length>=24)break;}}
 const content=render();if(content.length>MANAGED_INDEX_CONTEXT_LIMIT)throw Error('INDEX_CONTEXT_TOO_LARGE: 索引身份信息超过上下文摘要上限');
 return{content,receipt:{...base,mode:'summary',coverage:'partial',includedCharacters:content.length,contentHash:digest(content),includedStructures:data.structures.length,includedEntries:data.entries.length}};
}
