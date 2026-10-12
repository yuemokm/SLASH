import {createHash} from 'node:crypto';
import {z} from 'zod';
import {readDraftSchema,editDraftSchema} from '../shared/draft-edit.js';

type DraftTool='read_draft'|'edit_draft';
export type DraftInputRejection={tool:DraftTool;toolCallHash:string;stage:'pi_schema'|'execute_schema';reason:'missing_replacement'|'mixed_replacement'|'schema_invalid';issueCount:number;state:'failed'|'cancelled'};
type Pending=Omit<DraftInputRejection,'state'>;
const object=(v:unknown):Record<string,unknown>|undefined=>v!==null&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:undefined;
const callHash=(id:string)=>createHash('sha256').update(id).digest('hex');

/** Retains validation categories only, never arguments, Zod messages or tool results. */
export class DraftInputRejectionObserver{
 private pending=new Map<string,Pending>();
 private started=new Map<string,DraftTool>();
 private enabled=new Set<string>();
 private ended=new Set<string>();
 private active=true;
 private closed=false;
 constructor(private report:((value:DraftInputRejection)=>void)|undefined,private signal?:AbortSignal){}
 enable(names:Iterable<string>){if(!this.closed)this.enabled=new Set(names);}
 begin(){if(!this.closed&&!this.signal?.aborted)this.active=true;}
 finish(){this.active=false;this.pending.clear();this.started.clear();}
 close(){this.closed=true;this.finish();this.ended.clear();this.enabled.clear();}
 private remember(id:string,tool:DraftTool,input:unknown,stage:Pending['stage']){
  const parsed=(tool==='read_draft'?readDraftSchema:editDraftSchema).safeParse(input);if(parsed.success)return;
  const args=object(input),has=(key:string)=>args!==undefined&&Object.hasOwn(args,key)&&args[key]!==undefined;
  const reason=tool==='edit_draft'&&args?(has('edits')&&(has('oldText')||has('newText'))?'mixed_replacement':!has('edits')&&(!has('oldText')||!has('newText'))?'missing_replacement':'schema_invalid'):'schema_invalid';
  this.pending.set(id,{tool,toolCallHash:id,stage,reason,issueCount:parsed.error.issues.length});
 }
 parse<T extends z.ZodType>(id:string,tool:DraftTool,schema:T,input:unknown):z.output<T>{
  id=callHash(id);
  try{const parsed=schema.parse(input);this.pending.delete(id);return parsed;}catch(error){
   if(error instanceof z.ZodError&&!this.closed&&this.active&&this.started.get(id)===tool)this.remember(id,tool,input,'execute_schema');
   throw error;
  }
 }
 observe(input:unknown){
  if(this.closed||!this.active||!this.report)return;const e=object(input);if(!e)return;
  if(e.type==='agent_settled'){this.finish();return;}
  if(typeof e.toolCallId!=='string')return;
  const id=callHash(e.toolCallId);
  if(e.type==='tool_execution_start'){
   if(this.signal?.aborted||this.ended.has(id)||this.started.has(id)||!this.enabled.has(String(e.toolName)))return;
   if(e.toolName==='read_draft'||e.toolName==='edit_draft'){this.started.set(id,e.toolName);this.remember(id,e.toolName,e.args,'pi_schema');}
  }else if(e.type==='tool_execution_end'){
   if(this.started.get(id)!==e.toolName)return;
   this.ended.add(id);
   const pending=this.pending.get(id);this.pending.delete(id);this.started.delete(id);
   if(!pending||e.toolName!==pending.tool||e.isError!==true)return;
   // Start is before Pi preparation/coercion and also fires for truncated or
   // aborted calls. Only Pi's fixed validation prefix proves native rejection.
   const result=object(e.result),content=Array.isArray(result?.content)?result.content:[];
   const nativeRejected=content.some(block=>{const value=object(block);return value?.type==='text'&&typeof value.text==='string'&&value.text.slice(0,80).startsWith(`Validation failed for tool "${pending.tool}":\n`);});
   if(pending.stage==='execute_schema'||nativeRejected)this.report({...pending,state:this.signal?.aborted?'cancelled':'failed'});
  }
 }
}
