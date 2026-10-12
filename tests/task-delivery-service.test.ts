import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {Store} from '../main/store.js';
import {Service} from '../main/service.js';
import {hash} from '../main/files.js';

const publishHtml='<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>项目使用说明</title><style>*{box-sizing:border-box}body{font:16px system-ui;margin:0;background:#f8fafc;color:#172033}main{max-width:720px;margin:auto;padding:24px}button{font:inherit;padding:12px 20px;border:0;border-radius:8px;background:#195cca;color:white}section{padding:20px;background:white;border-radius:12px;line-height:1.8}</style></head><body><main><h1>项目使用说明</h1><section><h2>开始整理任务</h2><p>先选择本次相关资料，查看已有草稿，再核对实际内容。项目目录保存原始资料和成果，选择来源时确认当前版本。</p><p>修改已有内容时先预览差异，确认后保存。使用说明用于帮助你逐项完成资料准备、成果查看和业务核对。</p><button type="button" onclick="document.getElementById(\'feedback\').textContent=\'已确认本次整理步骤\'">确认整理步骤</button><p id="feedback" aria-live="polite">准备开始整理</p></section></main></body></html>';
async function fixture(t:test.TestContext,withSource=false,withMcp:boolean|'html'=false){
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'slash-delivery-host-')),store=new Store(path.join(dir,'profile'));
 const service=new Service(store,()=> 'fixture-only',()=>{},async options=>({messages:[{role:'assistant',stopReason:'stop'}],abort:async()=>{},dispose:()=>{},prompt:async()=>{
  if(withSource){const resource=service.state.mounts.find(mount=>mount.name==='资源')!,text=await options.files.read(resource.id,'source.txt');await options.sourceRead!({mountId:resource.id,path:'source.txt',versionId:'current',contentHash:hash(text),readAt:new Date().toISOString(),characters:text.length,includedCharacters:text.length,truncated:false});}
  const output=service.state.mounts.find(mount=>mount.name==='成果')!,change=await service.files.draft(output.id,withMcp==='html'?'index.html':'note.md',withMcp==='html'?publishHtml:'# 项目使用说明\n\n这是为本次任务整理的说明。请在会话选择资料，查看已有草稿，再核对实际内容。\n\n查看项目目录可以定位文件，确认当前版本。\n',options.runId);options.draft(change);
  if(withMcp)await options.log('propose_external_action',{kind:'mcp_call',tool:'publish'},()=>options.proposeExternalAction({kind:'mcp_call',connectionName:'fixture MCP',target:'用户指定站点',userAuthorizationExcerpt:'用户明确要求发布本次使用说明',tool:'publish',args:{document:{content:change.content}},artifactBinding:{mountId:change.mountId,path:change.path,changeId:change.id,argumentPath:['document','content']}}));
 }} as never),{fetchModelMetadata:async()=>{throw Error('OFFLINE_DELIVERY_FIXTURE');}});
 t.after(async()=>{service.dispose();await Promise.allSettled([...(service as any).agentIndex.queues.values()]);store.close();const relative=path.relative(os.tmpdir(),dir);assert.ok(relative&&!relative.startsWith('..')&&!path.isAbsolute(relative));await fs.rm(dir,{recursive:true,force:true,maxRetries:5,retryDelay:30});});
 await service.workspace(path.join(dir,'project'));service.setPermission('workspace_read','allow');service.setPermission('artifact_write','allow');
 if(withMcp){service.setPermission('external_action','allow');service.state.connections.push({id:'fixture-mcp',name:'fixture MCP',kind:'mcp',command:'fixture-only',args:[],enabled:true});service.save();}
 if(withSource)await fs.writeFile(path.join(service.state.mounts.find(mount=>mount.name==='资源')!.path,'source.txt'),'本次业务来源：先核对资料，再处理任务。');
 const runId=await service.send(service.conversation(),'写一份简短项目使用说明。');for(let i=0;i<1000&&(!service.state.runs.find(run=>run.id===runId)?.finishedAt||service.active.has(runId)||service.starting.has(runId));i++)await new Promise(resolve=>setTimeout(resolve,10));
 const change=service.state.changes[0];assert.ok(change);return{dir,store,service,run:service.state.runs.find(run=>run.id===runId)!,change,target:{mountId:change.mountId,path:change.path,changeId:change.id,expectedContentHash:hash(change.content)}};
}

