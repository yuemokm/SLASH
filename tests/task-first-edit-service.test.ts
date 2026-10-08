import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {Store} from '../main/store.js';
import {Service} from '../main/service.js';
import {hash} from '../main/files.js';
import type {RuntimeOptions,Runtime} from '../main/agent.js';
import type {PrototypeRunner} from '../main/prototype-acceptance.js';
import type {PrototypeAcceptanceCase} from '../shared/prototype-acceptance.js';

const original='<!doctype html><html><head><title>客户资料</title></head><body><label>客户编号<input id="code" value="C-001" readonly></label><p id="note">保留原字段。</p></body></html>';
const cases:PrototypeAcceptanceCase[]=[{id:'code-readonly',title:'客户编号保持只读',steps:[{action:'assert',assertion:'readonly',selector:'#code',expected:true}]}];
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jF3sAAAAASUVORK5CYII=','base64');
// Explicitly mocked DOM adapter: this is Service/Store/Files/schema control-flow
// evidence, never real-browser or real-model acceptance.
const runner:PrototypeRunner=async input=>{await input.assertCurrent?.();return{status:'passed',cases:input.cases.map(c=>({caseId:c.id,status:'passed',steps:c.steps.map((step,stepIndex)=>({stepIndex,status:'passed',observed:step.action==='assert'?(step.assertion==='readonly'?input.snapshot.get(input.entryPath)!.bytes.toString('utf8').includes(' readonly'):true):undefined}))})),screenshots:input.cases.map(c=>({caseId:c.id,bytes:png})),notice:'测试模拟浏览器适配器，仅复现宿主流程'};};
async function finished(service:Service,id:string){for(let n=0;n<500;n++){const run=service.state.runs.find(r=>r.id===id)!;if(run.finishedAt&&!['running','validating','repairing','queued','cancelling'].includes(run.status))return run;await new Promise(r=>setTimeout(r,10));}throw Error('fixture did not finish');}

