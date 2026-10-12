import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createServer,type ServerResponse} from 'node:http';
import type {AddressInfo} from 'node:net';
import {ModelRuntime,type ToolDefinition,type ExtensionContext} from '@earendil-works/pi-coding-agent';
import {Type} from '@sinclair/typebox';
import {createPiSubagentTools,PI_SUBAGENTS_VERSION,type PiSubagentState} from '../main/pi-subagents.js';

type Payload={messages:Array<{role:string;content:unknown}>;tools?:Array<{function:{name:string}}>};
function reply(res:ServerResponse,text?:string,call?:{name:string;args:object}){
 res.writeHead(200,{'content-type':'text/event-stream'});
 const base={id:'real-child-fixture',object:'chat.completion.chunk',created:1,model:'fixture'};
 const delta=call?{role:'assistant',tool_calls:[{index:0,id:'call-'+Date.now(),type:'function',function:{name:call.name,arguments:JSON.stringify(call.args)}}]}:{role:'assistant',content:text};
 res.write('data: '+JSON.stringify({...base,choices:[{index:0,delta,finish_reason:null}]})+'\n\n');
 res.end('data: '+JSON.stringify({...base,choices:[{index:0,delta:{},finish_reason:call?'tool_calls':'stop'}],usage:{prompt_tokens:20,completion_tokens:5,total_tokens:25}})+'\n\ndata: [DONE]\n\n');
}
async function fixture(t:test.TestContext,handler:(payload:Payload,res:ServerResponse,index:number)=>void,options:{budget?:number;signal?:AbortSignal;deadlineAt?:number;readDenied?:()=>boolean}={}){
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'slash-real-pi-subagents-')),cwd=path.join(dir,'workspace'),agentDir=path.join(dir,'agent');
 await fs.mkdir(cwd);await fs.mkdir(agentDir);await fs.writeFile(path.join(cwd,'evidence.md'),'AUTHORIZED-EVIDENCE');await fs.writeFile(path.join(dir,'private.md'),'FORBIDDEN-PRIVATE');
 // Ambient project instructions/extensions must never be loaded by the child.
 await fs.writeFile(path.join(cwd,'AGENTS.md'),'FOREIGN-CONTEXT-MARKER');await fs.mkdir(path.join(cwd,'.pi','extensions'),{recursive:true});await fs.writeFile(path.join(cwd,'.pi','extensions','poison.ts'),'throw new Error("AMBIENT_EXTENSION_LOADED")');
 const requests:Payload[]=[],headers:Array<string|undefined>=[],states:PiSubagentState[]=[];
 const server=createServer(async(req,res)=>{const chunks:Buffer[]=[];for await(const chunk of req)chunks.push(Buffer.from(chunk));const data=JSON.parse(Buffer.concat(chunks).toString()) as Payload;requests.push(data);headers.push(req.headers.authorization);handler(data,res,requests.length);});
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
 const runtime=await ModelRuntime.create({authPath:path.join(agentDir,'fixture-auth.json'),modelsPath:null,refreshOnCreate:false});
 runtime.registerProvider('slash-fixture',{api:'openai-completions',baseUrl:`http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`,models:[{id:'fixture',name:'fixture',reasoning:false,input:['text'],cost:{input:0,output:0,cacheRead:0,cacheWrite:0},contextWindow:65536,maxTokens:1000,compat:{supportsDeveloperRole:false,supportsStore:false}}]});
 await runtime.setRuntimeApiKey('slash-fixture','LOCAL-FIXTURE-KEY');const model=runtime.getModel('slash-fixture','fixture')!;
 let calls=0,reads=0,unsafe=0;
 const log=async<T>(_name:string,_args:unknown,execute:()=>Promise<T>)=>{calls++;if(calls>(options.budget??120))throw Error('TOOL_BUDGET_EXCEEDED: shared parent budget');return execute();};
 const read:ToolDefinition={name:'read_file',label:'read',description:'Read a host-authorized relative file',parameters:Type.Object({path:Type.String()}),execute:async(_id,input)=>log('read_file',input,async()=>{if(options.readDenied?.())throw Error('PERMISSION_DENIED: revoked');const filename=path.resolve(cwd,input.path as string);if(path.dirname(filename)!==cwd)throw Error('PERMISSION_DENIED: outside parent mounts');reads++;return{content:[{type:'text',text:await fs.readFile(filename,'utf8')}],details:{}};})};
 const forbidden:ToolDefinition[]=['write_draft','run_process','powershell','read','bash','delegate_readonly','configure_connection'].map(name=>({name,label:name,description:name,parameters:Type.Object({}),execute:async()=>{unsafe++;throw Error('UNSAFE_TOOL_EXECUTED');}}));
 const tools=createPiSubagentTools({runId:'parent-fixture',cwd,agentDir,modelRuntime:runtime,model,thinkingLevel:'off',mode:'plan',tools:[read,...forbidden],log,signal:options.signal,deadlineAt:options.deadlineAt??Date.now()+30_000,onState:state=>states.push(state)});
 const execute=(task='independent research')=>tools[0].execute('parent-call',{task,purpose:'research'},undefined,undefined,{} as ExtensionContext);
 t.after(async()=>{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));await fs.rm(dir,{recursive:true,force:true,maxRetries:5,retryDelay:30});});
 return{execute,tool:tools[0],requests,headers,states,stats:()=>({calls,reads,unsafe}),cwd,dir};
}

