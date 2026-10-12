import test from 'node:test';
import assert from 'node:assert/strict';
import {validateToolArguments} from '@earendil-works/pi-ai';
import {editDraftSchema,readDraftSchema} from '../shared/draft-edit.js';
import {toolInputSchema} from '../main/tool-input-schema.js';
import {DraftInputRejectionObserver,type DraftInputRejection} from '../main/draft-input-rejections.js';

const target={mountId:'out',path:'index.html',expectedContentHash:'a'.repeat(64)};
test('模型 JSON Schema 和执行 schema 同时要求单对或批量且互斥，所有既有合法形状保留',()=>{
 const schema=toolInputSchema(editDraftSchema);
 assert.equal(schema.type,'object');assert.equal(schema.anyOf.length,2);
 for(const branch of schema.anyOf){assert.equal(branch.type,'object');assert.equal(branch.additionalProperties,false);}
 assert.deepEqual(schema.anyOf[0].required,['mountId','path','expectedContentHash','oldText','newText']);assert.deepEqual(schema.anyOf[0].properties.edits,{not:{}});
 assert.deepEqual(schema.anyOf[1].required,['mountId','path','expectedContentHash','edits']);assert.deepEqual(schema.anyOf[1].properties.oldText,{not:{}});assert.deepEqual(schema.anyOf[1].properties.newText,{not:{}});assert.equal(schema.anyOf[1].properties.edits.items.additionalProperties,false);
 for(const input of [target,{...target,oldText:'a'},{...target,newText:''},{...target,edits:[]},{...target,oldText:'a',newText:'b',edits:[{oldText:'a',newText:'b'}]},{...target,oldText:'a',newText:'b',unknown:'PRIVATE'}]){
  assert.equal(editDraftSchema.safeParse(input).success,false);assert.throws(()=>validateToolArguments({name:'edit_draft',description:'fixture',parameters:schema},{id:'fixture',type:'toolCall',name:'edit_draft',arguments:input}));
 }
 for(const input of [{...target,oldText:'a',newText:''},{...target,changeId:'pending',edits:[{oldText:'a',newText:'b'},{oldText:'c',newText:''}]}]){
  assert.equal(editDraftSchema.safeParse(input).success,true);assert.deepEqual(validateToolArguments({name:'edit_draft',description:'fixture',parameters:schema},{id:'fixture',type:'toolCall',name:'edit_draft',arguments:input}),input);
 }
});

test('native pre-execute 与 execute Zod 拒绝只在错误结束时记一次安全类别；合法工具不重复',()=>{
 const events:DraftInputRejection[]=[],observer=new DraftInputRejectionObserver(v=>events.push(v));observer.enable(['read_draft','edit_draft']);
 const start=(id:string,tool:string,args:unknown)=>observer.observe({type:'tool_execution_start',toolCallId:id,toolName:tool,args});
 const end=(id:string,tool:string,isError=true)=>observer.observe({type:'tool_execution_end',toolCallId:id,toolName:tool,isError,result:{content:[{type:'text',text:`Validation failed for tool "${tool}":\nPRIVATE_NATIVE_DETAIL`}]}});
 start('missing','edit_draft',{...target,unknown:'PRIVATE_SECRET'});assert.equal(events.length,0);end('missing','edit_draft');end('missing','edit_draft');
 start('zod','edit_draft',{...target,oldText:'a',newText:'b'});
 assert.throws(()=>observer.parse('zod','edit_draft',editDraftSchema,{...target,oldText:'PRIVATE_OLD',newText:'PRIVATE_NEW',edits:[{oldText:'PRIVATE_OLD',newText:'PRIVATE_NEW'}]}));end('zod','edit_draft');
 start('read','read_draft',{mountId:'out',path:'index.html',limit:0});end('read','read_draft');
 start('ok','edit_draft',{...target,oldText:'a',newText:'b'});observer.parse('ok','edit_draft',editDraftSchema,{...target,oldText:'a',newText:'b'});end('ok','edit_draft',false);
 start('coerced','read_draft',{mountId:'out',path:'index.html',offset:'0'});
 observer.parse('coerced','read_draft',readDraftSchema,{mountId:'out',path:'index.html',offset:0});end('coerced','read_draft');
 for(const [id,text] of [['truncated','Tool call was not executed: output token limit'],['aborted','Operation aborted'],['unavailable','Tool read_draft not found']]){
  start(id,'read_draft',{});observer.observe({type:'tool_execution_end',toolCallId:id,toolName:'read_draft',isError:true,result:{content:[{type:'text',text}]}});
 }
 start('other','write_draft',{});end('other','write_draft');
 assert.deepEqual(events.map(v=>[v.tool,v.stage,v.reason]),[['edit_draft','pi_schema','missing_replacement'],['edit_draft','execute_schema','mixed_replacement'],['read_draft','pi_schema','schema_invalid']]);
 assert.doesNotMatch(JSON.stringify(events),/PRIVATE|mountId|index.html|arguments|oldText|newText/);
 assert.equal(events.every(v=>/^[a-f0-9]{64}$/.test(v.toolCallHash)),true);
});

