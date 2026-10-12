import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {createServer,type ServerResponse} from 'node:http';
import type {AddressInfo} from 'node:net';
import {createRuntime} from '../main/agent.js';
import {Service} from '../main/service.js';
import {Store} from '../main/store.js';
import {requestSchema} from '../shared/types.js';

type Payload={messages:Array<{role:string;content:unknown}>};
function reply(res:ServerResponse,delta:object,finish='stop'){
 res.writeHead(200,{'content-type':'text/event-stream'});const base={id:'local-queue',object:'chat.completion.chunk',created:1,model:'queue-fixture'};
 res.write('data: '+JSON.stringify({...base,choices:[{index:0,delta:{role:'assistant',...delta},finish_reason:null}]})+'\n\n');
 res.end('data: '+JSON.stringify({...base,choices:[{index:0,delta:{},finish_reason:finish}],usage:{prompt_tokens:100,completion_tokens:10,total_tokens:110}})+'\n\ndata: [DONE]\n\n');
}
const gate=()=>{let release!:()=>void;const promise=new Promise<void>(resolve=>{release=resolve;});return{promise,release};};
async function wait(check:()=>boolean){for(let i=0;i<1000;i++){if(check())return;await new Promise(resolve=>setTimeout(resolve,5));}throw Error('LOCAL_NATIVE_TIMEOUT');}
async function fixture(t:test.TestContext,handler:(payload:Payload,res:ServerResponse,index:number)=>void,holdTool=gate()){
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'slash-native-inputs-')),requests:Payload[]=[],toolStarted=gate();let error:unknown;
 const server=createServer(async(req,res)=>{if(req.method!=='POST'){res.writeHead(200,{'content-type':'application/json'});res.end('{"data":[]}');return;}try{let body='';for await(const chunk of req)body+=chunk;const payload=JSON.parse(body);requests.push(payload);handler(payload,res,requests.length);}catch(e){error=e;res.writeHead(500);res.end('LOCAL_FIXTURE_FAILED');}});await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
 const store=new Store(path.join(dir,'profile')),service=new Service(store,()=> 'local-key',()=>{},async o=>createRuntime({...o,readWorkspaceRules:async()=>{toolStarted.release();await holdTool.promise;return o.readWorkspaceRules!();}}));
 await service.workspace(path.join(dir,'workspace'));service.setPermission('workspace_read','allow');service.state.models=[{id:'local-entry',name:'队列合成模型',provider:'loopback',baseUrl:`http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`,modelId:'queue-fixture',protocol:'openai-completions',hasKey:true,contextWindow:65536,maxTokens:2048}];service.state.defaultModelId='local-entry';service.save();
 t.after(async()=>{holdTool.release();for(const id of service.active.keys())service.cancel(id);await wait(()=>service.active.size===0&&service.starting.size===0);service.dispose();await Promise.allSettled([...(service as any).agentIndex.queues.values()]);store.close();server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));await fs.rm(dir,{recursive:true,force:true,maxRetries:5,retryDelay:30});if(error)throw error;});
 const conversation=service.conversation();return{service,store,requests,holdTool,toolStarted,conversation};
}
const readTool={tool_calls:[{index:0,id:'initial-read',type:'function',function:{name:'read_workspace_rules',arguments:'{}'}}]};
const addition=(runId:string,text:string,delivery:'steer'|'follow_up')=>({runId,text,delivery,requestId:randomUUID()});