test('真实固定包 child 独立上下文读取授权资料；原模型凭据、白名单和模式不扩大',{timeout:30_000},async t=>{
 const f=await fixture(t,(payload,res)=>payload.messages.some(message=>message.role==='tool')?reply(res,'CHECKED: AUTHORIZED-EVIDENCE'):reply(res,undefined,{name:'read_file',args:{path:'evidence.md'}}));
 const result=await f.execute('FIRST-ONLY');const receipt=JSON.parse((result.content[0] as {text:string}).text);
 assert.equal(receipt.package,'pi-subagents@'+PI_SUBAGENTS_VERSION);assert.equal(receipt.state,'succeeded');assert.equal(receipt.readOnly,true);assert.equal(receipt.context,'fresh');assert.match(receipt.text,/AUTHORIZED-EVIDENCE/);assert.deepEqual(receipt.allowedTools,['read_file']);assert.equal(receipt.toolCount,1);assert.ok(receipt.sessionId);
 assert.deepEqual(f.stats(),{calls:2,reads:1,unsafe:0});assert.equal(f.requests.length,2);assert.match(f.headers[0]??'',/LOCAL-FIXTURE-KEY/);
 assert.deepEqual(f.requests[0].tools?.map(tool=>tool.function.name),['read_file']);assert.match(JSON.stringify(f.requests[0].messages),/父任务模式：plan/);assert.doesNotMatch(JSON.stringify(f.requests),/FOREIGN-CONTEXT-MARKER|FORBIDDEN-PRIVATE/);
 const second=JSON.parse(((await f.execute('SECOND-ONLY')).content[0] as {text:string}).text);
 assert.notEqual(second.sessionId,receipt.sessionId);assert.doesNotMatch(JSON.stringify(f.requests[2].messages),/FIRST-ONLY|CHECKED:/);assert.match(JSON.stringify(f.requests[2].messages),/SECOND-ONLY/);
 assert.equal(await fs.readFile(path.join(f.cwd,'evidence.md'),'utf8'),'AUTHORIZED-EVIDENCE');assert.deepEqual(f.states.filter(state=>state.state==='succeeded').length,2);
});

test('子 Agent 使用父调用总预算，不重新取得120次；超额工具未读取且停止模型循环',{timeout:30_000},async t=>{
 const f=await fixture(t,(_payload,res)=>reply(res,undefined,{name:'read_file',args:{path:'evidence.md'}}),{budget:1});
 await assert.rejects(f.execute(),/TOOL_BUDGET_EXCEEDED/);assert.deepEqual(f.stats(),{calls:2,reads:0,unsafe:0});assert.equal(f.requests.length,1);assert.equal(f.states.at(-1)?.state,'failed');
});

test('子任务越界读取经过真实父工具拒绝，无法读取父目录外资料',{timeout:30_000},async t=>{
 const f=await fixture(t,(_payload,res)=>reply(res,undefined,{name:'read_file',args:{path:'../private.md'}}));
 await assert.rejects(f.execute(),/PERMISSION_DENIED/);assert.equal(f.stats().reads,0);assert.equal(f.requests.length,1);assert.doesNotMatch(JSON.stringify(f.requests),/FORBIDDEN-PRIVATE/);
});

test('父停止取消真实 localhost child 请求并回收，不继续请求或读取',{timeout:30_000},async t=>{
 const controller=new AbortController();let entered!:()=>void;const ready=new Promise<void>(resolve=>{entered=resolve;});
 const f=await fixture(t,(_payload,res)=>{res.writeHead(200,{'content-type':'text/event-stream'});res.flushHeaders();entered();},{signal:controller.signal});
 const pending=f.execute();await ready;controller.abort();await assert.rejects(pending,/CANCELLED/);assert.equal(f.states.at(-1)?.state,'cancelled');assert.equal(f.requests.length,1);assert.equal(f.stats().reads,0);
});

test('继承已过期父截止时间时不派发模型；最多三个真实子任务',{timeout:30_000},async t=>{
 const expired=await fixture(t,(_payload,res)=>reply(res,'UNEXPECTED'),{deadlineAt:Date.now()-1});await assert.rejects(expired.execute(),/TIME_BUDGET_EXCEEDED/);assert.equal(expired.requests.length,0);
 const f=await fixture(t,(_payload,res)=>reply(res,'bounded result'));for(let i=0;i<3;i++)await f.execute('TASK-'+i);await assert.rejects(f.execute('FOURTH'),/PI_SUBAGENTS_TASK_LIMIT/);assert.equal(f.requests.length,3);
});

test('真实child仍在请求时父截止时间到达会取消，而非等待子任务独立超时',{timeout:30_000},async t=>{
 const started=Date.now();
 const f=await fixture(t,(_payload,res)=>{res.writeHead(200,{'content-type':'text/event-stream'});res.flushHeaders();},{deadlineAt:Date.now()+1000});
 await assert.rejects(f.execute(),/TIME_BUDGET_EXCEEDED/);assert.equal(f.requests.length,1);assert.equal(f.stats().reads,0);assert.ok(Date.now()-started<5000);assert.equal(f.states.at(-1)?.state,'failed');
});

test('最多2个真实child并行且拒绝传入cwd/model/递归任务配置',{timeout:30_000},async t=>{
 const controller=new AbortController();let both!:()=>void;const ready=new Promise<void>(resolve=>{both=resolve;});
 const f=await fixture(t,(_payload,res,index)=>{res.writeHead(200,{'content-type':'text/event-stream'});res.flushHeaders();if(index===2)both();},{signal:controller.signal});
 await assert.rejects(f.tool.execute('invalid',{task:'x',purpose:'research',cwd:f.dir,model:'foreign'},undefined,undefined,{} as ExtensionContext),/Unrecognized/);
 const first=f.execute('one'),second=f.execute('two');await ready;await assert.rejects(f.execute('three'),/PI_SUBAGENTS_CONCURRENCY_LIMIT/);controller.abort();await Promise.all([assert.rejects(first,/CANCELLED/),assert.rejects(second,/CANCELLED/)]);assert.equal(f.requests.length,2);
});
