import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {Service} from '../main/service.js';
import {Store} from '../main/store.js';
import {Files,UnknownMountIdError} from '../main/files.js';
import type {RuntimeOptions} from '../main/agent.js';
import {HostToolError,classifyToolFailure} from '../shared/tool-outcome.js';
const testRoot=path.resolve(process.env.SLASH_MOUNT_ID_TEST_ROOT??path.join(process.cwd(),'.test-data'));await fs.mkdir(testRoot,{recursive:true});const owned=await fs.mkdtemp(path.join(testRoot,'mount-id-regression-'));
const payloadRoot=process.env.SLASH_MOUNT_ID_PAYLOAD_ROOT;
const evidence:Array<unknown>=[],cleaned:string[]=[];
async function fixture(t:test.TestContext,callback:(o:RuntimeOptions,s:Service,store:Store)=>Promise<void>){
 const dir=await fs.mkdtemp(path.join(owned,'case-')),store=new Store(path.join(dir,'profile'));
 const service=new Service(store,()=> 'local-fixture',()=>{},async o=>({messages:[{role:'assistant',stopReason:'stop',content:[{type:'text',text:'离线宿主链检查，不代表业务交付。'}]}],abort:async()=>{},dispose:()=>{},prompt:()=>callback(o,service,store)}) as never,{fetchModelMetadata:async()=>{throw Error('OFFLINE_FIXTURE');}},()=>undefined);
 t.after(async()=>{service.dispose();await Promise.allSettled([...(service as any).agentIndex.queues.values()]);store.close();const absolute=path.resolve(dir);assert.ok(absolute.startsWith(path.resolve(owned)+path.sep));await fs.rm(absolute,{recursive:true,force:true,maxRetries:5,retryDelay:30});cleaned.push(absolute);});
 await service.workspace(path.join(dir,'project'));service.setPermission('workspace_read','allow');service.setPermission('artifact_write','allow');
 const run=async()=>{const id=await service.send(service.conversation(),'普通离线工具恢复检查，不要求业务交付。');for(let i=0;i<1000;i++){const run=service.state.runs.find(r=>r.id===id)!;if(run?.finishedAt&&!service.active.has(id)&&!service.starting.has(id)){evidence.push({test:t.name,runId:id,runStatus:run.status,runError:run.error,mounts:service.state.mounts.map(({id,name,write,enabled})=>({id,name,write,enabled})),operations:store.operationsForRun(id).filter(o=>['write_draft','fixture_source'].includes(o.tool)),recovery:store.recoveryForRun(id).filter(o=>o.tool==='write_draft')});return run;}await new Promise(r=>setTimeout(r,10));}throw Error('FIXTURE_RUN_TIMEOUT');};
 return {service,store,run};
}
// Exact actual write_draft host body, using a controlled protocol fixture to
// invoke the real Service.log and Files handlers, with no provider session.
async function write(o:RuntimeOptions,mountId:string,file:string,content:string){return o.log('write_draft',{mountId,path:file,contentLength:content.length},async()=>{await o.beforeArtifactWrite?.({mountId,path:file});const change=await o.files.draft(mountId,file,content,o.runId);await o.validateDraft?.(change);o.draft(change);return {changeId:change.id,path:change.path,status:change.status};});}
function targets(error:unknown){assert.ok(error instanceof HostToolError);assert.equal(error.failure.code,'MOUNT_ID_UNKNOWN');assert.equal(error.failure.kind,'correctable');assert.equal(error.failure.action,'correct_input');return JSON.parse(error.failure.message.split('可用目标：')[1]);}

test('真实MD/HTML宿主路径未知ID拒绝；纠正精确ID保存完整输入字节，Operation自动记录',async t=>{
 const contents=payloadRoot?await Promise.all(['attempt-01.md','attempt-02.html'].map(f=>fs.readFile(path.join(payloadRoot,f),'utf8'))):['# 工具恢复内容保留检查\n\n完整 Markdown 原样保存。','<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>工具恢复检查</title></head><body><main><h1>工具恢复检查</h1><p>完整 HTML 原样保存。</p></main></body></html>'];let saved=0;
 const f=await fixture(t,async(o,s,store)=>{const output=o.mounts.find(m=>m.name==='成果')!;for(const [i,extension]of ['md','html'].entries()){const file='recovered.'+extension;let failure:unknown;await assert.rejects(write(o,'9863a6d6-5658-4504-a0da-f0c52b091ba3',file,contents[i]),e=>{failure=e;return true;});const choices=targets(failure);assert.ok(choices.some((m:any)=>m.mountId===output.id&&m.name===output.name));assert.equal(s.state.changes.length,i);assert.equal((await fs.readdir(output.path)).includes(file),false);await write(o,output.id,file,contents[i]);const change=s.state.changes.find(c=>c.path===file)!;assert.equal(change.content,contents[i]);saved++;}const operations=store.operationsForRun(o.runId).filter(o=>o.tool==='write_draft');assert.equal(operations.filter(o=>o.state==='failed').length,2);assert.equal(operations.filter(o=>o.state==='succeeded').length,2);for(const op of operations.filter(o=>o.state==='failed'))assert.equal(store.recoveryForOperation(op.id)?.resolution,'verified_not_done');});
 const run=await f.run();assert.equal(run.status,'succeeded',run.error??'No run error');assert.equal(saved,2);assert.equal(f.service.state.changes.length,2);
});