test('真实Service/Pi循环：宿主排队编辑/取消，指定项立即steer，其余正常stop后follow_up只发送一次',async t=>{
 let secondStillEditable=false;
 const f=await fixture(t,(_,res,index)=>{if(index===3)secondStillEditable=!f.service.state.runs[0].inputs?.[3].submittedAt;return index===1?reply(res,readTool,'tool_calls'):reply(res,{content:index===2?'即时补充已处理':'排队补充已处理'});});
 const id=await f.service.send(f.conversation,'真实队列生命周期','build','standard','local-entry');await f.toolStarted.promise;
 const a=f.service.enqueueRunInput(addition(id,'OLD-TEXT','follow_up')),b=f.service.enqueueRunInput(addition(id,'CANCEL-TEXT','follow_up')),c=f.service.enqueueRunInput(addition(id,'NOW-TEXT','follow_up'));f.service.enqueueRunInput(addition(id,'SECOND-FOLLOW','follow_up'));
 f.service.mutateRunInput({runId:id,inputId:a.id,expectedRevision:0,action:'edit',text:'EDITED-TEXT'});
 f.service.mutateRunInput({runId:id,inputId:b.id,expectedRevision:0,action:'cancel'});
 f.service.mutateRunInput({runId:id,inputId:c.id,expectedRevision:0,action:'send_now'});await wait(()=>Boolean(f.service.state.runs[0].inputs?.[2].submittedAt));
 assert.equal(f.service.state.runs[0].inputs?.[0].submittedAt,undefined);assert.equal(f.requests.length,1);
 assert.throws(()=>f.service.mutateRunInput({runId:id,inputId:c.id,expectedRevision:1,action:'edit',text:'TOO-LATE'}),/RUN_INPUT_NOT_EDITABLE/);
 f.holdTool.release();await wait(()=>f.service.state.runs[0].status==='succeeded');
 assert.equal(f.requests.length,4);assert.equal(secondStillEditable,true);assert.match(JSON.stringify(f.requests[3]),/SECOND-FOLLOW/);assert.match(JSON.stringify(f.requests[1]),/NOW-TEXT/);assert.doesNotMatch(JSON.stringify(f.requests[1]),/EDITED-TEXT|OLD-TEXT|CANCEL-TEXT/);assert.match(JSON.stringify(f.requests[2]),/EDITED-TEXT/);assert.doesNotMatch(JSON.stringify(f.requests[2]),/OLD-TEXT|CANCEL-TEXT|TOO-LATE/);
 assert.deepEqual(f.service.state.runs[0].inputs?.map(item=>item.status),['delivered','cancelled','delivered','delivered']);
 const messages=f.service.state.conversations.find(item=>item.id===f.conversation)!.messages;for(const text of ['NOW-TEXT','EDITED-TEXT','SECOND-FOLLOW'])assert.equal(messages.filter(message=>message.role==='user'&&message.text===text).length,1);assert.equal(messages.some(message=>message.role==='user'&&message.text.includes('宿主追加输入记录ID=')),false);
 assert.equal(f.service.state.runs[0].id,id);assert.throws(()=>f.service.mutateRunInput({runId:id,inputId:a.id,expectedRevision:1,action:'send_now'}),/RUN_INPUT_NOT_ACTIVE/);
});

