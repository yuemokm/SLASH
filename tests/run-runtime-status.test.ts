import test from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {Store} from '../main/store.js';
import {Service} from '../main/service.js';
import {RunRuntimeStatus} from '../src/RunRuntimeStatus.js';
import type {Run} from '../shared/types.js';

const time='2026-10-07T00:00:00.000Z';
const draw=(run:Run,active=false)=>renderToStaticMarkup(createElement(RunRuntimeStatus,{run,active,onClear:()=>{}}));
test('真实持久恢复保留退出前重试/压缩事实，但历史UI明确本轮停止且未继续；不造完成事件',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'slash-run-status-history-')),store=new Store(dir);let created=0;
 store.set('state',{root:'',mounts:[],conversations:[],changes:[],connections:[],model:{baseUrl:'http://127.0.0.1',id:'fixture',hasKey:false},runs:[{id:'r',conversationId:'c',startedAt:time,status:'running',runtimeStatus:{updatedAt:time,activity:'compacting',retry:{attempt:1,maxAttempts:3,delayMs:2000,status:'waiting'},compaction:{reason:'threshold',status:'running'},summaryRetry:{attempt:1,maxAttempts:2,delayMs:2000,status:'waiting'}}}]});
 const service=new Service(store,()=>'',()=>{},async()=>{created++;throw Error('NO_REPLAY');});t.after(async()=>{service.dispose();store.close();await fs.rm(dir,{recursive:true,force:true});});const run=service.state.runs[0],view=draw(run);
 assert.equal(run.status,'interrupted');assert.equal(run.runtimeStatus?.compaction?.status,'running');assert.equal(run.runtimeStatus?.retry?.status,'waiting');assert.match(view,/本轮已停止/);assert.match(view,/最后收到的运行记录/);assert.match(view,/不代表仍在执行/);assert.doesNotMatch(view,/role="status"|恢复成功|已完成/);assert.equal(created,0);
});
test('停止与等待授权优先于最近native工具事件；发送前明确本轮冻结配置',()=>{
 const run:Run={id:'r',conversationId:'c',startedAt:time,status:'cancelling',mode:'plan',permissionMode:'standard',modelEntryId:'same-model',runtimeStatus:{activity:'tool',updatedAt:time}};const stopping=draw(run,true);
 assert.match(stopping,/正在停止任务/);assert.doesNotMatch(stopping,/正在执行工具/);assert.match(stopping,/本轮补充沿用：研究方案/);assert.match(stopping,/same-model/);assert.match(stopping,/底部设置用于下次任务/);
 assert.match(draw({...run,status:'waiting_user'},true),/等待授权确认/);
});
test('未知上下文不造百分比，摘要重试结束不称成功，产品说明不暴露实现细节',()=>{
 const view=draw({id:'r',conversationId:'c',status:'interrupted',startedAt:time,runtimeStatus:{updatedAt:time,activity:'settled',context:{tokens:null,percent:null,contextWindow:64000,source:'pi-estimate'},summaryRetry:{attempt:1,maxAttempts:2,delayMs:50,status:'completed'}},inputs:[{id:'x',requestId:'y',text:'合成补充',delivery:'steer',status:'unknown',createdAt:time,reason:'RUN_INPUT_RESTART_UNCONFIRMED'}]});
 assert.match(view,/上下文占用（估算）：暂不可用/);assert.match(view,/摘要重试结束/);assert.match(view,/重启后未确认送达的内容不会自动重发/);assert.doesNotMatch(view,/任务进度|摘要成功|原子|Pi会话|0\.0%/);
});
