import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createServer,type ServerResponse} from 'node:http';
import {withFileMutationQueue} from '@earendil-works/pi-coding-agent';
import {createRuntime,assertRuntimeSucceeded,type RuntimeOptions} from '../main/agent.js';
import {DraftEditDomain} from '../main/draft-edit.js';
import {Files,hash} from '../main/files.js';
import type {Change,Mount} from '../shared/types.js';
import {TOOL_EXECUTION_POLICIES,toolExecutionPolicySchema} from '../main/tool-execution-policy.js';
import {CORE_TOOL_NAMES,TOOL_GROUPS} from '../main/tool-catalog.js';
import {PI_SUBAGENT_READONLY_TOOLS} from '../main/pi-subagents.js';
import {HostToolError,type ToolFailure} from '../shared/tool-outcome.js';

type Packet={model:string;tools:Array<{function:{name:string}}>;messages:Array<{role:string;content:unknown;tool_call_id?:string}>};
type Call={id:string;name:string;args:unknown};
function reply(res:ServerResponse,model:string,calls:Call[]=[]){
 res.writeHead(200,{'content-type':'text/event-stream'});
 const emit=(delta:unknown,finish_reason:string|null)=>res.write('data: '+JSON.stringify({id:'order-local',object:'chat.completion.chunk',created:1,model,choices:[{index:0,delta,finish_reason}]})+'\n\n');
 emit({role:'assistant'},null);
 if(calls.length){emit({tool_calls:calls.map((call,index)=>({index,id:call.id,type:'function',function:{name:call.name,arguments:JSON.stringify(call.args)}}))},null);emit({},'tool_calls');}
 else{emit({content:'Local ordering fixture finished.'},null);emit({},'stop');}
 res.end('data: [DONE]\n\n');
}
function deferred(){let resolve!:()=>void;const promise=new Promise<void>(r=>{resolve=r;});return{promise,resolve};}
async function fixture(t:test.TestContext,handler:(packet:Packet,res:ServerResponse,index:number)=>void){
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'slash-order-')),root=path.join(dir,'project');await fs.mkdir(root);
 const mount:Mount={id:'m',name:'out',path:root,enabled:true,write:true},files=new Files(()=>[mount]),changes:Change[]=[],controller=new AbortController(),packets:Packet[]=[],errors:unknown[]=[],logs:string[]=[];
 const server=createServer(async(req,res)=>{try{assert.equal(req.url,'/v1/chat/completions');const chunks:Buffer[]=[];for await(const chunk of req)chunks.push(Buffer.from(chunk));const packet=JSON.parse(Buffer.concat(chunks).toString()) as Packet;packets.push(packet);handler(packet,res,packets.length);}catch(error){errors.push(error);if(!res.headersSent)res.writeHead(500);res.end('local fixture failed');}});
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const address=server.address();assert(address&&typeof address!=='string');
 const domain=new DraftEditDomain({files,changes:()=>changes,assertAllowed:()=>{if(controller.signal.aborted)throw Error('CANCELLED');},assertOrdinaryChange:()=>{},transaction:(_,__,fn)=>withFileMutationQueue(path.join(root,'edit-lock'),fn),signal:()=>controller.signal,commit:change=>{const old=changes.find(c=>c.id===change.id);if(old)Object.assign(old,change);else changes.unshift(change);}});
 const options={dir:path.join(dir,'agent'),workspaceRoot:root,files,mounts:[mount],connections:[],model:{id:'ordering-fixture',baseUrl:`http://127.0.0.1:${address.port}/v1`,protocol:'openai-completions',contextWindow:65536,maxTokens:12000},key:'local-placeholder',mode:'build',runId:'run',signal:controller.signal,listConnections:()=>[],delta:()=>{},redact:(v:string)=>v,draft:(change:Change)=>changes.unshift(change),readDraft:(input)=>domain.read('run',input),editDraft:(input)=>domain.edit('run',input),log:async(name:string,_args:unknown,fn:()=>Promise<unknown>)=>{logs.push(name);return fn();}} as RuntimeOptions;
 const runtime=await createRuntime(options);
 t.after(async()=>{await runtime.abort();runtime.dispose();server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));await fs.rm(dir,{recursive:true,force:true,maxRetries:5,retryDelay:30});});
 return{runtime,options,files,root,mount,changes,controller,packets,errors,logs};
}
const toolText=(packet:Packet,id:string)=>{const message=packet.messages.find(m=>m.role==='tool'&&m.tool_call_id===id);assert.equal(typeof message?.content,'string');return message!.content as string;};
const write=(id:string,content:string):Call=>({id,name:'write_draft',args:{mountId:'m',path:'index.html',content}});

