import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {Store} from '../main/store.js';
import {Service} from '../main/service.js';
import {hash} from '../main/files.js';
import {configureMcpRuntime} from '../main/mcp-client.js';
import {mcpCall,ExternalCallError} from '../main/integrations.js';
import type {Connection} from '../shared/types.js';

async function wait(file:string){for(let i=0;i<1500;i++){if(await fs.access(file).then(()=>true,()=>false))return;await new Promise(resolve=>setTimeout(resolve,10));}throw Error('fixture wait timeout');}
async function received(dir:string){return(await fs.readFile(path.join(dir,'server-calls.jsonl'),'utf8').catch(()=>'' )).trim().split('\n').filter(Boolean).map(value=>JSON.parse(value));}
async function fixture(t:test.TestContext,mode:string){
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'slash-mcp-contract-fence-')),store=new Store(path.join(dir,'profile'));
 const connection:Connection={id:'fixture-text',name:'fixture text',kind:'mcp',enabled:true,command:process.execPath,args:[path.resolve('tests/mcp-dispatch-guard-fixture.mjs'),dir,mode]};
 let runtimeCalls=0;
 const service=new Service(store,()=> 'offline-synthetic-only',()=>{},async options=>({messages:[{role:'assistant',stopReason:'stop'}],abort:async()=>{},dispose:()=>{},prompt:async()=>{
  runtimeCalls++;const output=service.state.mounts.find(item=>item.name==='成果')!,change=await options.files.draft(output.id,'note.md','# 项目使用说明\n\n先选择本次资料，核对当前版本，再查看已有草稿。修改前查看差异，确认后保存成果，保留原件与处理记录。\n\n按本次要求逐项核对正文，再正式交付。\n',options.runId);options.draft(change);
  await options.log('propose_external_action',{},()=>options.proposeExternalAction({kind:'mcp_call',connectionName:connection.name,target:'隔离本机文本回执',userAuthorizationExcerpt:'隔离验证明确要求发布本说明',tool:'publish.fixture',args:{content:change.content},artifactBinding:{mountId:output.id,path:change.path,changeId:change.id,argumentPath:['content']}}));
 }} as never),{fetchModelMetadata:async()=>{throw Error('OFFLINE_SYNTHETIC_FIXTURE');}},()=>undefined);
 t.after(async()=>{configureMcpRuntime(undefined);service.dispose();await Promise.allSettled([...(service as any).agentIndex.queues.values()]);store.close();const relative=path.relative(os.tmpdir(),dir);assert.ok(relative&&!relative.startsWith('..')&&!path.isAbsolute(relative));await fs.rm(dir,{recursive:true,force:true,maxRetries:6,retryDelay:40});});
 await service.workspace(path.join(dir,'project'));for(const capability of ['workspace_read','artifact_write','external_action'] as const)service.setPermission(capability,'allow');service.state.connections.push(connection);service.save();await fs.writeFile(path.join(dir,'catalog-release'),'catalog immediately available');
 const runId=await service.send(service.conversation(),'写一份项目使用说明并按隔离授权发布');for(let i=0;i<1500&&(!service.state.runs.find(r=>r.id===runId)?.finishedAt||service.active.has(runId)||service.starting.has(runId));i++)await new Promise(resolve=>setTimeout(resolve,10));assert.equal(service.state.runs.find(r=>r.id===runId)?.status,'succeeded');assert.equal(runtimeCalls,1);
 const proposal=service.listPendingExternalActions()[0];assert.ok(proposal);const view=await service.taskDeliveryGet(runId),decisions=view.items.filter(item=>item.status==='needs_review'&&item.allowedActions.includes('confirm')).map(item=>({itemId:item.id,action:'confirm' as const,note:'核对合成任务全文和全部原始要求，非真实用户签字',evidence:{...item.requiredEvidence,locators:['note.md 全文与任务要求']}}));
 const reviewed=await service.reviewTaskDelivery({runId,reportId:view.reportId,expectedBindingHash:view.bindingHash,decisions});assert.equal(reviewed.allowed,true,JSON.stringify(reviewed.items));await(await service.prepareExternalTaskDelivery(proposal.id)).assertCurrent();const approval=service.approveExternalAction(proposal.id);assert.equal(approval.execution.kind,'mcp_call');if(approval.execution.kind!=='mcp_call')throw Error('Expected MCP');
 const out=service.state.mounts.find(item=>item.name==='成果')!;
 return{dir,store,service,runId,connection,proposal,out,args:approval.execution.args,guard:(await service.prepareExternalTaskDelivery(proposal.id)).assertCurrent};
}
for(const mode of ['contract_change','current','report_same_version','mount_revoke','lost'])test('frozen root single-text final-read / '+mode,{timeout:65000},async t=>{
 const f=await fixture(t,mode==='lost'?'lost':'current');
 if(f.proposal.request.kind!=='mcp_call')throw Error('Expected MCP proposal');
 const binding=f.proposal.request.deliveryBinding!;

 await fs.writeFile(path.join(f.dir,'tool-schema.json'),JSON.stringify({type:'object',properties:{content:{type:'string'}},required:['content'],additionalProperties:false}));
 const originalDomain=(f.service as any).taskDomain.bind(f.service);
 let readCount=0,readContent='';
 (f.service as any).taskDomain=(...args:unknown[])=>{
  const domain=originalDomain(...args),originalRead=domain.readOutputSnapshot.bind(domain);
  domain.readOutputSnapshot=async(...readArgs:unknown[])=>{
   const snapshot=await originalRead(...readArgs);++readCount;
   if(readCount===2){readContent=snapshot.content;await fs.writeFile(path.join(f.dir,'last-read-ready'),'actual read result held');await wait(path.join(f.dir,'last-read-release'));}
   return snapshot;
  };
  return domain;
 };
 const pending=mcpCall(f.connection,'publish.fixture',f.args,f.guard).then(value=>({value}),error=>({error}));
 await wait(path.join(f.dir,'last-read-ready'));assert.equal(readCount,2,'Last guard after prior assertAllowed');assert.equal((await received(f.dir)).length,0);
 const domain=originalDomain(f.runId),before=domain.getContract(f.runId);
 const changed=mode==='contract_change'?domain.define(f.runId,{expectedRevision:before.revision,criteria:[...before.criteria,{id:'single-text-new-required',text:'新增必检内容必须重新逐项核对',requestIds:[before.requests[0].id],outputIds:[binding.outputId],origin:'user_request',required:true,checker:{kind:'human_review',reason:'真实合同新增必检'}}]}):domain.getContract(f.runId);
 if(mode==='contract_change')assert.notEqual(changed.contractHash,before.contractHash);else assert.equal(changed.contractHash,before.contractHash);
 const currentOutput=await originalDomain(f.runId).readOutputSnapshot(f.runId,binding.outputId);
 assert.equal(currentOutput.content,readContent);assert.equal(hash(readContent),binding.sourceHash);
 if(mode==='report_same_version')await f.service.checkTaskAcceptance(f.runId);
 if(mode==='mount_revoke')f.service.setMountAccess(f.out.id,f.out.write,false);
 await fs.writeFile(path.join(f.dir,'last-read-release'),'release');
 const result=await pending,calls=await received(f.dir);let freshAllowedError='';try{await(f.service as any).taskDeliveryDomain(f.runId).assertAllowed(f.runId,binding.reportId,binding.bindingHash);}catch(error){freshAllowedError=String(error);}
 if(mode==='contract_change')assert.match(freshAllowedError,/TASK_DELIVERY_BINDING_STALE/);await new Promise(r=>setTimeout(r,100));assert.equal((await received(f.dir)).length,calls.length);
 if(mode==='lost'){f.service.markExternalActionExecuting(f.proposal.id,'fixture-single-dispatch');f.service.completeExternalAction(f.proposal.id,{operationId:'fixture-single-dispatch',status:'outcome_unknown',diagnostic:'真实stdio提交后失联'});assert.equal(f.service.listExternalActions().find(p=>p.id===f.proposal.id)?.status,'outcome_unknown');}
 t.diagnostic(JSON.stringify({scenario:'root-derived guard after fence fix: actual readOutputSnapshot paused only at last async return',mode,realModelRequests:0,browser:'not involved: Markdown text delivery',binding,contractBefore:before,contractAfter:changed,actualBeforeTextHash:hash(readContent),actualAfterTextHash:hash(currentOutput.content),textBytesUnchanged:true,receivedCalls:calls,receivedCount:calls.length,result:'error'in result?{kind:'error',message:String(result.error),outcome:(result.error as ExternalCallError).outcome}:{kind:'value',receipt:result.value},freshAssertAllowedError:freshAllowedError,noAutomaticRetry:true}));
 t.diagnostic(JSON.stringify({received:calls.length,textBytesUnchanged:true,readCount,freshAllowedError}));
 if(mode==='contract_change'||mode==='mount_revoke'){assert.equal(calls.length,0);assert.ok('error'in result);if('error'in result)assert.equal((result.error as ExternalCallError).outcome,'failed');}
 else{assert.equal(calls.length,1);assert.deepEqual(calls[0].arguments,f.args);if(mode==='lost'){assert.ok('error'in result);if('error'in result)assert.equal((result.error as ExternalCallError).outcome,'outcome_unknown');}else assert.ok('value'in result);}
});