test('真实Service/Pi/HTTP：steer在工具回执后进入下一轮，followUp待当前工具链结束；同Run持久回执',async t=>{
 const f=await fixture(t,(_,res,index)=>index===1?reply(res,readTool,'tool_calls'):reply(res,{content:index===2?'本轮补充处理完成':'后续补充处理完成'}));
 const id=await f.service.send(f.conversation,'读取规则后完成合成任务','build','standard','local-entry');await f.toolStarted.promise;
 const steer=addition(id,'STEER-UNIQUE','steer'),follow=addition(id,'FOLLOW-UNIQUE','follow_up');const first=f.service.enqueueRunInput(steer);assert.equal(f.service.enqueueRunInput(steer).id,first.id);f.service.enqueueRunInput(follow);
 await wait(()=>Boolean(f.service.state.runs[0].inputs?.[0].submittedAt));assert.equal(f.service.state.runs[0].inputs?.[1].submittedAt,undefined);assert.deepEqual(f.service.state.runs[0].inputs?.map(input=>input.status),['queued','queued']);assert.equal(f.requests.length,1);
 f.holdTool.release();await wait(()=>f.service.state.runs[0].status==='succeeded');
 assert.equal(f.requests.length,3);assert.match(JSON.stringify(f.requests[1]),/STEER-UNIQUE/);assert.doesNotMatch(JSON.stringify(f.requests[1]),/FOLLOW-UNIQUE/);assert.match(JSON.stringify(f.requests[2]),/FOLLOW-UNIQUE/);
 const run=f.service.state.runs[0];assert.deepEqual(run.inputs?.map(input=>input.status),['delivered','delivered']);assert(run.inputs?.every(input=>input.nativeMessageTimestamp&&input.deliveredAt));assert.equal(run.id,id);assert.equal(run.mode,'build');assert.equal(run.permissionMode,'standard');assert.equal(run.modelEntryId,'local-entry');assert.equal(run.runtimeStatus?.lastUsage?.output,10);
 assert.equal(f.store.get<any>('state',null).runs[0].inputs[0].text,'STEER-UNIQUE');const native=(await fs.readFile(f.store.get('session:'+f.conversation,''),'utf8')).split('\n').filter(Boolean).map(line=>JSON.parse(line));assert.equal(native.filter(entry=>entry.type==='message'&&entry.message.role==='user'&&JSON.stringify(entry.message.content).includes('STEER-UNIQUE')).length,1);
 assert(f.store.replayEvents('run:'+id).events.some(event=>event.runtimeStatus?.activity==='tool'));assert.throws(()=>f.service.enqueueRunInput(addition(id,'too late','steer')),/RUN_INPUT_NOT_ACTIVE/);
});

test('真实Pi取消：clearQueue后abort，不送达、不追加HTTP请求、不遗留queued',async t=>{
 const f=await fixture(t,(_,res)=>reply(res,readTool,'tool_calls'));const id=await f.service.send(f.conversation,'合成取消测试','build','standard','local-entry');await f.toolStarted.promise;
 f.service.enqueueRunInput(addition(id,'CANCEL-STEER','steer'));f.service.enqueueRunInput(addition(id,'CANCEL-FOLLOW','follow_up'));await wait(()=>Boolean(f.service.state.runs[0].inputs?.[0].submittedAt));assert.equal(f.service.state.runs[0].inputs?.[1].submittedAt,undefined);
 f.service.cancel(id);f.holdTool.release();await wait(()=>f.service.active.size===0);assert.equal(f.service.state.runs[0].status,'cancelled');assert.deepEqual(f.service.state.runs[0].inputs?.map(input=>input.status),['cancelled','cancelled']);assert.equal(f.requests.length,1);
});

test('真实Pi撤权：目录禁用与能力收紧均清队列并终止同Run，不静默更换权限',async t=>{
 for(const scope of ['mount','capability']){
  const f=await fixture(t,(_,res)=>reply(res,readTool,'tool_calls'));const id=await f.service.send(f.conversation,'合成撤权测试','build','standard','local-entry');await f.toolStarted.promise;
  f.service.enqueueRunInput(addition(id,'REVOKED-INPUT','steer'));await wait(()=>Boolean(f.service.state.runs[0].inputs?.[0].submittedAt));
  if(scope==='mount'){const mount=f.service.state.mounts.find(m=>m.enabled)!;f.service.setMountAccess(mount.id,mount.write,false);}else f.service.setPermission('workspace_read','deny');
  f.holdTool.release();await wait(()=>f.service.active.size===0);assert.equal(f.requests.length,1);assert.equal(f.service.state.runs[0].inputs?.[0].reason,'RUN_INPUT_AUTHORIZATION_CHANGED');assert.equal(f.service.state.runs[0].inputs?.[0].status,'cancelled');assert.match(f.service.state.runs[0].error??'',/RUN_INPUT_AUTHORIZATION_CHANGED/);
 }
});

test('追加IPC只接受文字/送达方式和幂等标识，不能更换Run模式、权限、模型或附件',()=>{
 const input={type:'runInputEnqueue',...addition('run','补充','steer')};assert(requestSchema.safeParse(input).success);
 for(const change of [{mode:'build'},{permissionMode:'full_access'},{modelEntryId:'other'},{attachmentIds:[]},{workflow:{}}])assert.equal(requestSchema.safeParse({...input,...change}).success,false);
});