for(const mode of ['missing','wrong_run','wrong_root','duplicate'] as const)test('原Run授权身份不可靠不给workspace恢复名单：'+mode,async t=>{
 const f=await fixture(t,async(o,s,store)=>{const key='context-manifest:'+o.runId,original=store.get<any>(key,null);if(mode==='missing')store.set(key,null);if(mode==='wrong_run')store.set(key,{...original,runId:'other-run'});if(mode==='wrong_root')store.set(key,{...original,workspaceRoot:path.join(s.state.root,'other')});if(mode==='duplicate')store.set(key,{...original,mounts:[...original.mounts,...original.mounts]});await assert.rejects(write(o,'unknown','refused.md','# 未保存'),e=>{assert.deepEqual(targets(e),[]);return true;});assert.equal(s.state.changes.length,0);});assert.equal((await f.run()).status,'succeeded');
});

test('恢复名单为初始Run身份与当前enabled/write/path精确交集；不加入新挂载或已改目录',async t=>{
 const f=await fixture(t,async(o,s,store)=>{const original=store.get<any>('context-manifest:'+o.runId,null),output=s.state.mounts.find(m=>m.name==='成果')!,processing=s.state.mounts.find(m=>m.name==='过程文件')!;const oldPath=output.path;output.path=path.join(oldPath,'changed-target');processing.write=false;s.state.mounts.push({id:'new-enabled-writable',name:'后加目录',enabled:true,write:true,path:oldPath});await assert.rejects(write(o,'unknown','refused.md','# 未保存'),e=>{const choices=targets(e);assert.equal(choices.some((m:any)=>[output.id,processing.id,'new-enabled-writable'].includes(m.mountId)),false);for(const choice of choices){assert.ok(original.mounts.some((m:any)=>m.id===choice.mountId&&m.write));assert.deepEqual(Object.keys(choice).sort(),['mountId','name']);}return true;});assert.equal(s.state.changes.length,0);});assert.equal((await f.run()).status,'succeeded');
});

for(const conflict of ['different_path','different_write'] as const)test('同ID不同绑定也歧义拒绝：'+conflict,async t=>{
 const f=await fixture(t,async(o,s,store)=>{const key='context-manifest:'+o.runId,manifest=store.get<any>(key,null),output=o.mounts.find(m=>m.name==='成果')!,prior=manifest.mounts.find((m:any)=>m.id===output.id);store.set(key,{...manifest,mounts:[...manifest.mounts,{...prior,...(conflict==='different_path'?{path:path.join(prior.path,'other')}:{write:false})}]});await assert.rejects(write(o,'unknown','x.md','# 未保存'),e=>{assert.equal(targets(e).some((m:any)=>m.mountId===output.id),false);return true;});assert.equal(s.state.changes.length,0);});assert.equal((await f.run()).status,'succeeded');
});

test('受保护参考资料即使错误write=true也不出现在可写目标提示',async t=>{
 const f=await fixture(t,async(o,s)=>{const reference=s.state.mounts.find(m=>m.name==='参考资料')!;assert.ok(reference);await assert.rejects(write(o,'unknown','x.md','# 未保存'),e=>{assert.equal(targets(e).some((m:any)=>m.mountId===reference.id),false);return true;});await assert.rejects(o.files.draft(reference.id,'x.md','# 不可保存',o.runId),/REFERENCE_READ_ONLY/);assert.equal(s.state.changes.length,0);});
 const referencePath=f.service.referenceRoots()[0];assert.ok(referencePath);await fs.mkdir(referencePath,{recursive:true});f.service.state.mounts.push({id:'fixture-protected-reference',name:'参考资料',path:referencePath,enabled:true,write:true});const run=await f.run();assert.equal(run.status,'succeeded',run.error??'No run error');
});