for(const form of ['single','batch','required'] as const)test('真实Service首操作编辑已验证HTML冻结旧基线且不泄漏编辑参数：'+form,async t=>{
 const fixture=await fs.mkdtemp(path.join(os.tmpdir(),'slash-first-edit-'+form+'-')),store=new Store(path.join(fixture,'profile'));let round=0,target!:{mountId:string;path:string},beforeBaseline=-1,attempts=0,firstChangeId='',frozenBaseline:unknown;
 const service=new Service(store,()=> 'fixture-key',()=>{},async(options:RuntimeOptions)=>({messages:[{role:'assistant',stopReason:'stop'}],abort:async()=>{},dispose:()=>{},prompt:async()=>{
  if(++round===1){await options.log('write_draft',target,async()=>{await options.beforeArtifactWrite!(target);const change=await options.files.draft(target.mountId,target.path,original,options.runId);options.draft(change);});const view=(await options.getTaskAcceptance!())!;await options.log('define_task_acceptance',{},()=>options.defineTaskAcceptance!({criteria:[{id:'keep-code-readonly',text:'客户编号保持只读',requestIds:[view.contract.requests[0].id],outputIds:[view.contract.outputs[0].id],origin:'user_request',required:true,checker:{kind:'prototype_cases',cases}}]}));}
  else{
   assert.equal(round,2);beforeBaseline=(await options.getTaskAcceptance!())!.contract.baseline.length;assert.equal(beforeBaseline,0,'first edit must not be preceded by write_draft or baseline registration');
   const read=await options.log('read_draft',target,()=>options.readDraft!(target));assert.equal(read.source,'applied');assert.equal(read.changeId,undefined);
   const replacement={oldText:'<p id="note">保留原字段。</p>',newText:'<p id="note">保留原字段，增加备注说明。</p>'},input={...target,expectedContentHash:read.contentHash,...(form!=='batch'?replacement:{edits:[replacement]})};
   attempts++;const edited=await options.log('edit_draft',input,()=>options.editDraft!(input));firstChangeId=edited.changeId;assert.equal(edited.baseHash,hash(original));
   const afterFirst=(await options.getTaskAcceptance!())!;assert.equal(afterFirst.contract.baseline.length,1);assert.equal(afterFirst.contract.baseline[0].origin,form==='required'?'user_confirmed':'previous_verified');assert.deepEqual(afterFirst.contract.baseline[0].cases,cases);assert.equal(afterFirst.contract.baseline[0].target.source,'applied');assert.equal(afterFirst.contract.baseline[0].target.contentHash,hash(original));frozenBaseline=structuredClone(afterFirst.contract.baseline);
   await assert.rejects(options.defineTaskAcceptance!({baseline:[]} as any),/Unrecognized|unrecognized|Invalid|invalid/);
   const pending=await options.readDraft!(target);assert.equal(pending.source,'pending');assert.equal(pending.changeId,firstChangeId);assert.match(pending.content,/增加备注说明/);
   await assert.rejects(options.log('edit_draft',input,()=>options.editDraft!({...input,changeId:firstChangeId})),/VERSION_CONFLICT/);
   const second=await options.log('edit_draft',target,()=>options.editDraft!({...target,changeId:firstChangeId,expectedContentHash:pending.contentHash,oldText:'增加备注说明。',newText:'增加备注说明，并保留只读规则。'}));assert.equal(second.changeId,firstChangeId);assert.deepEqual((await options.getTaskAcceptance!())!.contract.baseline,frozenBaseline);
   const output=(await options.getTaskAcceptance!())!.contract.outputs[0];assert.equal(output.target.source,'draft');assert.deepEqual(Object.keys(output.target).sort(),['source','mountId','path','changeId','baseHash','contentHash'].sort());
   assert.deepEqual(Object.keys(afterFirst.contract.baseline[0].target).sort(),['source','mountId','path','contentHash'].sort());
  }options.delta('隔离流程测试。');
 }} as unknown as Runtime),{runPrototypeAcceptance:runner,fetchModelMetadata:async()=>{throw Error('OFFLINE_FIXTURE_NO_NETWORK');}});
 t.after(async()=>{service.dispose();await Promise.allSettled([...(service as any).agentIndex.queues.values()]);await new Promise(r=>setTimeout(r,30));store.close();const relative=path.relative(path.resolve(os.tmpdir()),path.resolve(fixture));assert.ok(relative&&!relative.startsWith('..'+path.sep)&&relative!=='..'&&!path.isAbsolute(relative));await fs.rm(fixture,{recursive:true,force:true,maxRetries:5,retryDelay:30});});
 await service.workspace(path.join(fixture,'project'));service.setPermission('workspace_read','allow');service.setPermission('artifact_write','allow');target={mountId:service.state.mounts.find(m=>m.name==='成果')!.id,path:'prototype/index.html'};const conversation=service.conversation();
 const first=await service.send(conversation,'建立客户资料页面，客户编号保持只读。','build','standard'),firstRun=await finished(service,first);assert.equal(firstRun.acceptance!.status,'passed');await service.apply(service.state.changes.find(c=>c.runId===first)!.id);const before=hash(await fs.readFile(path.join(service.state.mounts.find(m=>m.id===target.mountId)!.path,target.path),'utf8'));
 if(form==='required'){const savedSpec=await service.savePrototypeAcceptance({...target,title:'用户必检只读字段',cases},'build');const required=await service.setPrototypeAcceptanceRequired({...target,mode:'build',required:true,expectedRevision:savedSpec.spec!.revision,expectedSpecHash:savedSpec.spec!.specHash});assert.equal(required.spec!.required,true);}
 const second=await service.send(conversation,'增加备注说明并保留客户编号只读。','build','standard'),secondRun=await finished(service,second);assert.equal(secondRun.status,'succeeded',secondRun.error);assert.equal(attempts,1);
 const newChanges=service.state.changes.filter(c=>c.runId===second),after=hash(await fs.readFile(path.join(service.state.mounts.find(m=>m.id===target.mountId)!.path,target.path),'utf8'));assert.equal(newChanges.length,1);assert.equal(newChanges[0].id,firstChangeId);assert.equal(newChanges[0].status,'pending');assert.equal(newChanges[0].before,before);assert.equal(after,before);assert.equal(after,hash(original));assert.match(newChanges[0].content,/增加备注说明，并保留只读规则/);assert.match(newChanges[0].content,/readonly/);
 const current=(await service.getTaskAcceptance(second))!;assert.deepEqual(current.contract.baseline,frozenBaseline);assert.equal(current.contract.outputs.length,1);assert.equal(current.latestReport!.versionState,'current');assert.equal(current.latestReport!.regression.length,1);assert.equal(current.latestReport!.regression[0].status,'passed');assert.deepEqual(current.latestReport!.regression[0].evidence[0].prototype!.caseDefinitions,cases);assert.equal(secondRun.acceptance!.repairRounds,0,'valid first edit needs no model workaround or repair retry');

});