test('ordinary draft save remains available; formal generated delivery requires bound human review and expires on edit',async t=>{
 const f=await fixture(t),prepared=await f.service.prepareTaskDelivery(f.target);assert.ok(prepared.view);assert.equal(prepared.view.allowed,false);
 await assert.rejects(prepared.assertCurrent(),/TASK_DELIVERY_BLOCKED/);
 await f.service.apply(f.change.id);assert.equal(f.change.status,'applied');
 const saved=await f.service.prepareTaskDelivery({...f.target,changeId:undefined}),view=saved.view!;
 const decisions=view.items.filter(item=>item.status==='needs_review'&&item.allowedActions.includes('confirm')).map(item=>({itemId:item.id,action:'confirm' as const,note:'已实际核对该要求与本次成果内容',evidence:{...item.requiredEvidence,locators:['note.md：完整正文核对']}}));
 assert.ok(decisions.length>0);const reviewed=await f.service.reviewTaskDelivery({runId:f.run.id,reportId:view.reportId,expectedBindingHash:view.bindingHash,decisions});assert.equal(reviewed.allowed,true,JSON.stringify(reviewed.items));
 const current=await f.service.prepareTaskDelivery({...f.target,changeId:undefined});await current.assertCurrent();
 await fs.writeFile(path.join(f.service.state.mounts.find(mount=>mount.id===f.change.mountId)!.path,f.change.path),'changed outside after review');await assert.rejects(current.assertCurrent(),/VERSION_CONFLICT/);
});

test('host delivery includes actual Run sourceReads outside PRD section; changed source invalidates bound acceptance',async t=>{
 const f=await fixture(t,true),prepared=await f.service.prepareTaskDelivery(f.target),view=prepared.view!;
 assert.ok(view.items.some(item=>item.kind==='source'&&item.detail.includes('source.txt')));
 const decisions=view.items.filter(item=>item.status==='needs_review'&&item.allowedActions.includes('confirm')).map(item=>({itemId:item.id,action:'confirm' as const,note:'已核对本次来源与成果的实际业务内容',evidence:{...item.requiredEvidence,locators:['source.txt 与 note.md 全文核对']}}));
 const reviewed=await f.service.reviewTaskDelivery({runId:f.run.id,reportId:view.reportId,expectedBindingHash:view.bindingHash,decisions});assert.equal(reviewed.allowed,true,JSON.stringify(reviewed.items));
 const accepted=await f.service.prepareTaskDelivery(f.target);await accepted.assertCurrent();
 await fs.writeFile(path.join(f.service.state.mounts.find(mount=>mount.name==='资源')!.path,'source.txt'),'业务来源已经更改');await assert.rejects(accepted.assertCurrent(),/TASK_DELIVERY_BINDING_STALE|TASK_DELIVERY_BLOCKED/);assert.equal((await f.service.taskDeliveryGet(f.run.id)).allowed,false);
});

test('known generator lacking acceptance summary or report cannot bypass; unknown effects block; imported file remains static path',async t=>{
 const f=await fixture(t);delete f.run.acceptance;
 const retained=await f.service.prepareTaskDelivery(f.target);assert.ok(retained.view);await assert.rejects(retained.assertCurrent(),/TASK_DELIVERY_BLOCKED/);
 f.store.operation('unresolved',f.run.id,'powershell','outcome_unknown');await assert.rejects(f.service.prepareTaskDelivery(f.target),/RUN_REQUIRES_RECONCILIATION/);
 f.store.operation('unresolved',f.run.id,'powershell','succeeded');
 const domain=(f.service as any).taskDomain(f.run.id),contract=domain.getContract(f.run.id),rows=f.store.db.prepare("SELECT key FROM kv WHERE key LIKE '%:reports'").all();assert.ok(rows.length);
 for(const row of rows)f.store.set(String(row.key),[]);
 await assert.rejects(f.service.prepareTaskDelivery(f.target),/TASK_DELIVERY_REPORT_MISSING/);
 const mount=f.service.state.mounts.find(item=>item.name==='成果')!;await fs.writeFile(path.join(mount.path,'imported.md'),'ordinary imported file');const ordinary=await f.service.prepareTaskDelivery({mountId:mount.id,path:'imported.md'});assert.equal(ordinary.view,undefined);await ordinary.assertCurrent();
});