test('真实技能预处理失败只取消该补充，UI原因有类别；清队列后不重放；原任务继续',async t=>{
 const f=await fixture(t,(_,res,index)=>index===1?reply(res,readTool,'tool_calls'):reply(res,{content:'原任务完成'}));const id=await f.service.send(f.conversation,'合成技能补充测试','build','standard','local-entry');await f.toolStarted.promise;
 f.service.enqueueRunInput(addition(id,'/skill:missing-synthetic-skill 补充','steer'));await wait(()=>f.service.state.runs[0].inputs?.[0].status==='cancelled');assert.equal(f.service.state.runs[0].inputs?.[0].reason,'RUN_INPUT_SKILL_NOT_FOUND');
 f.service.enqueueRunInput(addition(id,'CLEAR-PENDING','follow_up'));assert.equal(f.service.state.runs[0].inputs?.[1].submittedAt,undefined);f.service.clearRunInputs({runId:id});f.holdTool.release();await wait(()=>f.service.state.runs[0].status==='succeeded');assert.equal(f.requests.length,2);assert.doesNotMatch(JSON.stringify(f.requests[1]),/CLEAR-PENDING|missing-synthetic-skill/);assert.equal(f.service.state.runs[0].inputs?.[1].reason,'RUN_INPUT_CLEARED');
});

test('Service启动将持久queued变unknown；已送达保留且不创建任何native运行/重放',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'slash-input-restart-')),store=new Store(dir),timestamp=new Date().toISOString();let created=0;
 store.set('state',{root:'',mounts:[],conversations:[{id:'c',title:'合成',messages:[]}],changes:[],connections:[],model:{baseUrl:'http://127.0.0.1',id:'fixture',hasKey:false},runs:[{id:'r',conversationId:'c',status:'running',startedAt:timestamp,inputs:[{id:randomUUID(),requestId:randomUUID(),text:'未确认',delivery:'steer',status:'queued',createdAt:timestamp,submittedAt:timestamp,wireHash:'a'.repeat(64)},{id:randomUUID(),requestId:randomUUID(),text:'已确认',delivery:'follow_up',status:'delivered',createdAt:timestamp,deliveredAt:timestamp}]}]});
 const service=new Service(store,()=>'',()=>{},async()=>{created++;throw Error('NO_REPLAY_ALLOWED');});t.after(async()=>{service.dispose();store.close();await fs.rm(dir,{recursive:true,force:true});});assert.equal(service.state.runs[0].status,'interrupted');assert.deepEqual(service.state.runs[0].inputs?.map(input=>input.status),['unknown','delivered']);assert.equal(created,0);assert.throws(()=>service.enqueueRunInput(addition('r','不能自动接管','steer')),/RUN_INPUT_NOT_ACTIVE/);
});

