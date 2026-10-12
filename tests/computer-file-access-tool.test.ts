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

test('actual Service/Pi parent and independent child browse/search/read an external temporary folder through the same gateway',{timeout:60_000},async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'slash-computer-browser-')),store=new Store(path.join(dir,'profile')),service=new Service(store,()=> 'SYNTHETIC_ONLY',()=>{},createRuntime);
 const outside=path.join(dir,'outside project'),file=path.join(outside,'marker.txt');await fs.mkdir(path.join(outside,'empty'),{recursive:true});await fs.writeFile(file,'SYNTHETIC_DIRECTORY_BODY');
 let scope='',index=0,error:unknown,recursive:any,browse:any,childBrowse:any,childReceipt:any;const payloads:any[]=[];
 const server=createServer(async(req,res)=>{try{
  let body='';for await(const chunk of req)body+=chunk;const payload=JSON.parse(body);payloads.push(payload);index++;const tool=payload.messages.filter((m:any)=>m.role==='tool').at(-1);
  const call=(name:string,args:object)=>({tool_calls:[{index:0,id:'browser-'+index,type:'function',function:{name,arguments:JSON.stringify(args)}}]});let delta:object,finish='tool_calls';
  switch(index){
   case 1:delta=call('search_files',{query:'SYNTHETIC_DIRECTORY_BODY',mountId:scope,directory:outside});break;
   case 2:recursive=JSON.parse(tool.content);assert.equal(recursive.items.length,1);assert.match(recursive.items[0].snippet,/SYNTHETIC_DIRECTORY_BODY/);delta=call('search_files',{query:'',directory:outside,shallow:true});break;
   case 3:browse=JSON.parse(tool.content);assert.equal(browse.items.length,2);assert.equal(browse.items.find((item:any)=>item.entryType==='directory')?.snippet,undefined);delta=call('read_file',{mountId:browse.items.find((item:any)=>item.entryType==='file').mountId,path:browse.items.find((item:any)=>item.entryType==='file').path});break;
   case 4:assert.match(tool.content,/SYNTHETIC_DIRECTORY_BODY/);delta=call('load_tool_group',{group:'delegated_research'});break;
   case 5:delta=call('delegate_readonly',{task:'查看 '+outside+' 的直接子目录并读取marker.txt',purpose:'research'});break;
   case 6:assert.match(JSON.stringify(payload.messages),new RegExp(scope));assert.match(JSON.stringify(payload.messages),/宿主当前权限：full_access/);assert.ok(!payload.tools.some((t:any)=>t.function.name==='write_draft'));delta=call('search_files',{query:'',directory:outside,shallow:true});break;
   case 7:childBrowse=JSON.parse(tool.content);assert.equal(childBrowse.items.length,2);{const ref=childBrowse.items.find((item:any)=>item.entryType==='file');delta=call('read_file',{mountId:ref.mountId,path:ref.path});}break;
   case 8:assert.match(tool.content,/SYNTHETIC_DIRECTORY_BODY/);delta={content:'子任务已核对合成目录与实际文本'};finish='stop';break;
   case 10:case 12:delta=call('search_files',{query:'',directory:outside,shallow:true});break;
   case 11:case 13:assert.match(tool.content,/PERMISSION_DENIED/);assert.doesNotMatch(tool.content,/SYNTHETIC_DIRECTORY_BODY/);delta={content:'当前权限正确拒绝项目外目录'};finish='stop';break;
   case 14:delta=call('search_files',{query:'',directory:outside,shallow:true});break;
   case 15:{const listing=JSON.parse(tool.content);assert.equal(listing.items.length,2);const ref=listing.items.find((item:any)=>item.entryType==='file');delta=call('read_file',{mountId:ref.mountId,path:ref.path});}break;
   case 16:assert.match(tool.content,/SYNTHETIC_DIRECTORY_BODY/);delta={content:'Plan完全访问只读核对结束'};finish='stop';break;
   default:if(index===9){childReceipt=JSON.parse(tool.content);assert.equal(childReceipt.readOnly,true);assert.equal(childReceipt.state,'succeeded');}delta={content:'合成父子目录浏览检查结束'};finish='stop';
  }
  res.writeHead(200,{'content-type':'text/event-stream'});const base={id:'local-browser',object:'chat.completion.chunk',created:1,model:'fixture'};res.write('data: '+JSON.stringify({...base,choices:[{index:0,delta:{role:'assistant',...delta},finish_reason:null}]})+'\n\n');res.end('data: '+JSON.stringify({...base,choices:[{index:0,delta:{},finish_reason:finish}],usage:{prompt_tokens:100,completion_tokens:10,total_tokens:110}})+'\n\ndata: [DONE]\n\n');
 }catch(reason){error=reason;res.writeHead(500);res.end('SYNTHETIC_FAILURE');}});
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  await service.workspace(path.join(dir,'workspace'));service.setPermission('workspace_read','allow');service.state.models=[{id:'local',name:'Offline',modelId:'fixture',baseUrl:`http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`,protocol:'openai-completions',hasKey:true,contextWindow:65536,maxTokens:2048}];service.state.defaultModelId='local';service.save();const conversation=service.conversation();scope=computerScopeId(conversation);
  const id=await service.send(conversation,'合成目录读取核验，不生成成果','build','full_access','local');const deadline=Date.now()+45_000;while(Date.now()<deadline&&(service.active.size||service.starting.size))await new Promise(resolve=>setTimeout(resolve,20));if(error)throw error;
  assert.equal(service.active.size,0);assert.equal(service.starting.size,0);assert.equal(service.state.runs.find(run=>run.id===id)?.status,'succeeded');assert.equal(index,9);assert.ok(childReceipt);assert.equal(service.state.mounts.some(m=>m.path===outside),false);assert.equal(service.state.changes.length,0);assert.equal(await fs.readFile(file,'utf8'),'SYNTHETIC_DIRECTORY_BODY');assert.ok(service.state.runs.find(run=>run.id===id)?.sourceReads?.some(ref=>ref.mountId.startsWith(scope)));
  const search=payloads[0].tools.find((tool:any)=>tool.function.name==='search_files');assert.equal(search.function.parameters.properties.shallow.type,'boolean');
  assert.equal(service.state.runs.find(run=>run.id===id)?.sourceReads?.length,1,'same-file reads deduplicate; directory browsing must not register body receipts');
  for(const permission of ['standard','accept_edits'] as const){const rejected=await service.send(conversation,'合成项目外目录拒绝检查','build',permission,'local');const until=Date.now()+15_000;while(Date.now()<until&&(service.active.size||service.starting.size))await new Promise(resolve=>setTimeout(resolve,20));if(error)throw error;assert.equal(service.state.runs.find(run=>run.id===rejected)?.status,'succeeded');}
  const plan=await service.send(conversation,'合成Plan只读目录检查','plan','full_access','local');const until=Date.now()+15_000;while(Date.now()<until&&(service.active.size||service.starting.size))await new Promise(resolve=>setTimeout(resolve,20));if(error)throw error;assert.equal(service.state.runs.find(run=>run.id===plan)?.status,'awaiting_plan');assert.equal(index,16);assert.equal(service.state.changes.length,0);
 }finally{
  for(const id of service.active.keys())service.cancel(id);while(service.active.size||service.starting.size)await new Promise(resolve=>setTimeout(resolve,10));service.dispose();await Promise.allSettled([...(service as any).agentIndex.queues.values()]);store.close();server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));await fs.rm(dir,{recursive:true,force:true,maxRetries:6,retryDelay:30});
 }
});