test('ordinary binary copy gate binds raw container bytes, preserves import path and expires on edit',async t=>{
 const f=await fixture(t),mount=f.service.state.mounts.find(item=>item.name==='成果')!,file=path.join(mount.path,'imported.png'),bytes=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a6X8AAAAASUVORK5CYII=','base64');await fs.writeFile(file,bytes);
 const prepared=await f.service.prepareTaskDelivery({mountId:mount.id,path:'imported.png',expectedContentHash:createHash('sha256').update(bytes).digest('hex')});assert.equal(prepared.view,undefined);await prepared.assertCurrent();
 await fs.writeFile(file,Buffer.concat([bytes,Buffer.from('changed')]));await assert.rejects(prepared.assertCurrent(),/VERSION_CONFLICT/);
});

test('runtime proposal before final report binds host payload; latest user review allows approval of same versions only',async t=>{
 const f=await fixture(t,false,true),proposal=f.service.listPendingExternalActions()[0];assert.ok(proposal,'real runtime proposal created');assert.equal(f.run.status,'succeeded');assert.equal(proposal.request.kind,'mcp_call');if(proposal.request.kind!=='mcp_call')return;
 const frozen=proposal.request.deliveryBinding!;assert.ok(frozen);assert.equal(frozen.argsHash,hash(JSON.stringify(proposal.request.args)));const view=await f.service.taskDeliveryGet(f.run.id);assert.notEqual(view.reportId,frozen.reportId,'Run finish creates final report');
 await assert.rejects((await f.service.prepareExternalTaskDelivery(proposal.id)).assertCurrent(),/TASK_DELIVERY_BLOCKED/);
 const decisions=view.items.filter(item=>item.status==='needs_review'&&item.allowedActions.includes('confirm')).map(item=>({itemId:item.id,action:'confirm' as const,note:'已核对本次用户要求与发布原文',evidence:{...item.requiredEvidence,locators:['note.md全文与发布文本对照']}}));await f.service.reviewTaskDelivery({runId:f.run.id,reportId:view.reportId,expectedBindingHash:view.bindingHash,decisions});
 const guarded=await f.service.prepareExternalTaskDelivery(proposal.id);await guarded.assertCurrent();assert.equal(guarded.view?.reportId,view.reportId);
 assert.throws(()=>f.service.approveExternalAction(proposal.id,{args:{document:{content:'替换为不一致发布正文'}}}),/TASK_DELIVERY_BINDING_STALE/);
 const approved=f.service.approveExternalAction(proposal.id);assert.equal(approved.proposal.status,'approved');const dispatch=await f.service.prepareExternalTaskDelivery(proposal.id);await dispatch.assertCurrent();
 const live=(f.service as any).externalActions.find((item:any)=>item.id===proposal.id);live.request.args.document.content+='未经核对追加内容';await assert.rejects(dispatch.assertCurrent(),/TASK_DELIVERY_BINDING_STALE/);
});

