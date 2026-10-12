import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {Service} from '../main/service.js';
import {Store} from '../main/store.js';
import {hash} from '../main/files.js';
import type {RuntimeOptions} from '../main/agent.js';
import {piMemoryDirectory} from '../main/pi-memory.js';
import {productRecordsWorkspaceIdentity} from '../main/product-records.js';

async function wait(service:Service,id:string){for(let n=0;n<2000;n++){const run=service.state.runs.find(run=>run.id===id)!;if(run.finishedAt&&!service.active.has(id)&&!service.starting.has(id))return run;await new Promise(resolve=>setTimeout(resolve,10));}throw Error('memory service fixture timeout');}
test('real Service gateway binds host-read versions even if model omits sources, preserves origin across chats, and blocks Plan writes plus revoked-source restoration',{timeout:60000},async t=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'slash-memory-service-')),store=new Store(path.join(directory,'profile'));let stage='write',saved:any,options!:RuntimeOptions,restoration:string;
 const service=new Service(store,()=> 'local-only-fixture-key',()=>{},async o=>{options=o;return{messages:[{role:'assistant',stopReason:'stop'}],abort:async()=>{},dispose:()=>{},prompt:async()=>{
  const call=(name:any,args:any)=>o.log(name,args,()=>o.memoryTool!(name,args));
  if(stage==='write'){
   const text=await o.files.read(source.mountId,source.path);await o.sourceRead!({...source,versionId:'read:actual',contentHash:hash(text),readAt:new Date().toISOString(),characters:text.length,includedCharacters:text.length,truncated:false});
   saved=await call('memory_write',{title:'来源备忘',text:'退回原因尚需业务确认'});assert.equal(saved.sourceCount,1);assert.equal(saved.status,'candidate');
  }else if(stage==='plan'){
   const value:any=await call('memory_read',{});assert.equal(value.total,1);assert.equal(value.items[0].origin.runId,saved.origin.runId);assert.equal(value.items[0].sources[0].contentHash,hash('实际文件来源：退回需要原因'));
   await assert.rejects(call('memory_write',{title:'no',text:'no'}),/PLAN_TOOL_DENIED/);
   await assert.rejects(o.memoryTool!('memory_forget',{id:saved.id}),/PLAN_TOOL_DENIED/);
  }else if(stage==='forget'){
   const receipt:any=await call('memory_forget',{id:saved.id});restoration=receipt.recoveryId;
  }else if(stage==='refresh'){
   await fs.writeFile(path.join(resource.path,source.path),'更新证据：原因字段变为可选');
   const old:any=await call('memory_read',{});assert.equal(old.items[0].sourceState,'stale');assert.match(old.sourceWarning,/来源已变化/);
   const text=await o.files.read(source.mountId,source.path);await o.sourceRead!({...source,versionId:'read:new-actual',contentHash:hash(text),readAt:new Date().toISOString(),characters:text.length,includedCharacters:text.length,truncated:false});
   const refreshed:any=await call('memory_write',{title:'更新来源备忘',text:'重新读取后的候选'});assert.equal(refreshed.sourceCount,1);
   const value:any=await call('memory_read',{query:'更新来源'});assert.equal(value.items[0].sourceState,'current');assert.equal(value.items[0].sources[0].contentHash,hash(text));
  }else if(stage==='revoked'){
   const value:any=await call('memory_read',{});assert.equal(value.total,0);
   await assert.rejects(call('memory_restore',{recoveryId:restoration}),/RECOVERY_UNAVAILABLE/);
  }
  o.delta('仅本机记忆接线验收，不代表业务确认。');
 }} as never;},{fetchModelMetadata:async()=>{throw Error('NO_CLOUD_IN_MEMORY_FIXTURE');}});
 t.after(async()=>{service.dispose();await Promise.allSettled([...(service as any).agentIndex.queues.values()]);store.close();await fs.rm(directory,{recursive:true,force:true,maxRetries:5,retryDelay:40});});
 await service.workspace(path.join(directory,'project'));service.setPermission('workspace_read','allow');service.setPermission('artifact_write','allow');
 const resource=service.state.mounts.find(mount=>mount.name==='资源')!,source={mountId:resource.id,path:'参考资料/source.md'};
 await fs.writeFile(path.join(resource.path,source.path),'实际文件来源：退回需要原因');
 const start=async(mode:'build'|'plan')=>{const id=await service.send(service.conversation(),'本机记忆接线验收',mode,'standard');const run=await wait(service,id);assert.equal(run.status,mode==='plan'?'awaiting_plan':'succeeded',run.error);return run;};
 await start('build');stage='plan';await start('plan');stage='refresh';await start('build');stage='forget';await start('build');
 service.setMountAccess(resource.id,false,false);stage='revoked';await start('build');
 const rejected=store.operationsForRun(options.runId).find(operation=>operation.tool==='memory_restore'&&operation.state==='failed')!;assert.ok(rejected);assert.equal(store.recoveryForOperation(rejected.id)?.resolution,'verified_not_done');assert.equal(store.recoveryForOperation(rejected.id)?.dispatch,'settled');assert.ok(!store.operationsForRun(options.runId).some(operation=>operation.state==='outcome_unknown'));
 await assert.rejects(options.memoryTool!('memory_read',{}),/CANCELLED/);
});

test('actual Service memory worker commit followed by revoked host receipt remains unknown and cannot resume',async t=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'slash-memory-dispatch-')),store=new Store(path.join(directory,'profile'));let memoryFile='';
 const service=new Service(store,()=> 'local-memory-fixture',()=>{},async o=>({messages:[{role:'assistant',stopReason:'stop'}],abort:async()=>{},dispose:()=>{},prompt:async()=>{await assert.rejects(o.log('memory_write',{title:'宿主回执失效',text:'real-memory-commit-before-revoke'},()=>o.memoryTool!('memory_write',{title:'宿主回执失效',text:'real-memory-commit-before-revoke'})),/PI_MEMORY_OUTCOME_UNKNOWN|PROCESS_OUTCOME_UNKNOWN/);}} as never),{fetchModelMetadata:async()=>{throw Error('OFFLINE_MEMORY_DISPATCH');}});
 t.after(async()=>{service.dispose();await Promise.allSettled([...(service as any).agentIndex.queues.values()]);store.close();await fs.rm(directory,{recursive:true,force:true,maxRetries:5,retryDelay:40});});await service.workspace(path.join(directory,'project'));service.setPermission('workspace_read','allow');service.setPermission('artifact_write','allow');
 memoryFile=path.join(piMemoryDirectory(store.dir,productRecordsWorkspaceIdentity(service.state.root).workspaceId),'MEMORY.md');const original=(service as any).businessAuthorization.bind(service);(service as any).businessAuthorization=()=>original()+(fsSync.existsSync(memoryFile)&&fsSync.readFileSync(memoryFile,'utf8').includes('real-memory-commit-before-revoke')?':changed-after-real-commit':'');
 const runId=await service.send(service.conversation(),'只在隔离目录验证备忘派发边界'),run=await wait(service,runId);assert.equal(run.status,'failed');assert.match(await fs.readFile(memoryFile,'utf8'),/real-memory-commit-before-revoke/);const operation=store.operationsForRun(runId).find(item=>item.tool==='memory_write')!;assert.equal(operation.state,'outcome_unknown');assert.equal(store.recoveryForOperation(operation.id)?.dispatch,'may_have_run');assert.equal(store.recoveryForOperation(operation.id)?.resolution,'pending');await assert.rejects(service.resumeRun(runId),/RUN_REQUIRES_RECONCILIATION/);
});