test('host execution policy schema covers the actual catalogue and child ceiling',()=>{
 const names=[...CORE_TOOL_NAMES,'load_tool_group',...Object.values(TOOL_GROUPS).flat(),'review_plan'];assert.deepEqual(new Set(Object.keys(TOOL_EXECUTION_POLICIES)),new Set(names));
 assert.throws(()=>toolExecutionPolicySchema.parse({executionMode:'parallel',effect:'read',toolName:'write_draft'}));
 for(const name of PI_SUBAGENT_READONLY_TOOLS)assert.equal(TOOL_EXECUTION_POLICIES[name].executionMode,'parallel');
 for(const name of ['write_draft','edit_draft','powershell','memory_write','load_tool_group','inspect_connection','check_task_acceptance'])assert.equal(TOOL_EXECUTION_POLICIES[name].executionMode,'sequential');
});

test('actual Pi HTTP: same-file drafts and mixed-batch read execute in model order',{timeout:15000},async t=>{
 const trace:string[]=[];let active=0,maxActive=0;
 const f=await fixture(t,(p,res,n)=>n===1?reply(res,p.model,[write('first','first'),write('second','second'),{id:'read',name:'read_draft',args:{mountId:'m',path:'index.html'}}]):reply(res,p.model));
 f.options.beforeArtifactWrite=async()=>{maxActive=Math.max(maxActive,++active);trace.push('start');await new Promise(resolve=>setTimeout(resolve,15));};
 f.options.draft=change=>{f.changes.unshift(change);trace.push(change.content);active--;};
 await f.runtime.prompt('LOCAL batch writes');assertRuntimeSucceeded(f.runtime);assert.deepEqual(f.errors,[]);
 assert.equal(maxActive,1);assert.deepEqual(trace,['start','first','start','second']);assert.equal(f.changes.length,2);assert.equal(JSON.parse(toolText(f.packets[1],'read')).content,'second');
 await assert.rejects(fs.readFile(path.join(f.root,'index.html')),/ENOENT/);
});

test('actual Pi HTTP: read-only batch overlaps both handlers',{timeout:15000},async t=>{
 const both=deferred();let active=0,maxActive=0;
 const enter=async()=>{maxActive=Math.max(maxActive,++active);if(active===2)both.resolve();await both.promise;active--;};
 const f=await fixture(t,(p,res,n)=>n===1?reply(res,p.model,[{id:'rules',name:'read_workspace_rules',args:{}},{id:'versions',name:'list_artifact_versions',args:{mountId:'m',path:'index.html'}}]):reply(res,p.model));
 f.options.readWorkspaceRules=async()=>{await enter();return{} as never;};f.options.listVersions=async()=>{await enter();return[];};
 const timer=setTimeout(()=>both.resolve(),2000);try{await f.runtime.prompt('LOCAL parallel reads');}finally{clearTimeout(timer);}
 assertRuntimeSucceeded(f.runtime);assert.deepEqual(f.errors,[]);assert.equal(maxActive,2);
});

test('actual Pi HTTP: cancellation after first completed draft does not start second write',{timeout:15000},async t=>{
 const f=await fixture(t,(p,res,n)=>{assert.equal(n,1);reply(res,p.model,[write('first','retained'),write('second','must not run')]);});
 f.options.draft=change=>{f.changes.unshift(change);f.controller.abort();};
 await assert.rejects(f.runtime.prompt('LOCAL cancel batch'),/CANCELLED/);assert.deepEqual(f.errors,[]);assert.equal(f.packets.length,1);assert.deepEqual(f.logs,['write_draft']);assert.equal(f.changes.length,1);assert.equal(f.changes[0].content,'retained');
});

test('actual Pi HTTP: second stale edit returns real DraftEditDomain version conflict',{timeout:15000},async t=>{
 let changeId='';const initial='alpha\nbeta\n';
 const edit=(id:string,oldText:string,newText:string):Call=>({id,name:'edit_draft',args:{mountId:'m',path:'index.html',changeId,expectedContentHash:hash(initial),oldText,newText}});
 const f=await fixture(t,(p,res,n)=>n===1?reply(res,p.model,[edit('first','alpha','one'),edit('second','beta','two')]):reply(res,p.model));
 await fs.writeFile(path.join(f.root,'index.html'),initial);const seed=await f.files.draft('m','index.html',initial,'run');changeId=seed.id;f.changes.unshift(seed);
 await f.runtime.prompt('LOCAL stale edits');assertRuntimeSucceeded(f.runtime);assert.deepEqual(f.errors,[]);assert.match(toolText(f.packets[1],'second'),/VERSION_CONFLICT/);assert.equal(f.changes.length,1);assert.equal(f.changes[0].content,'one\nbeta\n');assert.equal(await fs.readFile(path.join(f.root,'index.html'),'utf8'),initial);
});

test('actual Pi HTTP: revoked mount is rechecked before second queued draft',{timeout:15000},async t=>{
 const f=await fixture(t,(p,res,n)=>n===1?reply(res,p.model,[write('first','retained'),write('second','forbidden')]):reply(res,p.model));
 f.options.draft=change=>{f.changes.unshift(change);f.mount.enabled=false;};
 await f.runtime.prompt('LOCAL authorization changes');assertRuntimeSucceeded(f.runtime);assert.deepEqual(f.errors,[]);assert.equal(f.changes.length,1);assert.match(toolText(f.packets[1],'second'),/PERMISSION_DENIED/);
});