test('MCP rejects absent/foreign/unsafe/text-mismatched binding, stale output and permission revocation; old facts stay unchanged',async t=>{
 const f=await fixture(t,false,true),proposal=f.service.listPendingExternalActions()[0],base={kind:'mcp_call' as const,connectionId:'fixture-mcp',target:'指定站点',userAuthorizationExcerpt:'用户明确要求发布使用说明',tool:'publish',args:{content:f.change.content}},locator={mountId:f.change.mountId,path:f.change.path,changeId:f.change.id,argumentPath:['content']};
 await assert.rejects(f.service.createExternalActionProposal(f.run.id,f.run.conversationId,base),/TASK_DELIVERY_ARTIFACT_BINDING_REQUIRED/);
 await assert.rejects(f.service.createExternalActionProposal(f.run.id,f.run.conversationId,{...base,artifactBinding:{...locator,path:'foreign.md'}}),/TASK_DELIVERY_OUTPUT_NOT_FOUND/);
 await assert.rejects(f.service.createExternalActionProposal(f.run.id,f.run.conversationId,{...base,artifactBinding:{...locator,argumentPath:['constructor']}}));
 await assert.rejects(f.service.createExternalActionProposal(f.run.id,f.run.conversationId,{...base,args:{content:'模型伪造正文'},artifactBinding:locator}),/TASK_DELIVERY_PAYLOAD_MISMATCH/);
 const live=(f.service as any).externalActions.find((item:any)=>item.id===proposal.id),saved=structuredClone(live.request.deliveryBinding);delete live.request.deliveryBinding;await assert.rejects(f.service.prepareExternalTaskDelivery(proposal.id),/TASK_DELIVERY_ARTIFACT_BINDING_REQUIRED/);assert.equal(live.request.deliveryBinding,undefined);live.request.deliveryBinding=saved;
 f.service.setPermission('external_action','deny');await assert.rejects(f.service.prepareExternalTaskDelivery(proposal.id),/PERMISSION_DENIED/);f.service.setPermission('external_action','allow');
 f.change.content+='真实草稿已修改';await assert.rejects(f.service.prepareExternalTaskDelivery(proposal.id),/TASK_ACCEPTANCE_TARGET_CHANGED|TASK_DELIVERY_PAYLOAD_MISMATCH/);assert.equal(live.status,'pending');
});

test('self-contained HTML proposal binds exact trusted UTF8 text; absent real browser evidence cannot be declared publishable',async t=>{
 const f=await fixture(t,false,'html'),proposal=f.service.listPendingExternalActions()[0];assert.ok(proposal,JSON.stringify({run:f.run,operations:f.store.operationsForRun(f.run.id)}));if(proposal.request.kind!=='mcp_call')throw Error('MCP proposal expected');
 assert.equal((proposal.request.args as any).document.content,publishHtml);assert.equal(proposal.request.deliveryBinding?.sourceHash,hash(publishHtml));assert.equal(proposal.request.deliveryBinding?.path,'index.html');
 const guard=await f.service.prepareExternalTaskDelivery(proposal.id);assert.equal(guard.view?.allowed,false);await assert.rejects(guard.assertCurrent(),/TASK_DELIVERY_BLOCKED|TASK_DELIVERY_BINDING_STALE/);assert.equal(proposal.status,'pending');
 const diagnostic=f.store.operationsForRun(f.run.id).find(item=>item.tool==='run_prototype_acceptance');assert.ok(diagnostic);assert.equal(diagnostic.state,'outcome_unknown');assert.equal(f.store.recoveryForOperation(diagnostic.id)?.dispatch,'settled','host persisted check result is not an unknown side effect');
 const uncertain='actual-side-effect-same-tool';f.store.operation(uncertain,f.run.id,'run_prototype_acceptance','executing');f.store.saveRecovery({operationId:uncertain,runId:f.run.id,tool:'run_prototype_acceptance',effect:'validation',dispatch:'may_have_run',resolution:'pending',evidenceRefs:[],updatedAt:new Date().toISOString()});await fs.writeFile(path.join(f.dir,'side-effect.txt'),'actual write before receipt');f.store.finishOperation(uncertain,f.run.id,'run_prototype_acceptance','outcome_unknown','实际副作用未完成回执');await assert.rejects(f.service.prepareExternalTaskDelivery(proposal.id),/RUN_REQUIRES_RECONCILIATION/);assert.equal(f.store.recoveryForOperation(uncertain)?.resolution,'pending');
});
