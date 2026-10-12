import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createServer,type ServerResponse} from 'node:http';
import type {AddressInfo} from 'node:net';
import * as pi from '@earendil-works/pi-coding-agent';
import {Type} from '@sinclair/typebox';
import {loadPiPackage} from '../main/pi-packages.js';
import {registerAgent} from 'pi-subagents/agents';
import {registerSubagentCapabilityCeiling} from 'pi-subagents/capability-ceiling';
import {SUBAGENT_DELEGATION_CANCEL_EVENT,SUBAGENT_DELEGATION_REQUEST_EVENT,SUBAGENT_DELEGATION_RESPONSE_EVENT,type SubagentDelegationRequest,type SubagentDelegationResponse} from 'pi-subagents/delegation';

// Installed real extension/executor; localhost SSE speaks the model protocol.
// This proves embedding contracts only, never real PM/model quality.
function reply(res:ServerResponse){
 res.writeHead(200,{'content-type':'text/event-stream'});
 const base={id:'public-contract-fixture',object:'chat.completion.chunk',created:1,model:'fixture'};
 res.write('data: '+JSON.stringify({...base,choices:[{index:0,delta:{role:'assistant',content:'LOCAL-PROTOCOL-OK'},finish_reason:null}]})+'\n\n');
 res.end('data: '+JSON.stringify({...base,choices:[{index:0,delta:{},finish_reason:'stop'}],usage:{prompt_tokens:20,completion_tokens:5,total_tokens:25}})+'\n\ndata: [DONE]\n\n');
}
async function publicFixture(t:test.TestContext,options:{providerCredential?:boolean;zeroTools?:boolean;handler?:(res:ServerResponse)=>void}={}){
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'slash-public-subagents-')),cwd=path.join(dir,'workspace'),agentDir=path.join(dir,'agent');
 await fs.mkdir(cwd);await fs.mkdir(agentDir);
 const prior=process.env.PI_CODING_AGENT_DIR,priorOffline=process.env.PI_OFFLINE;
 process.env.PI_CODING_AGENT_DIR=agentDir;process.env.PI_OFFLINE='1';
 const headers:(string|undefined)[]=[],requests:unknown[]=[];
 const server=createServer(async(req,res)=>{const chunks:Buffer[]=[];for await(const chunk of req)chunks.push(Buffer.from(chunk));requests.push(JSON.parse(Buffer.concat(chunks).toString()));headers.push(req.headers.authorization);(options.handler??reply)(res);});
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
 let session:pi.AgentSession|undefined;
 const registrations:Array<{dispose():void}>=[];
 t.after(async()=>{
  try{if(session)await session.extensionRunner.emit({type:'session_shutdown',reason:'quit'});}
  finally{
   registrations.forEach(r=>r.dispose());session?.dispose();
   if(prior===undefined)delete process.env.PI_CODING_AGENT_DIR;else process.env.PI_CODING_AGENT_DIR=prior;
   if(priorOffline===undefined)delete process.env.PI_OFFLINE;else process.env.PI_OFFLINE=priorOffline;
   server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));await fs.rm(dir,{recursive:true,force:true,maxRetries:5,retryDelay:30});
  }
 });
 const runtime=await pi.ModelRuntime.create({authPath:path.join(agentDir,'parent-auth.json'),modelsPath:null,refreshOnCreate:false});
 runtime.registerProvider('slash-public-fixture',{api:'openai-completions',...(options.providerCredential?{apiKey:'LOCAL-CONFIG-KEY'}:{}),baseUrl:`http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`,models:[{id:'fixture',name:'fixture',reasoning:false,input:['text'],cost:{input:0,output:0,cacheRead:0,cacheWrite:0},contextWindow:65536,maxTokens:1000,compat:{supportsDeveloperRole:false,supportsStore:false}}]});
 await runtime.setRuntimeApiKey('slash-public-fixture','PARENT-RUNTIME-ONLY-KEY');
 const settings=pi.SettingsManager.inMemory({retry:{enabled:false,provider:{maxRetries:0}}});
 const {default:registerSubagents}=await loadPiPackage<{default:pi.ExtensionFactory}>('subagents');
 let api!:pi.ExtensionAPI,reads=0;
 const extension:pi.ExtensionFactory=extensionApi=>{
  api=extensionApi;registerSubagents(extensionApi);
  registerAgent({pi:extensionApi,name:'slash-contract-probe',definition:{description:'Host-only public contract probe',systemPrompt:'Return LOCAL-PROTOCOL-OK.',tools:options.zeroTools?[]:['read_file'],excludeTools:['bash','powershell','read','write','edit','grep','find','ls','codemode'],model:'inherit',inheritProjectContext:false,inheritGlobalContext:false,inheritSkills:false,allowNestedSubagents:false,maxSubagentDepth:1}});
  extensionApi.on('session_start',(_event,ctx)=>{registrations.push(registerSubagentCapabilityCeiling({sessionId:ctx.sessionManager.getSessionId(),source:'slash-contract-probe',ceiling:{allowedAgents:['slash-contract-probe'],allowedTools:options.zeroTools?[]:['read_file'],denyExtensions:true}}));});
 };
 const loader=new pi.DefaultResourceLoader({cwd,agentDir,settingsManager:settings,noExtensions:true,noSkills:true,noContextFiles:true,noPromptTemplates:true,noThemes:true,extensionFactories:[extension],systemPrompt:'Parent contract fixture'});
 await loader.reload();
 const read:pi.ToolDefinition={name:'read_file',label:'Host read',description:'Controlled parent gateway closure',parameters:Type.Object({path:Type.String()}),execute:async()=>{reads++;return{content:[{type:'text',text:'HOST-GATEWAY-ONLY'}],details:{}};}};
 ({session}=await pi.createAgentSession({cwd,agentDir,modelRuntime:runtime,model:runtime.getModel('slash-public-fixture','fixture')!,settingsManager:settings,resourceLoader:loader,sessionManager:pi.SessionManager.inMemory(cwd),noTools:'builtin',tools:['read_file'],customTools:[read]}));
 await session.bindExtensions({mode:'print'});
 const delegate=(overrides:Partial<SubagentDelegationRequest>={})=>new Promise<SubagentDelegationResponse>((resolve,reject)=>{
  const request:SubagentDelegationRequest={requestId:crypto.randomUUID(),ownerRunId:'parent-contract-run',nodeId:crypto.randomUUID(),agent:'slash-contract-probe',task:'Read the authorized evidence using read_file, then return LOCAL-PROTOCOL-OK.',context:'fresh',cwd,model:'slash-public-fixture/fixture',thinking:'off',timeoutMs:5000,toolBudget:{hard:24},skill:false,artifacts:false,intercomBridge:{mode:'off'},result:{kind:'text'},...overrides};
  const timer=setTimeout(()=>{unsubscribe();reject(Error('PUBLIC_DELEGATION_NO_TERMINAL_RESPONSE'));},10000);
  const unsubscribe=api.events.on(SUBAGENT_DELEGATION_RESPONSE_EVENT,(value:unknown)=>{const response=value as SubagentDelegationResponse;if(response.requestId!==request.requestId)return;clearTimeout(timer);unsubscribe();resolve(response);});
  api.events.emit(SUBAGENT_DELEGATION_REQUEST_EVENT,request);
 });
 return{delegate,headers,requests,stats:()=>({reads}),session,dir,cancel:(request:Pick<SubagentDelegationRequest,'requestId'|'ownerRunId'|'nodeId'>)=>api.events.emit(SUBAGENT_DELEGATION_CANCEL_EVENT,request)};
}

