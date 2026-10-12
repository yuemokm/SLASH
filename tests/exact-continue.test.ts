import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {Service} from '../main/service.js';
import {Store} from '../main/store.js';
import type {RuntimeOptions} from '../main/agent.js';

async function fixture(t:test.TestContext,handler:(o:RuntimeOptions,text:string,s:Service)=>Promise<void>){
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'slash-exact-continue-')),store=new Store(path.join(dir,'data'));
 // Exact continuation creates a new Run; host repair prompts within one Run
 // must not re-execute this scripted continuation. Quality failure remains.
 const service=new Service(store,()=> 'offline-key',()=>{},async o=>{let prompts=0;return{messages:[{role:'assistant',stopReason:'stop',content:[{type:'text',text:'精确继续夹具回复。'}]}],abort:async()=>{},dispose:()=>{},prompt:async(text:string)=>{if(prompts++>0){assert.match(text,/^宿主已对当前草稿执行检查。这是本任务第[12]\/2轮有限修正/);assert.match(text,/<untrusted_host_check_observations>/);o.delta('夹具仅验证继续，质量问题保持未修复。');return;}await handler(o,text,service);o.delta('完成');}};});
 t.after(async()=>{service.dispose();await Promise.allSettled([...(service as any).agentIndex.queues.values()]);store.close();await fs.rm(dir,{recursive:true,force:true,maxRetries:5,retryDelay:30});});
 await service.workspace(path.join(dir,'project'));service.state.models=[{id:'offline-model',name:'Fixture',provider:'custom',modelId:'fixture',baseUrl:'https://fixture.invalid/v1',protocol:'openai-completions',hasKey:true},{id:'other-model',name:'Other',provider:'custom',modelId:'other',baseUrl:'https://fixture.invalid/v1',protocol:'openai-completions',hasKey:true}];service.state.defaultModelId='offline-model';service.save();return{service,store};
}
async function done(s:Service,id:string){for(let i=0;i<500;i++){const run=s.state.runs.find(item=>item.id===id);if(run&&['succeeded','failed','interrupted','cancelled','awaiting_plan'].includes(run.status))return run;await new Promise(resolve=>setTimeout(resolve,10));}throw Error('offline task timeout');}

test('精确trim继续/继续任务沿官方resume同卡编辑，空附件数组仍可恢复，内部prompt不会递归',async t=>{
 for(const text of [' 继续 ','继续任务']){
  let attempt=0,first='',changeId='';
  const {service}=await fixture(t,async(o,prompt,s)=>{const target={mountId:s.state.mounts.find(m=>m.name==='成果')!.id,path:'index.html'};if(++attempt===1){first=o.runId;const change=await o.files.draft(target.mountId,target.path,'<main>one</main>',o.runId);changeId=change.id;o.draft(change);throw Error('FIXTURE_FAILURE');}assert.equal(s.state.runs.find(r=>r.id===o.runId)?.resumedFromRunId,first);assert.match(prompt,/恢复检查点/);const read=await o.readDraft!(target);await o.editDraft!({...target,changeId:read.changeId,expectedContentHash:read.contentHash,oldText:'one',newText:'two'});});
  const c=service.conversation();await done(service,await service.send(c,'原任务','build','standard','offline-model'));const next=await service.send(c,text,'build','standard','offline-model',undefined,undefined,'general',[]);assert.equal((await done(service,next)).status,'succeeded');assert.equal(attempt,2);assert.equal(service.state.changes.length,1);assert.equal(service.state.changes[0].id,changeId);assert.equal(service.state.changes[0].runId,next);assert.equal(service.state.changes[0].originRunId,first);
 }
});

test('标点/附加指令、模式/权限/模型/显式思考变化、附件/工作流均保持普通send',async t=>{
 const cases=[
  {text:'继续。'}, {text:'继续并改变标题'}, {text:'继续',mode:'plan'}, {text:'继续',permission:'full_access'}, {text:'继续',model:'other-model'}, {text:'继续',thinking:'low'}, {text:'继续',attachments:['synthetic-image']}, {text:'继续',workflow:{kind:'research',sources:[]}},
 ];
 for(const item of cases){
  let attempt=0,observedRelation:string|undefined;
  const {service}=await fixture(t,async(o,_text,s)=>{if(++attempt===1)throw Error('FIXTURE_FAILURE');observedRelation=s.state.runs.find(r=>r.id===o.runId)?.resumedFromRunId;});
  const c=service.conversation(),first=await service.send(c,'原任务','build','standard','offline-model');await done(service,first);
  try{const id=await service.send(c,item.text,item.mode as never??'build',item.permission as never??'standard',item.model??'offline-model',undefined,undefined,'general',item.attachments,item.workflow as never,item.thinking as never);const run=await done(service,id);assert.equal(run.resumedFromRunId,undefined);}catch(error){assert.match(String(error),/THINKING_LEVEL_UNAVAILABLE|MODEL_CREDENTIAL_MISSING/);}
  assert.equal(observedRelation,undefined);assert.equal(service.state.runs.find(r=>r.id===first)?.resumable,true);
 }
});

test('只考虑startedAt最新Run，后续已成功或普通失败不可恢复不会找更旧失败Run',async t=>{
 let attempt=0;
 const {service}=await fixture(t,async(_o,_text)=>{if(++attempt===1)throw Error('FIXTURE_FAILURE');});const c=service.conversation(),old=await service.send(c,'旧失败','build','standard','offline-model');await done(service,old);const newer=await service.send(c,'新成功','build','standard','offline-model');await done(service,newer);
 // Put the older failure first in storage to verify ordering is by timestamps.
 service.state.runs.find(r=>r.id===old)!.startedAt='2020-01-01T00:00:00.000Z';service.state.runs.sort((a,b)=>a.id===old?-1:b.id===old?1:0);
 const id=await service.send(c,'继续','build','standard','offline-model');assert.equal((await done(service,id)).resumedFromRunId,undefined);assert.equal(service.state.runs.find(r=>r.id===old)?.resumable,true);
 const latest=service.state.runs.find(r=>r.id===id)!;latest.status='failed';latest.resumable=false;latest.startedAt='2099-01-01T00:00:00.000Z';
 const afterUnrecoverable=await service.send(c,'继续任务','build','standard','offline-model');assert.equal((await done(service,afterUnrecoverable)).resumedFromRunId,undefined);assert.equal(service.state.runs.find(r=>r.id===old)?.resumable,true);
});
