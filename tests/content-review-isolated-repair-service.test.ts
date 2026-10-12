import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {Store} from '../main/store.js';
import {Service} from '../main/service.js';
import {hash} from '../main/files.js';
import {verifyContentReviewReceipt} from '../main/content-review.js';
import {repairableTaskFailures} from '../main/task-completion.js';

type Fault='none'|'source'|'draft'|'read-revoked'|'write-revoked'|'cancel'|'unknown'|'persistent'|'late-cancel'|'late-revoke'|'late-permission'|'late-workspace';
const oldClaim='该流程适用于所有阶段。',sourceText='仅适用于初始阶段，其他阶段需确认。',newClaim='该流程仅适用于初始阶段；其他阶段需确认。';
const content='# 阶段分析报告\n\n'+oldClaim+'\n\n## 业务依据\n根据已经授权的资料核对阶段范围，来源未说明的其他阶段必须保留待确认，不能据行业习惯补造业务规则。\n\n## 待核对事项\n原始规则与成果保持关联；本地草稿等待完整业务核对，不代表正式交付。\n';
async function wait(check:()=>boolean){for(let n=0;n<1500;n++){if(check())return;await new Promise(done=>setTimeout(done,10));}throw Error('offline Service fixture timed out');}
async function fixture(t:test.TestContext,fault:Fault='none'){
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'slash-isolated-repair-')),store=new Store(path.join(dir,'profile'));
 let service!:Service,prompts:string[]=[],reviewCalls=0,source!: {id:string;path:string},target!: {mountId:string;path:string},visualSeen=false,injected=false;
 // Deterministic Runtime replaces the model only; Store, Service, source reads,
 // current-input refresh, gateway draft editing and TaskDelivery are real.
 service=new Service(store,()=> 'synthetic-only',()=>{},async options=>({
  messages:[{role:'assistant',stopReason:'stop'}],abort:async()=>{},dispose:()=>{},
  prompt:async(text:string)=>{
   prompts.push(text);
   if(prompts.length===1){
    const actual=await options.files.read(source.id,'rules.md');options.sourceRead!({mountId:source.id,path:'rules.md',versionId:'current',contentHash:hash(actual),characters:actual.length,includedCharacters:actual.length,truncated:false,readAt:new Date().toISOString()});
    const change=await options.files.draft(target.mountId,target.path,content,options.runId);options.draft(change);
   }else if(fault!=='persistent'){
    assert.ok(text.includes('VALID_SERVICE_FINDING'));assert.ok(!text.includes('INVALID_SERVICE_FINDING'));
    const read=await options.log('read_draft',target,()=>options.readDraft!(target));
    await options.log('edit_draft',target,()=>options.editDraft!({...target,changeId:read.changeId,expectedContentHash:read.contentHash,oldText:oldClaim,newText:newClaim}));
   }
  },
  reviewContent:async(prompt:string)=>{
   reviewCalls++;const input=JSON.parse(prompt.slice(prompt.lastIndexOf('\n')+1)),artifact=input.artifacts[0],readSource=input.sources[0];
   const good={category:'scope_expansion',severity:'blocking',confidence:'high',scope:'in_scope',repairDisposition:'candidate',explanation:'VALID_SERVICE_FINDING',artifacts:[{artifactRef:artifact.ref,quote:oldClaim}],sources:[{sourceRef:readSource.ref,quote:sourceText}],requests:[{requestRef:input.requests[0].ref,quote:input.requests[0].excerpts[0].text}]};
   const bad={...good,explanation:'INVALID_SERVICE_FINDING',artifacts:[{artifactRef:artifact.ref,quote:'虚构成果原句'}]};
   return{text:JSON.stringify({findings:artifact.excerpts.some((e:any)=>e.text.includes(oldClaim))?[good,bad]:[bad],coverage:{artifactRefs:input.artifacts.map((d:any)=>d.ref),sourceRefs:input.sources.map((d:any)=>d.ref),requestRefs:input.requests.map((d:any)=>d.ref),directions:['scope_expansion'],limitations:['仍需完整人工核对']}}),stopReason:'stop'};
  },
 } as never),{fetchModelMetadata:async()=>{throw Error('OFFLINE_FIXTURE');}});
 await service.workspace(path.join(dir,'project'));service.setPermission('workspace_read','allow');service.setPermission('artifact_write','allow');
 const sourceDir=path.join(dir,'sources');await fs.mkdir(sourceDir);await fs.writeFile(path.join(sourceDir,'rules.md'),sourceText);source=await service.mount(sourceDir,false);target={mountId:service.state.mounts.find(m=>m.name==='成果')!.id,path:'阶段分析.md'};
 service.state.models=[{id:'fixture-model',name:'Deterministic fixture',baseUrl:'http://127.0.0.1:1/v1',modelId:'offline-fixture',protocol:'openai-completions',hasKey:true,contextWindow:32768,maxTokens:2048}];service.state.defaultModelId='fixture-model';service.save();
 const original=(service as any).finishTaskVisualReview.bind(service);
 (service as any).finishTaskVisualReview=async(...args:any[])=>{
  const result=await original(...args);visualSeen=true;
  if(!injected&&!['none','persistent','late-cancel','late-revoke','late-permission','late-workspace'].includes(fault)){
   injected=true;
   if(fault==='source')await fs.writeFile(path.join(sourceDir,'rules.md'),'规则已变化，不能沿用旧意见。');
   else if(fault==='draft')service.state.changes.find(change=>change.runId===args[0])!.content+='\n真实并发改稿';
   else if(fault==='read-revoked')service.setPermission('workspace_read','deny');
   else if(fault==='write-revoked')service.setPermission('artifact_write','deny');
   else if(fault==='cancel')service.cancel(args[0]);
   else if(fault==='unknown')store.operation('unknown-after-review',args[0],'powershell','outcome_unknown','真实效果待核对');
  }
  return result;
 };
 const read=service.files.read.bind(service.files);
 service.files.read=async(...args:Parameters<typeof read>)=>{
  const value=await read(...args);
  if(visualSeen&&!injected&&['late-cancel','late-revoke','late-permission','late-workspace'].includes(fault)){
   injected=true;await new Promise(done=>setImmediate(done));const runId=service.state.runs[0].id;
   if(fault==='late-cancel')service.cancel(runId);else if(fault==='late-permission')service.setPermission('artifact_write','ask');else if(fault==='late-workspace'){const before=service.state.root,contract=(service as any).taskDomain(runId).getContract(runId);await assert.rejects(service.workspace(path.join(dir,'other-project')),/WORKSPACE_BUSY/);assert.equal(service.state.root,before);assert.deepEqual((service as any).taskDomain(runId).getContract(runId),contract);}else service.setPermission('workspace_read','deny');
  }
  return value;
 };
 t.after(async()=>{
  for(const id of service.active.keys())service.cancel(id);await wait(()=>service.active.size===0&&service.starting.size===0);
  service.dispose();await Promise.allSettled([...(service as any).agentIndex.queues.values()]);store.close();await fs.rm(dir,{recursive:true,force:true,maxRetries:6,retryDelay:30});
 });
 const runId=await service.send(service.conversation(),'基于授权资料撰写阶段分析报告，仅修正来源明确指出的范围。','build','standard','fixture-model');
 await wait(()=>!!service.state.runs.find(run=>run.id===runId)?.finishedAt&&service.active.size===0&&service.starting.size===0);
 return{dir,store,service,source,target,runId,prompts,reviewCalls:()=>reviewCalls,visualSeen:()=>visualSeen,injected:()=>injected,run:service.state.runs.find(run=>run.id===runId)!};
}