test('取消中的拒绝只关联已开始工具；结束或不可用工具的迟到事件忽略',()=>{
 const events:DraftInputRejection[]=[],controller=new AbortController(),observer=new DraftInputRejectionObserver(v=>events.push(v),controller.signal);observer.enable(['read_draft']);
 observer.observe({type:'tool_execution_start',toolCallId:'blocked',toolName:'edit_draft',args:{}});
 observer.observe({type:'tool_execution_end',toolCallId:'blocked',toolName:'edit_draft',isError:true});
 observer.observe({type:'tool_execution_start',toolCallId:'started',toolName:'read_draft',args:{}});controller.abort();
 observer.observe({type:'tool_execution_end',toolCallId:'started',toolName:'read_draft',isError:true,result:{content:[{type:'text',text:'Validation failed for tool "read_draft":\n'}]}});
 observer.observe({type:'tool_execution_start',toolCallId:'late',toolName:'read_draft',args:{}});
 observer.observe({type:'tool_execution_end',toolCallId:'late',toolName:'read_draft',isError:true});observer.close();
 assert.equal(events.length,1);assert.equal(events[0].state,'cancelled');
 assert.throws(()=>observer.parse('closed','read_draft',readDraftSchema,{}));assert.equal(events.length,1);
});

test('重复start/end只记一次；错名end、终态迟到及close后begin不能复活观察',()=>{
 const events:DraftInputRejection[]=[],observer=new DraftInputRejectionObserver(value=>events.push(value));observer.enable(['edit_draft']);
 const start=(id:string)=>observer.observe({type:'tool_execution_start',toolCallId:id,toolName:'edit_draft',args:target});
 const end=(id:string,toolName='edit_draft')=>observer.observe({type:'tool_execution_end',toolCallId:id,toolName,isError:true,result:{content:[{type:'text',text:'Validation failed for tool "edit_draft":\nPRIVATE'}]}});
 start('one');start('one');end('one','read_draft');end('one');start('one');end('one');assert.equal(events.length,1);
 start('unfinished');observer.observe({type:'agent_settled'});end('unfinished');start('late');end('late');assert.equal(events.length,1);
 observer.begin();start('next-prompt');end('next-prompt');assert.equal(events.length,2);
 observer.close();observer.begin();observer.enable(['edit_draft']);start('closed');end('closed');assert.equal(events.length,2);
});

test('原始start无效但规范化parse成功时，后续执行错误不误记为schema拒绝',()=>{
 const events:DraftInputRejection[]=[],observer=new DraftInputRejectionObserver(value=>events.push(value));observer.enable(['read_draft']);
 observer.observe({type:'tool_execution_start',toolCallId:'coerced',toolName:'read_draft',args:{mountId:'out',path:'index.html',limit:'8'}});
 observer.parse('coerced','read_draft',readDraftSchema,{mountId:'out',path:'index.html',limit:8});
 observer.observe({type:'tool_execution_end',toolCallId:'coerced',toolName:'read_draft',isError:true,result:{content:[{type:'text',text:'VERSION_CONFLICT: PRIVATE'}]}});
 assert.equal(events.length,0);
});
