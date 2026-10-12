import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import {randomUUID} from 'node:crypto';
import {Server} from '@modelcontextprotocol/sdk/server/index.js';
import {StreamableHTTPServerTransport} from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {ListToolsRequestSchema,CallToolRequestSchema} from '@modelcontextprotocol/sdk/types.js';
import {mcpCall,ExternalCallError,classifyReceipt} from '../main/integrations.js';
import {configureMcpRuntime} from '../main/mcp-client.js';
import {McpOAuthBroker} from '../main/mcp-oauth.js';
import {McpElicitationBroker} from '../main/mcp-elicitations.js';
import {McpCredentialVault} from '../main/mcp-credentials.js';
import {Store} from '../main/store.js';
import {Service} from '../main/service.js';
import type {Connection} from '../shared/types.js';

const isolatedRoot=path.resolve('.');
const sensitiveError='MCP_PRE_DISPATCH_REJECTED PRIVATE_FIXTURE_TOKEN=synthetic-secret https://private.example.invalid/account';
function inside(target:string){const resolved=path.resolve(target),relative=path.relative(isolatedRoot,resolved);assert.ok(relative&&!relative.startsWith('..')&&!path.isAbsolute(relative));return resolved;}
async function ready(file:string){for(let i=0;i<1500;i++){if(await fs.access(file).then(()=>true,()=>false))return;await new Promise(resolve=>setTimeout(resolve,10));}throw Error('fixture wait timeout');}
async function serverCalls(dir:string){return(await fs.readFile(path.join(dir,'server-calls.jsonl'),'utf8').catch(()=> '')).trim().split('\n').filter(Boolean).map(line=>JSON.parse(line));}
async function transport(dir:string,kind:'stdio'|'http',mode:string){
 if(kind==='stdio')return{connection:{id:'fixture',name:'fixture',kind:'mcp',command:process.execPath,args:[path.resolve('tests/mcp-dispatch-guard-fixture.mjs'),dir,mode],enabled:true} as Connection,close:async()=>{}};
 const server=new Server({name:'isolated-http-dispatch-fixture',version:'1'},{capabilities:{tools:{}}}),wire=new StreamableHTTPServerTransport({sessionIdGenerator:()=>randomUUID(),enableJsonResponse:true});
 server.setRequestHandler(ListToolsRequestSchema,async()=>{await fs.writeFile(path.join(dir,'catalog-ready'),'ready');await ready(path.join(dir,'catalog-release'));return{tools:[{name:'publish.fixture',inputSchema:{type:'object',properties:{content:{type:'string'}},required:['content'],additionalProperties:false}}]};});
 const network=http.createServer(async(req,res)=>{try{let parsed:unknown;if(req.method==='POST'){let body='';for await(const chunk of req)body+=chunk;parsed=JSON.parse(body);}await wire.handleRequest(req,res,parsed);}catch{if(!res.headersSent)res.writeHead(500);res.end();}});
 server.setRequestHandler(CallToolRequestSchema,async request=>{await fs.appendFile(path.join(dir,'server-calls.jsonl'),JSON.stringify(request.params)+'\n');if(mode==='remote_sensitive')throw Error(sensitiveError);if(mode==='lost'){network.closeAllConnections();void wire.close();return new Promise(()=>{});}return{content:[{type:'text',text:'fixture publication completed'}],structuredContent:{success:true,status:'completed'}};});
 await server.connect(wire);await new Promise<void>(resolve=>network.listen(0,'127.0.0.1',resolve));const port=(network.address() as import('node:net').AddressInfo).port;
 return{connection:{id:'fixture',name:'fixture',kind:'mcp',command:'',args:[],url:`http://127.0.0.1:${port}/mcp`,enabled:true} as Connection,close:async()=>{network.closeAllConnections();await wire.close();await server.close();await new Promise<void>(resolve=>network.close(()=>resolve()));}};
}
async function fixture(t:test.TestContext,kind:'stdio'|'http',mode:string){
 const dir=inside(path.join(isolatedRoot,'test-data','dispatch-'+randomUUID()));await fs.mkdir(dir,{recursive:true});const local=await transport(dir,kind,mode),store=new Store(path.join(dir,'profile'));let modelCalls=0;
 const service=new Service(store,()=> 'fixture-only',()=>{},async options=>({messages:[{role:'assistant',stopReason:'stop'}],abort:async()=>{},dispose:()=>{},prompt:async()=>{modelCalls++;const mount=service.state.mounts.find(item=>item.name==='成果')!,change=await options.files.draft(mount.id,'note.md','# 项目交付说明\n\n整理已有资料后查看成果，逐项核对实际要求和内容。修改时先查看差异，再保存到项目目录。\n\n保留原始资料和版本，后续任务可继续查看。',options.runId);options.draft(change);await options.log('propose_external_action',{},()=>options.proposeExternalAction({kind:'mcp_call',connectionName:'fixture',target:'本机隔离站点',userAuthorizationExcerpt:'用户明确授权隔离测试发布该说明',tool:'publish.fixture',args:{content:change.content},artifactBinding:{mountId:change.mountId,path:change.path,changeId:change.id,argumentPath:['content']}}));}} as never),{fetchModelMetadata:async()=>{throw Error('OFFLINE_DISPATCH_FIXTURE');}});
 await service.workspace(path.join(dir,'project'));for(const permission of ['workspace_read','artifact_write','external_action'] as const)service.setPermission(permission,'allow');service.state.connections.push(local.connection);service.save();
 const runId=await service.send(service.conversation(),'写交付说明并提出隔离发布提案。');for(let i=0;i<1500&&(!service.state.runs.find(item=>item.id===runId)?.finishedAt||service.active.has(runId)||service.starting.has(runId));i++)await new Promise(resolve=>setTimeout(resolve,10));assert.equal(service.state.runs.find(item=>item.id===runId)!.status,'succeeded');
 const proposal=service.listPendingExternalActions()[0];assert.ok(proposal);const view=await service.taskDeliveryGet(runId),decisions=view.items.filter(item=>item.status==='needs_review'&&item.allowedActions.includes('confirm')).map(item=>({itemId:item.id,action:'confirm' as const,note:'实际核对隔离成果与本次要求完整一致',evidence:{...item.requiredEvidence,locators:['note.md 全文核对']}}));assert.ok(decisions.length);const review=await service.reviewTaskDelivery({runId,reportId:view.reportId,expectedBindingHash:view.bindingHash,decisions});assert.equal(review.allowed,true);await(await service.prepareExternalTaskDelivery(proposal.id)).assertCurrent();const approved=service.approveExternalAction(proposal.id);const guard=(await service.prepareExternalTaskDelivery(proposal.id)).assertCurrent;
 const current=()=>service.state.connections.find(item=>item.id==='fixture'),vault=new McpCredentialVault(store,{isEncryptionAvailable:()=>true,encryptString:value=>Buffer.from(value),decryptString:value=>value.toString()}),oauth=new McpOAuthBroker({vault,current,allowLocalFixture:true,openExternal:async()=>assert.fail('no login allowed in fixture')}),elicitations=new McpElicitationBroker({current,openExternal:async()=>assert.fail('no prompts in fixture')});configureMcpRuntime({oauth,elicitations,current});
 t.after(async()=>{configureMcpRuntime(undefined);oauth.close();await local.close();service.dispose();await Promise.allSettled([...(service as any).agentIndex.queues.values()]);store.close();inside(dir);await fs.rm(dir,{recursive:true,force:true,maxRetries:6,retryDelay:40});});
 assert.equal(approved.execution.kind,'mcp_call');if(approved.execution.kind!=='mcp_call')throw Error('unexpected fixture execution');
 return{dir,store,service,guard,review,change:service.state.changes[0],connection:structuredClone(local.connection),args:approved.execution.args,modelCalls:()=>modelCalls};
}