test('real Service mixed receipt drives only the eligible local draft repair and does not authorize formal delivery',async t=>{
 const f=await fixture(t);assert.equal(f.run.status,'succeeded',f.run.error);assert.equal(f.run.acceptance?.repairRounds,1);assert.equal(f.prompts.length,2);assert.equal(f.reviewCalls(),2);
 const reports=(f.service as any).taskDomain(f.runId).listReports(f.runId),mixed=reports.find((report:any)=>report.contentReview?.isolatedRepair)?.contentReview;
 assert.ok(mixed);assert.equal(mixed.completion,'invalid');assert.equal(mixed.status,'unverified');assert.equal(mixed.invalidFindings.length,1);assert.ok(verifyContentReviewReceipt(mixed));
 const change=f.service.state.changes.find(c=>c.runId===f.runId)!;assert.ok(change.content.includes(newClaim));assert.equal(change.status,'pending');
 const delivery=await f.service.prepareTaskDelivery({...f.target,changeId:change.id,expectedContentHash:hash(change.content)});assert.equal(delivery.view?.allowed,false);await assert.rejects(delivery.assertCurrent(),/TASK_DELIVERY_BLOCKED/);
 assert.equal(await fs.readFile(path.join(f.source.path,'rules.md'),'utf8'),sourceText);assert.equal(f.reviewCalls(),2);
});

