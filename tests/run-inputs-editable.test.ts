import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {RunInputQueue,type RunInputDependencies} from '../main/run-inputs.js';
import {requestSchema} from '../shared/types.js';
import type {RunInputRecord} from '../shared/run-inputs.js';

function fixture(prepare:RunInputDependencies['prepareUserInput']=async text=>text){
 let records:RunInputRecord[]=[],streaming=true;const sent:{delivery:string,text:string}[]=[];
 const queue=new RunInputQueue({runId:'r',read:()=>records,write:items=>{records=structuredClone(items);},assertCurrent:()=>{},prepareUserInput:prepare});
 queue.attach({get isStreaming(){return streaming;},steer:async text=>{sent.push({delivery:'steer',text});},followUp:async text=>{sent.push({delivery:'follow_up',text});},clearQueue:()=>({steering:[],followUp:[]})});
 const enqueue=(text:string)=>queue.enqueue({runId:'r',requestId:randomUUID(),text,delivery:'follow_up'});
 return{queue,enqueue,sent,records:()=>records,stop:()=>{streaming=false;queue.finish();}};
}
test('宿主follow_up直到安全边界才提交；CAS编辑/单项取消保留其他项；重复旧revision拒绝',async()=>{
 const f=fixture(),a=f.enqueue('原文字'),b=f.enqueue('删除项'),c=f.enqueue('其他项');await f.queue.flush();assert.equal(f.sent.length,0);
 f.queue.mutate({runId:'r',inputId:a.id,expectedRevision:0,action:'edit',text:'新文字'});
 assert.throws(()=>f.queue.mutate({runId:'r',inputId:a.id,expectedRevision:0,action:'cancel'}),/RUN_INPUT_CHANGED/);
 f.queue.mutate({runId:'r',inputId:b.id,expectedRevision:0,action:'cancel'});await f.queue.flushAtBoundary();assert.equal(f.sent.length,1);assert.equal(f.records()[2].submittedAt,undefined);await f.queue.flushAtBoundary();
 assert.equal(f.sent.length,2);assert.match(f.sent[0].text,/新文字$/);assert.match(f.sent[1].text,/其他项$/);assert.equal(f.records()[1].reason,'RUN_INPUT_USER_CANCELLED');
 assert.throws(()=>f.queue.mutate({runId:'r',inputId:c.id,expectedRevision:0,action:'cancel'}),/RUN_INPUT_NOT_EDITABLE/);await f.queue.flushAtBoundary();assert.equal(f.sent.length,2);
});
test('立即发出只晋升指定消息为steer；其他follow_up仍可编辑；真实回执后不能再修改',async()=>{
 const f=fixture(),a=f.enqueue('立即项'),b=f.enqueue('后续项');f.queue.mutate({runId:'r',inputId:a.id,expectedRevision:0,action:'send_now'});await f.queue.flush();
 assert.deepEqual(f.sent.map(item=>item.delivery),['steer']);assert.equal(f.records()[1].submittedAt,undefined);f.queue.observeUserMessage(f.sent[0].text,10);
 assert.throws(()=>f.queue.mutate({runId:'r',inputId:a.id,expectedRevision:1,action:'edit',text:'过期修改'}),/RUN_INPUT_NOT_EDITABLE/);
 f.queue.mutate({runId:'r',inputId:b.id,expectedRevision:0,action:'edit',text:'后续更新'});await f.queue.flushAtBoundary();assert.match(f.sent[1].text,/后续更新$/);
});
test('prepare await期间编辑会阻止旧文本授权副作用且不取消新版；取消也阻止commit',async()=>{
 for(const action of ['edit','cancel'] as const){
  let entered!:()=>void,release!:()=>void;const start=new Promise<void>(resolve=>{entered=resolve;}),gate=new Promise<void>(resolve=>{release=resolve;});let committed=0;
  const f=fixture(async(text,_record,guard)=>{if(text==='旧输入'){entered();await gate;guard();committed++;}return text;});
  const a=f.enqueue('旧输入');const flushing=f.queue.flushAtBoundary();await start;
  f.queue.mutate({runId:'r',inputId:a.id,expectedRevision:0,action,...(action==='edit'?{text:'新输入'}:{})});release();await flushing;assert.equal(committed,0);
  assert.equal(f.records()[0].status,action==='edit'?'queued':'cancelled');assert.equal(f.sent.length,action==='edit'?1:0);if(action==='edit')assert.match(f.sent[0].text,/新输入$/);
 }
});
test('原生发送拒绝保留unknown、不重发；结束不能mutation；IPC拒绝权限夹带与无效正文',async()=>{
 const f=fixture(),a=f.enqueue('结束保留');f.stop();assert.throws(()=>f.queue.mutate({runId:'r',inputId:a.id,expectedRevision:0,action:'send_now'}),/RUN_INPUT_NOT_ACTIVE/);assert.equal(f.records()[0].text,'结束保留');
 const input={type:'runInputMutate',runId:'r',inputId:randomUUID(),expectedRevision:0,action:'edit',text:'x'};assert(requestSchema.safeParse(input).success);
 for(const patch of [{permissionMode:'full_access'},{expectedRevision:-1},{text:''},{action:'cancel'}])assert.equal(requestSchema.safeParse({...input,...patch}).success,false);
});
