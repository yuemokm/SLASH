import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {Service} from '../main/service.js';
import {Store} from '../main/store.js';
import type {EvidenceSearchResult} from '../shared/evidence-search.js';
import type {SubAgentCallRequest} from '../shared/types.js';

async function fixture(t:test.TestContext){
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'slash-search-subagent-')),store=new Store(path.join(dir,'profile'));
 const service=new Service(store,()=> 'fixture-only',()=>{},async options=>({messages:[{role:'assistant',stopReason:'stop'}],abort:async()=>{},dispose:()=>{},prompt:async()=>{options.delta('方案 1：先查阅已授权资料');}}) as never);
 let verifySources:undefined|(()=>Promise<void>);
 t.after(async()=>{service.dispose();await Promise.allSettled([...(service as any).agentIndex.queues.values()]);try{await verifySources?.();}finally{store.close();await fs.rm(dir,{recursive:true,force:true,maxRetries:5,retryDelay:30});}});
 await service.workspace(path.join(dir,'project'));service.setPermission('workspace_read','allow');service.setPermission('artifact_write','allow');
 store.set('app-preferences',{subAgentMaxTasks:50});
 const selected=service.state.mounts.find(m=>m.name==='资源')!,other=service.state.mounts.find(m=>m.name==='过程文件')!;
 const sourceFiles:string[]=[];
 for(let i=0;i<25;i++){const file=path.join(selected.path,`分页规则-${String(i).padStart(2,'0')}.md`);await fs.writeFile(file,`规则事实 ${i}：审批需要人工复核。`);sourceFiles.push(file);}
 const hidden=path.join(other.path,'另一个目录的规则.md');await fs.writeFile(hidden,'规则：不可越过子代理目录。');sourceFiles.push(hidden);
 const hashes=async()=>Promise.all(sourceFiles.map(async file=>createHash('sha256').update(await fs.readFile(file)).digest('hex'))),before=await hashes();
 verifySources=async()=>assert.deepEqual(await hashes(),before,'所有隔离资料必须保持原始正文');
 const id=await service.send(service.conversation(),'只读检索规则','plan','standard');
 for(let attempt=0;attempt<500;attempt++){if(service.state.runs.find(run=>run.id===id)?.status==='awaiting_plan')break;await new Promise(resolve=>setTimeout(resolve,10));}
 assert.equal(service.state.runs.find(run=>run.id===id)?.status,'awaiting_plan');
 const call=async(input:Record<string,unknown>,extra:Partial<SubAgentCallRequest>={})=>(await service.runSubAgent({parentRunId:id,tool:'search_files',capability:'workspace_read',input,...extra})) as {tool:string;results:EvidenceSearchResult};
 return{service,store,selected,other,call,id};
}

test('子代理继承单目录：完整分页、旧query调用、冲突scope与参数必须真实校验',async t=>{
 const f=await fixture(t),first=await f.call({query:'规则',limit:5},{mountId:f.selected.id});
 assert.equal(first.results.scope.mountId,f.selected.id);assert.equal(first.results.pagination.totalMatches,25);assert.equal(first.results.items.length,5);assert.equal(first.results.pagination.nextOffset,5);assert.ok(first.results.items.every(item=>item.mountId===f.selected.id));
 const second=await f.call({query:'规则',mountId:f.selected.id,limit:5,offset:first.results.pagination.nextOffset,resultVersion:first.results.resultVersion},{mountId:f.selected.id});
 assert.equal(second.results.pagination.offset,5);assert.equal(second.results.items.length,5);assert.equal(second.results.resultVersion,first.results.resultVersion);assert.equal(new Set([...first.results.items,...second.results.items].map(item=>item.path)).size,10);
 const legacy=await f.call({query:'规则'});assert.equal(legacy.results.pagination.limit,20);assert.ok(legacy.results.items.length<=20);
 const empty=await f.call({query:'',mountId:f.selected.id,limit:3});assert.equal(empty.results.items.length,3);assert.ok(empty.results.items.every(item=>item.mountId===f.selected.id));
 await assert.rejects(f.call({query:'规则',mountId:f.other.id},{mountId:f.selected.id}),/SUB_AGENT_SCOPE_DENIED/);
 await assert.rejects(f.call({query:'规则',mountId:'outside'}),/SUB_AGENT_SCOPE_DENIED/);
 await assert.rejects(f.call({query:'规则',offset:5}),/resultVersion/);
 await assert.rejects(f.call({query:'规则',limit:'5'}),/number/);
 await assert.rejects(f.call({query:'规则',ignoredScope:f.other.id}),/Unrecognized key/);
});

test('子代理搜索不能以另一能力冒充授权，撤权和白名单变化拒绝后续页面',async t=>{
 const f=await fixture(t),first=await f.call({query:'规则',mountId:f.selected.id,limit:5}),next={query:'规则',mountId:f.selected.id,offset:5,resultVersion:first.results.resultVersion};
 f.service.setPermission('workspace_read','deny');await assert.rejects(f.call(next),/SUB_AGENT_PERMISSION_DENIED/);
 f.service.state.runs.find(run=>run.id===f.id)!.mode='build';
 await assert.rejects(f.call({query:'规则'},{capability:'artifact_write'}),/SUB_AGENT_PERMISSION_DENIED: search_files 必须继承资料读取能力/);
 f.service.setPermission('workspace_read','allow');f.service.setMountAccess(f.selected.id,false,false);
 await assert.rejects(f.call(next,{mountId:f.selected.id}),/SUB_AGENT_SCOPE_DENIED/);
 f.service.setMountAccess(f.selected.id,true,true);f.store.set('app-preferences',{subAgentMaxTasks:50,subAgentTools:['read_file']});
 await assert.rejects(f.call(next),/SUB_AGENT_TOOL_DENIED/);
});
