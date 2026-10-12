import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createServer} from 'node:http';
import type {AddressInfo} from 'node:net';
import {Service} from '../main/service.js';
import {Store} from '../main/store.js';
import {createRuntime} from '../main/agent.js';
import {computerScopeId} from '../main/computer-file-scope.js';

test('actual Pi write_draft receipt contains the normalized ref used by read_draft',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'slash-computer-tool-'));
 const store=new Store(path.join(dir,'profile'));
 const service=new Service(store,()=> 'SYNTHETIC_ONLY',()=>{},createRuntime);
 let scope='',writeReceipt:any,readReceipt:any,index=0,serverError:unknown;
 const file=path.join(dir,'outside','marker.txt');
 await fs.mkdir(path.dirname(file));
 const server=createServer(async(req,res)=>{
  try{
   let body='';for await(const chunk of req)body+=chunk;
   const payload=JSON.parse(body);index++;
   const tool=payload.messages.filter((m:any)=>m.role==='tool').at(-1);
   let delta:object,finish='stop';
   if(index===1){delta={tool_calls:[{index:0,id:'write-marker',type:'function',function:{name:'write_draft',arguments:JSON.stringify({mountId:scope,path:file,content:'SYNTHETIC_FULL_PC'})}}]};finish='tool_calls';}
   else if(index===2){writeReceipt=JSON.parse(tool.content);delta={tool_calls:[{index:0,id:'read-marker',type:'function',function:{name:'read_draft',arguments:JSON.stringify({mountId:writeReceipt.mountId,path:writeReceipt.path})}}]};finish='tool_calls';}
   else{if(index===3)readReceipt=JSON.parse(tool.content);delta={content:'合成工具检查结束'};}
   res.writeHead(200,{'content-type':'text/event-stream'});
   const base={id:'local-computer',object:'chat.completion.chunk',created:1,model:'fixture'};
   res.write('data: '+JSON.stringify({...base,choices:[{index:0,delta:{role:'assistant',...delta},finish_reason:null}]})+'\n\n');
   res.end('data: '+JSON.stringify({...base,choices:[{index:0,delta:{},finish_reason:finish}],usage:{prompt_tokens:100,completion_tokens:10,total_tokens:110}})+'\n\ndata: [DONE]\n\n');
  }catch(error){serverError=error;res.writeHead(500);res.end('SYNTHETIC_FAILURE');}
 });
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  await service.workspace(path.join(dir,'workspace'));service.setPermission('workspace_read','allow');service.setPermission('artifact_write','allow');
  service.state.models=[{id:'local',name:'Offline',modelId:'fixture',baseUrl:`http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`,protocol:'openai-completions',hasKey:true,contextWindow:65536,maxTokens:2048}];service.state.defaultModelId='local';service.save();
  const conversation=service.conversation();scope=computerScopeId(conversation);
  const id=await service.send(conversation,'合成完整电脑文件工具回执检查','build','full_access','local');
  const deadline=Date.now()+30000;
  while(Date.now()<deadline&&(service.active.size||service.starting.size))await new Promise(resolve=>setTimeout(resolve,20));
  assert.equal(service.active.size,0);assert.equal(service.starting.size,0);if(serverError)throw serverError;
  assert.equal(service.state.runs.find(run=>run.id===id)?.status,'succeeded');
  assert.ok(writeReceipt.mountId.startsWith(scope+':root:'));assert.equal(path.isAbsolute(writeReceipt.path),false);
  assert.equal(readReceipt.changeId,writeReceipt.changeId);assert.equal(readReceipt.content,'SYNTHETIC_FULL_PC');
  assert.equal(await fs.stat(file).then(()=>true,()=>false),false,'draft has not applied to external file');
 }finally{
  for(const id of service.active.keys())service.cancel(id);
  while(service.active.size||service.starting.size)await new Promise(resolve=>setTimeout(resolve,10));
  service.dispose();await Promise.allSettled([...(service as any).agentIndex.queues.values()]);store.close();
  server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));
  await fs.rm(dir,{recursive:true,force:true,maxRetries:6,retryDelay:30});
 }
});