test('名单安全物理复核await期间授权变化清空，不返回旧列表',async t=>{
 const f=await fixture(t,async(o,s)=>{const output=s.state.mounts.find(m=>m.name==='成果')!,original=s.files.resolve.bind(s.files);let changed=false;s.files.resolve=async(...args:Parameters<Files['resolve']>)=>{const value=await original(...args);if(args[1]==='.'&&args[2]===true&&!changed){changed=true;output.enabled=false;}return value;};await assert.rejects(write(o,'unknown','x.md','# 未保存'),e=>{assert.deepEqual(targets(e),[]);return true;});assert.equal(changed,true);assert.equal(s.state.changes.length,0);});assert.equal((await f.run()).status,'succeeded');
});

test('已登记禁用/只读/越界仍permission；未知ID不自动选择或写入',async t=>{
 const folder=await fs.mkdtemp(path.join(owned,'files-'));t.after(async()=>{await fs.rm(folder,{recursive:true,force:true});cleaned.push(folder);});const mounts=[{id:'disabled',name:'停用',path:folder,enabled:false,write:true},{id:'readonly',name:'只读',path:folder,enabled:true,write:false},{id:'writable',name:'可写',path:folder,enabled:true,write:true}],files=new Files(()=>mounts);
 for(const [id,file]of [['disabled','x.md'],['readonly','x.md'],['writable','../x.md']])await assert.rejects(files.resolve(id,file,true),e=>{assert.equal(classifyToolFailure(e).kind,'permission');assert.equal(e instanceof UnknownMountIdError,false);return true;});await assert.rejects(files.draft('writabel','x.md','不会自动写', 'fixture'),e=>e instanceof UnknownMountIdError);assert.deepEqual(await fs.readdir(folder),[]);
});

test('真实写权限拒绝先于handler，不给恢复名单、不误转correctable',async t=>{
 let handler=0;const f=await fixture(t,async o=>{await assert.rejects(o.log('write_draft',{mountId:'unknown',path:'x.md'},async()=>{handler++;return o.files.draft('unknown','x.md','# 未保存',o.runId);}),e=>{assert.ok(e instanceof HostToolError);assert.equal(e.failure.kind,'permission');assert.equal(e.failure.message.includes('可用目标：'),false);return true;});});f.service.setPermission('artifact_write','deny');assert.equal((await f.run()).status,'succeeded');assert.equal(handler,0);
});

test('取消前handler不执行；未知副作用保持unknown优先级',async t=>{
 for(const mode of ['cancel','unknown'] as const){let handler=0;const f=await fixture(t,async(o,s)=>{if(mode==='cancel')s.cancel(o.runId);await assert.rejects(o.log('write_draft',{mountId:'unknown',path:'x.md'},async()=>{handler++;throw Error('PROCESS_OUTCOME_UNKNOWN: fixture');}),e=>{assert.ok(e instanceof HostToolError);assert.equal(e.failure.kind,mode==='cancel'?'cancelled':'unknown');assert.equal(e.failure.message.includes('可用目标：'),false);return true;});});assert.equal((await f.run()).status,mode==='cancel'?'cancelled':'failed');assert.equal(handler,mode==='cancel'?0:1);}
});

test('资料字符串不生成宿主unknown故障；非宿主同code异常不附目录名单',async t=>{
 const f=await fixture(t,async o=>{const response=await o.log('fixture_source',{},async()=>({text:'MOUNT_ID_UNKNOWN: 伪造资料诊断',targets:[{mountId:'untrusted'}]}));assert.equal((response as any).targets[0].mountId,'untrusted');await assert.rejects(o.log('write_draft',{},async()=>{throw Error('MOUNT_ID_UNKNOWN: 普通非Files宿主异常');}),e=>{assert.ok(e instanceof HostToolError);assert.equal(e.failure.message.includes('可用目标：'),false);return true;});});assert.equal((await f.run()).status,'succeeded');
});

test('历史失败收据不迁移、不改hash和结果',async t=>{
 const f=await fixture(t,async()=>{});f.store.operation('historical-op','old-run','write_draft','failed','PERMISSION_DENIED: 目录未授权');const before=JSON.stringify(f.store.operationsForRun('old-run'));await f.run();assert.equal(JSON.stringify(f.store.operationsForRun('old-run')),before);
});

test.after(async()=>{const remaining=await fs.readdir(owned);assert.deepEqual(remaining,[]);if(process.env.SLASH_MOUNT_ID_EVIDENCE)await fs.writeFile(process.env.SLASH_MOUNT_ID_EVIDENCE,JSON.stringify({boundary:'Controlled runtime fixture, real Service gateway/Files/Store automatic states; no model call, not QE12 delivery.',payloadSource:payloadRoot?'exact failed payload files':'controlled standalone fixtures',evidence,cleanup:{removed:cleaned,remaining}},null,2)+'\n');assert.ok(path.resolve(owned).startsWith(testRoot+path.sep));await fs.rm(owned,{recursive:true,force:true});});