test('公开 delegation 能继承provider注册，但不会继承父runtime临时凭据',{timeout:60000},async t=>{
 const f=await publicFixture(t);
 const response=await f.delegate();
 assert.equal(response.status,'failed');
 assert.match(response.error??'',/No API key found for slash-public-fixture/);
 assert.equal(f.stats().reads,0);
 assert.equal(f.requests.length,0);
 t.diagnostic(JSON.stringify(response));
});

test('公开 delegation 的白名单不会将父网关customTools自动注册到child',{timeout:60000},async t=>{
 const f=await publicFixture(t,{providerCredential:true});
 const response=await f.delegate();
 t.diagnostic(JSON.stringify(response));
 assert.equal(response.status,'failed');
 assert.match(response.error??'',/child tools were unavailable: read_file/);
 assert.equal(f.stats().reads,0);
 assert.equal(f.requests.length,0);
 assert.doesNotMatch(JSON.stringify(f.requests),/"name":"read_file"/);
});

test('同一公开执行器在隔离provider凭据和零工具leaf条件下能完成真实协议回合',{timeout:60000},async t=>{
 const f=await publicFixture(t,{providerCredential:true,zeroTools:true});
 const response=await f.delegate({toolBudget:{hard:0,block:'*'},task:'Return LOCAL-PROTOCOL-OK.'});
 assert.equal(response.status,'completed');assert.deepEqual(response.result,{kind:'text',text:'LOCAL-PROTOCOL-OK'});
 assert.equal(f.requests.length,1);assert.match(f.headers[0]??'',/LOCAL-CONFIG-KEY/);
 assert.equal(f.stats().reads,0);assert.doesNotMatch(JSON.stringify(f.requests),/"name":"(read_file|bash|write|edit)"/);
});

test('公开leaf取消要求完整attempt身份，错误owner不取消，精确身份终结真实协议请求',{timeout:60000},async t=>{
 let entered!:()=>void;const ready=new Promise<void>(resolve=>{entered=resolve;});
 const f=await publicFixture(t,{providerCredential:true,zeroTools:true,handler:res=>{res.writeHead(200,{'content-type':'text/event-stream'});res.flushHeaders();entered();}});
 const identity={requestId:crypto.randomUUID(),ownerRunId:'exact-parent',nodeId:'exact-leaf'};
 const pending=f.delegate({...identity,timeoutMs:10000,toolBudget:{hard:0,block:'*'}});
 let settled=false;void pending.then(()=>{settled=true;});
 await ready;f.cancel({...identity,ownerRunId:'different-parent'});
 await new Promise<void>(resolve=>setImmediate(resolve));assert.equal(settled,false);
 f.cancel(identity);const response=await pending;
 assert.equal(response.status,'cancelled');assert.equal(response.ownerRunId,identity.ownerRunId);assert.equal(response.nodeId,identity.nodeId);
 assert.equal(f.requests.length,1);assert.equal(f.stats().reads,0);
});