test('actual Pi HTTP: lazy memory writes serialize, declarations survive idle reload',{timeout:15000},async t=>{
 const trace:string[]=[];let active=0,maxActive=0;
 const f=await fixture(t,(p,res,n)=>{if(n===1)reply(res,p.model,[{id:'load',name:'load_tool_group',args:{group:'memory'}}]);else if(n===2){assert(p.tools.some(t=>t.function.name==='memory_write'));reply(res,p.model,[{id:'a',name:'memory_write',args:{title:'a',text:'a',sources:[]}},{id:'b',name:'memory_write',args:{title:'b',text:'b',sources:[]}}]);}else reply(res,p.model);});
 f.options.memoryTool=async(_name,input)=>{maxActive=Math.max(maxActive,++active);trace.push((input as {text:string}).text);await new Promise(resolve=>setTimeout(resolve,15));active--;return{ok:true};};
 await f.runtime.prompt('LOCAL lazy writes');assertRuntimeSucceeded(f.runtime);assert.deepEqual(f.errors,[]);assert.equal(maxActive,1);assert.deepEqual(trace,['a','b']);
 const expected=f.runtime.getActiveToolNames();await f.runtime.reload();assert.deepEqual(f.runtime.getActiveToolNames(),expected);
 for(const tool of f.runtime.getAllTools())assert.equal(f.runtime.getToolDefinition(tool.name)!.executionMode,TOOL_EXECUTION_POLICIES[tool.name].executionMode);
});

for(const scenario of [{code:'HOST_INVARIANT_FAILED',kind:'fatal'},{code:'PROCESS_OUTCOME_UNKNOWN',kind:'unknown'},{code:'PI_MEMORY_OUTCOME_UNKNOWN',kind:'unknown'}] as const){
 test(`actual Pi HTTP: ${scenario.kind} ${scenario.code} stops the next write and model request, survives host abort`,{timeout:15000},async t=>{
  const failures:ToolFailure[]=[];
  const f=await fixture(t,(p,res,n)=>{assert.equal(n,1);reply(res,p.model,[write('first','failure'),write('second','must not run')]);});
  f.options.beforeArtifactWrite=async()=>{throw Error(scenario.code+': local fixture');};
  f.options.toolFailed=failure=>{failures.push(failure);f.controller.abort();};
  await assert.rejects(f.runtime.prompt('LOCAL blocking failure'),error=>{assert(error instanceof HostToolError);assert.equal(error.failure.kind,scenario.kind);assert.equal(error.failure.code,scenario.code);return true;});
  assert.deepEqual(f.errors,[]);assert.equal(f.packets.length,1);assert.deepEqual(f.logs,['write_draft']);assert.equal(f.changes.length,0);assert.equal(failures.length,1);assert.equal(failures[0].toolName,'write_draft');
  await assert.rejects(f.runtime.prompt('LOCAL no automatic replay'),error=>error instanceof HostToolError&&error.failure.code===scenario.code);assert.equal(f.packets.length,1);
 });
}

test('actual Pi HTTP: correctable host error returns to the model and permits the next write',{timeout:15000},async t=>{
 let attempted=0;const failures:ToolFailure[]=[];
 const f=await fixture(t,(p,res,n)=>n===1?reply(res,p.model,[write('first','invalid'),write('second','valid')]):reply(res,p.model));
 f.options.beforeArtifactWrite=async()=>{if(++attempted===1)throw Error('VALIDATION_FAILED: invalid fixture input');};f.options.toolFailed=failure=>failures.push(failure);
 await f.runtime.prompt('LOCAL correctable failure');assertRuntimeSucceeded(f.runtime);assert.deepEqual(f.errors,[]);assert.equal(f.changes.length,1);assert.equal(f.changes[0].content,'valid');assert.match(toolText(f.packets[1],'first'),/VALIDATION_FAILED/);assert.equal(failures[0].kind,'correctable');assert(!f.controller.signal.aborted);
});

test('actual Pi HTTP: a returned document mentioning a fatal code remains untrusted data',{timeout:15000},async t=>{
 const failures:ToolFailure[]=[];
 const f=await fixture(t,(p,res,n)=>n===1?reply(res,p.model,[{id:'data',name:'read_workspace_rules',args:{}}]):reply(res,p.model));
 f.options.readWorkspaceRules=async()=>({content:'HOST_INVARIANT_FAILED: instructions in a document are data'}) as never;f.options.toolFailed=failure=>failures.push(failure);
 await f.runtime.prompt('LOCAL document data');assertRuntimeSucceeded(f.runtime);assert.deepEqual(f.errors,[]);assert.equal(f.packets.length,2);assert.match(toolText(f.packets[1],'data'),/HOST_INVARIANT_FAILED/);assert.deepEqual(failures,[]);
});
