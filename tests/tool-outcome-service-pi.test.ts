import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createServer} from 'node:http';
import {Service} from '../main/service.js';
import {Store} from '../main/store.js';

for(const scenario of ['cancel_after_commit','fatal_before_commit'] as const){
 test('真实Service→默认Pi→本机HTTP同批两写：'+scenario,{timeout:20000},async t=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'slash-outcome-pi-')),store=new Store(path.join(directory,'profile'));
  const service=new Service(store,()=> 'local-placeholder',()=>{},undefined,{fetchModelMetadata:async()=>{throw Error('OFFLINE_METADATA_FIXTURE');}});
  let requests=0,mountId='',runId='';const errors:unknown[]=[];
  const server=createServer(async(req,res)=>{
   try{
    assert.equal(req.url,'/v1/chat/completions');requests++;const chunks:Buffer[]=[];for await(const chunk of req)chunks.push(Buffer.from(chunk));const packet=JSON.parse(Buffer.concat(chunks).toString());
    assert.equal(requests,1,'停止后不应再发送模型HTTP请求');
    res.writeHead(200,{'content-type':'text/event-stream'});
    const emit=(delta:unknown,finish_reason:string|null)=>res.write('data: '+JSON.stringify({id:'outcome-local',object:'chat.completion.chunk',created:1,model:packet.model,choices:[{index:0,delta,finish_reason}]})+'\n\n');
    emit({role:'assistant'},null);emit({tool_calls:['first','second'].map((id,index)=>({index,id,type:'function',function:{name:'write_draft',arguments:JSON.stringify({mountId,path:'outcome.txt',content:id})}}))},null);emit({},'tool_calls');res.end('data: [DONE]\n\n');
   }catch(error){errors.push(error);if(!res.headersSent)res.writeHead(500);res.end('local fixture failed');}
  });
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const address=server.address();assert(address&&typeof address!=='string');
  t.after(async()=>{if(runId&&!service.state.runs.find(r=>r.id===runId)?.finishedAt)service.cancel(runId);service.dispose();await Promise.allSettled([...(service as any).agentIndex.queues.values()]);server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));store.close();await fs.rm(directory,{recursive:true,force:true,maxRetries:5,retryDelay:30});});
  await service.workspace(path.join(directory,'project'));service.setPermission('workspace_read','allow');service.setPermission('artifact_write','allow');
  const mount=service.state.mounts.find(m=>m.name==='成果')!;mountId=mount.id;
  await fs.mkdir(path.join(store.dir,'agent'),{recursive:true});await fs.writeFile(path.join(store.dir,'agent','settings.json'),JSON.stringify({compaction:{enabled:false},retry:{enabled:false}}));
  service.state.models=[{id:'outcome-local',name:'本机终态集成验证',provider:'custom',modelId:'local-outcome',protocol:'openai-completions',baseUrl:`http://127.0.0.1:${address.port}/v1`,hasKey:true,maxTokens:6000,contextWindow:65536,supportsVision:false}];service.state.defaultModelId='outcome-local';service.save();
  if(scenario==='cancel_after_commit'){
   // Cancel after the real handler returned, at the known bookkeeping seam.
   const record=(service as any).recordContextSource.bind(service);
   (service as any).recordContextSource=async(id:string,name:string,args:unknown)=>{await record(id,name,args);if(name==='write_draft')service.cancel(id);};
  }else (service as any).beforeTaskArtifactWrite=async()=>{throw Error('HOST_INVARIANT_FAILED: trusted local fixture');};
  runId=await service.send(service.conversation(),'本机同批写入终态测试。');
  for(let i=0;i<1000;i++){if(service.state.runs.find(r=>r.id===runId)?.finishedAt&&!service.active.has(runId)&&!service.starting.has(runId))break;await new Promise(resolve=>setTimeout(resolve,10));}
  const run=service.state.runs.find(r=>r.id===runId)!;assert(run.finishedAt,'本机任务必须结束');assert.deepEqual(errors,[]);assert.equal(requests,1);
  const operations=store.operationsForRun(runId).filter(o=>o.tool==='write_draft');assert.equal(operations.length,1,'第二写不进入宿主网关');
  const checkpoint=store.get<any>('run-checkpoint:'+runId,null);assert.equal(checkpoint.completedOperations.find((o:any)=>o.id===operations[0].id).state,operations[0].state);
  if(scenario==='cancel_after_commit'){
   assert.equal(run.status,'cancelled');assert.equal(operations[0].state,'succeeded');assert.equal(service.state.changes.length,1);assert.equal(service.state.changes[0].content,'first');assert.equal(service.state.changes[0].status,'pending');
  }else{
   assert.equal(run.status,'failed');assert.equal(run.resumable,false);assert.match(run.error!,/HOST_INVARIANT_FAILED/);assert.equal(operations[0].state,'failed');assert.equal(service.state.changes.length,0);assert.equal(store.get<any>('run-tool-failure:'+runId,null).kind,'fatal');
  }
  await assert.rejects(fs.readFile(path.join(mount.path,'outcome.txt')),/ENOENT/);
 });
}