for(const kind of ['stdio','http'] as const)for(const mode of ['asset','review','current','lost','connection','host_sensitive','remote_sensitive'])test(`${kind} dispatch / ${mode}: actual local catalog wait, host delivery guard and received-call count`,{timeout:60000},async t=>{
 const f=await fixture(t,kind,mode);let guardCalls=0;
 // Match main.executeMcp's earlier preflight, then verify again at actual send.
 await f.guard();const call=mcpCall(f.connection,'publish.fixture',f.args,async()=>{guardCalls++;await f.guard();if(mode==='host_sensitive')throw Error(sensitiveError);if(mode==='connection'){await new Promise(resolve=>setImmediate(resolve));f.service.state.connections[0].enabled=false;}});const result=call.then(value=>({value}),error=>({error}));
 await ready(path.join(f.dir,'catalog-ready'));
 if(mode==='asset')f.change.content+='\n等待连接期间改变的成果';
 if(mode==='review'){const key=f.store.db.prepare("SELECT key FROM kv WHERE value LIKE ?").all('%'+f.review.recordIds[0]+'%').find(row=>String(row.key).includes('delivery'))!.key,records=f.store.get<any[]>(String(key),[]);assert.ok(records.some(record=>f.review.recordIds.includes(record.id)));f.store.set(String(key),records.filter(record=>!f.review.recordIds.includes(record.id)));}
 await fs.writeFile(path.join(f.dir,'catalog-release'),'release');const settled=await result,calls=await serverCalls(f.dir);assert.equal(guardCalls,1);assert.equal(f.modelCalls(),1);
 if(mode==='current'){assert.ok('value' in settled);if('value' in settled)assert.equal(classifyReceipt(settled.value).status,'succeeded');assert.equal(calls.length,1);assert.equal(calls[0].arguments.content,f.change.content);}
 else{const sent=mode==='lost'||mode==='remote_sensitive';assert.ok('error' in settled);if('error' in settled){assert.ok(settled.error instanceof ExternalCallError);assert.equal(settled.error.outcome,sent?'outcome_unknown':'failed');assert.doesNotMatch(settled.error.message,/PRIVATE_FIXTURE_TOKEN|synthetic-secret|private\.example/i);if(sent)assert.doesNotMatch(settled.error.message,/MCP_PRE_DISPATCH_REJECTED/);else assert.match(settled.error.message,/MCP_PRE_DISPATCH_REJECTED/);}assert.equal(calls.length,sent?1:0);}
 await new Promise(resolve=>setTimeout(resolve,80));assert.equal((await serverCalls(f.dir)).length,calls.length,'no automatic retry after refusal or lost receipt');t.diagnostic(JSON.stringify({transport:kind,mode,serverCalls:calls.length,guardCalls,modelCalls:f.modelCalls(),outcome:'error' in settled?(settled.error as ExternalCallError).outcome:'succeeded'}));
});

test('main dispatch forwards the existing delivery closure into the transport, optional callers remain compatible',async()=>{const source=await fs.readFile(path.resolve('main/main.ts'),'utf8');assert.match(source,/mcpCall\(connection,input\.tool,input\.args,beforeDispatch\)/);});