for(const fault of ['source','draft','read-revoked','write-revoked','cancel','unknown','late-cancel','late-revoke','late-permission'] as const)test(`real Service ${fault} at visual/refresh await boundary sends zero stale repair prompts`,async t=>{
 const f=await fixture(t,fault);assert.equal(f.visualSeen(),true);assert.equal(f.injected(),true);assert.equal(f.prompts.length,1);assert.equal(f.run.acceptance?.repairRounds,0);assert.equal(f.reviewCalls(),1);
 if(fault==='source'||fault==='draft'){
  const report=(await f.service.getTaskAcceptance(f.runId))!.latestReport!;assert.notEqual(report.contentReview?.versionState,'current');assert.equal(report.contentReview?.isolatedRepair,undefined);assert.ok(report.contentReview?.findings.every(f=>!f.repairEligible));
  assert.equal(repairableTaskFailures({...report,versionState:'current'}).filter(f=>f.evidence.some(e=>e.kind==='model_content_review')).length,0,'overall current never restores stale content opinions');
 }
 if(fault==='unknown')assert.equal(f.store.operationsForRun(f.runId).find(o=>o.id==='unknown-after-review')?.state,'outcome_unknown');
});

test('real workspace API rejects active switch and the original authorized task can continue limited repair',async t=>{
 const f=await fixture(t,'late-workspace');assert.equal(f.injected(),true);assert.equal(f.run.status,'succeeded',f.run.error);assert.equal(f.prompts.length,2);assert.equal(f.run.acceptance?.repairRounds,1);assert.equal(f.reviewCalls(),2);
});

test('persistent mixed review reuses the same Runtime and original two-round limit, never marks aggregate valid',async t=>{
 const f=await fixture(t,'persistent');assert.equal(f.run.acceptance?.repairRounds,2);assert.equal(f.prompts.length,3);assert.equal(f.reviewCalls(),1,'unchanged review reuses cached receipt without another model call');
 const report=(await f.service.getTaskAcceptance(f.runId))!.latestReport!;assert.equal(report.contentReview?.completion,'invalid');assert.equal(report.status,'unverified');assert.equal(report.contentReview?.humanConfirmed,false);
});

test('real TaskAcceptance unavailable refresh clears isolated scope and findings, recomputes derived hash without altering history',async t=>{
 const f=await fixture(t,'persistent'),domain=(f.service as any).taskDomain(f.runId),stored=domain.listReports(f.runId).find((report:any)=>report.contentReview?.isolatedRepair);
 assert.ok(stored);const bytes=JSON.stringify(stored.contentReview);f.service.setPermission('workspace_read','deny');const hidden=await domain.getReport(f.runId,stored.id);
 assert.equal(hidden.contentReview.versionState,'unavailable');assert.equal(hidden.contentReview.isolatedRepair,undefined);assert.deepEqual(hidden.contentReview.findings,[]);assert.ok(verifyContentReviewReceipt(hidden.contentReview));assert.notEqual(hidden.contentReview.resultHash,stored.contentReview.resultHash);
 assert.equal(JSON.stringify(domain.listReports(f.runId).find((report:any)=>report.id===stored.id).contentReview),bytes);
});