test('成功与失败终态都等待晚到native输入清理；终态可见时回复完成时点/持久检查点/active退出已一致',async t=>{
 for(const outcome of ['succeeded','failed'] as const){
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'slash-input-finalization-')),store=new Store(path.join(dir,'profile')),originalDone=gate(),submissionStarted=gate(),submissionDone=gate();let streaming=false,pending:string[]=[],disposed=false;
  const service=new Service(store,()=> 'offline-key',()=>{},async options=>({messages:[{role:'assistant',stopReason:'stop'}],get isStreaming(){return streaming;},prepareUserInput:async text=>text,steer:async text=>{submissionStarted.release();await submissionDone.promise;pending.push(text);},followUp:async()=>{throw Error('not used');},clearQueue:()=>{const result={steering:pending,followUp:[]};pending=[];return result;},prompt:async()=>{streaming=true;options.inputReady?.();await originalDone.promise;streaming=false;options.delta('收尾回归回复');if(outcome==='failed')throw Error('OFFLINE_FINALIZATION_FAILURE');},abort:async()=>{},dispose:()=>{disposed=true;}}) as never);
  try{
   await service.workspace(path.join(dir,'project'));const cid=service.conversation(),id=await service.send(cid,'离线收尾回归');await wait(()=>streaming);service.enqueueRunInput(addition(id,'等待原生提交','steer'));await submissionStarted.promise;
   originalDone.release();await wait(()=>service.state.runs[0].generationFinishedAt!==undefined);if(outcome==='succeeded')await wait(()=>service.state.runs[0].acceptance?.status==='not_applicable');await new Promise(resolve=>setTimeout(resolve,0));assert.equal(service.state.runs[0].status,outcome==='succeeded'?'validating':'running');assert.equal(service.state.runs[0].finishedAt,undefined);assert.equal(disposed,false);assert.equal(service.active.size,1);
   submissionDone.release();await wait(()=>service.state.runs[0].status===outcome);const run=service.state.runs[0],message=service.state.conversations[0].messages.find(m=>m.role==='assistant'&&m.runId===id)!;
   assert.ok(message);assert.equal(message.completedAt,outcome==='succeeded'?run.generationFinishedAt:undefined);assert.equal(message.generationDurationMs,run.generationDurationMs);assert.equal(service.active.size,0);assert.equal(service.starting.size,0);assert.equal(disposed,true);assert.deepEqual(pending,[]);assert.equal(run.inputs?.[0].status,'cancelled');assert.equal(store.get<any>('run-checkpoint:'+id,null).phase,outcome==='succeeded'?'completed':'failed');assert.equal(store.get<any>('state',null).runs[0].status,outcome);assert.equal(store.get<any>('state',null).conversations[0].messages.find((m:any)=>m.role==='assistant'&&m.runId===id).completedAt,message.completedAt);
  }finally{originalDone.release();submissionDone.release();await wait(()=>service.active.size===0&&service.starting.size===0);service.dispose();await Promise.allSettled([...(service as any).agentIndex.queues.values()]);store.close();await fs.rm(dir,{recursive:true,force:true,maxRetries:5,retryDelay:30});}
 }
});

test('原任务结束先拒绝追加输入准备的待审批，再等待queue drain，避免收尾互相等待',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'slash-input-approval-finalization-')),store=new Store(path.join(dir,'profile')),originalDone=gate();let streaming=false,reads=0,submitted=0;
 const service=new Service(store,()=> 'offline-key',()=>{},async options=>({messages:[{role:'assistant',stopReason:'stop'}],get isStreaming(){return streaming;},prepareUserInput:async text=>await options.log('read_file',{mountId:'synthetic',path:'not-read.md'},async()=>{reads++;return text;}) as string,steer:async()=>{submitted++;},followUp:async()=>{submitted++;},clearQueue:()=>({steering:[],followUp:[]}),prompt:async()=>{streaming=true;options.inputReady?.();await originalDone.promise;streaming=false;options.delta('原任务完成，待授权补充未发送');},abort:async()=>{},dispose:()=>{}}) as never);
 try{
  await service.workspace(path.join(dir,'project'));service.setPermission('workspace_read','ask');const id=await service.send(service.conversation(),'离线审批收尾');await wait(()=>streaming);service.enqueueRunInput(addition(id,'未获授权的补充','steer'));await wait(()=>Boolean(service.state.pendingApprovals?.some(a=>a.runId===id&&a.status==='pending')));
  originalDone.release();await wait(()=>service.state.runs[0].status==='succeeded');assert.equal(service.active.size,0);assert.equal(reads,0);assert.equal(submitted,0);assert.equal(service.state.runs[0].inputs?.[0].status,'cancelled');assert.equal(service.state.pendingApprovals?.some(a=>a.runId===id&&a.status==='pending'),false);
 }finally{originalDone.release();for(const run of service.state.runs)service.cancel(run.id);await wait(()=>service.active.size===0&&service.starting.size===0);service.dispose();await Promise.allSettled([...(service as any).agentIndex.queues.values()]);store.close();await fs.rm(dir,{recursive:true,force:true,maxRetries:5,retryDelay:30});}
});
