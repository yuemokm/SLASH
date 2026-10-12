import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import ExcelJS from 'exceljs';
import {Service} from '../main/service.js';
import {Store} from '../main/store.js';
import {hash} from '../main/files.js';
import {testCaseSourceId} from '../main/test-cases.js';
import {parseTestCaseSuite} from '../shared/test-cases.js';
import type {RuntimeOptions,RuntimeHandle} from '../main/agent.js';
import {proposal} from './test-case-fixture.js';
import {reviewFixtureDelivery} from './task-delivery-review-fixture.js';

async function terminal(service:Service,id:string){for(let n=0;n<500;n++){const run=service.state.runs.find(r=>r.id===id)!;if(run.finishedAt)return run;await new Promise(r=>setTimeout(r,10));}throw Error('local fixture timeout');}
async function fixture(t:test.TestContext,prompt:(o:RuntimeOptions)=>Promise<void>,sourceText='# 审批规则\n\n退回必须填写原因。'){
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'slash-test-cases-')),store=new Store(path.join(dir,'profile'));
 const service=new Service(store,()=> 'local-fixture-key',()=>{},async o=>({messages:[{role:'assistant',stopReason:'stop'}],abort:async()=>{},dispose:()=>{},prompt:async()=>{await prompt(o);o.delta('用例已生成，尚未执行。');}} as unknown as RuntimeHandle));
 await service.workspace(path.join(dir,'project'));service.setPermission('workspace_read','allow');service.setPermission('artifact_write','allow');
 t.after(async()=>{service.dispose();await Promise.allSettled([...(service as any).agentIndex.queues.values()]);await new Promise(r=>setTimeout(r,20));store.close();await fs.rm(dir,{recursive:true,force:true,maxRetries:5,retryDelay:30});});
 const resource=service.state.mounts.find(m=>m.name==='资源')!,output=service.state.mounts.find(m=>m.name==='成果')!,source={mountId:resource.id,path:'参考资料/审批规则.md'};
 await fs.writeFile(path.join(resource.path,source.path),sourceText);
 return {dir,store,service,resource,output,source,start:(mode:'build'|'plan'='build')=>service.send(service.conversation(),'根据引用资料创建测试用例',mode,'standard',undefined,undefined,undefined,'writing',undefined,{kind:'test_cases',sources:[source]})};
}
test('formal Service workflow binds real reads, produces pending readable manual cases, exports data and saves a version',async t=>{
 let f!:Awaited<ReturnType<typeof fixture>>,receipt:any;
 f=await fixture(t,async o=>{const read=f.service.state.runs.find(r=>r.id===o.runId)!.sourceReads![0],input={...proposal(testCaseSourceId(read)),mountId:f.output.id};receipt=await o.log('draft_test_cases',input,()=>o.draftTestCases!(input));});
 const run=await terminal(f.service,await f.start());assert.equal(run.status,'succeeded',run.error);assert.equal(run.workflow!.receipts[0].contentHash,hash(await fs.readFile(path.join(f.resource.path,f.source.path),'utf8')));
 const change=f.service.state.changes.find(c=>c.id===receipt.changeId)!;assert.equal(change.status,'pending');await assert.rejects(fs.stat(path.join(f.output.path,change.path)),/ENOENT/);
 const suite=parseTestCaseSuite(change.content);assert.equal(suite.executionStatus,'not_run');assert.equal(suite.sourceSnapshots[0].runId,run.id);assert.equal((await f.service.getTaskAcceptance(run.id))!.contract.scope,'deliverable');
 const input={mountId:f.output.id,path:change.path,changeId:change.id,expectedContentHash:hash(change.content)};
 await assert.rejects(f.service.exportTestCases(input,{mountId:f.output.id,path:'未核对.xlsx'},'test_cases_xlsx'),/TASK_DELIVERY_BLOCKED/);await assert.rejects(fs.stat(path.join(f.output.path,'未核对.xlsx')),/ENOENT/);
 await reviewFixtureDelivery(f.service,run.id);
 await f.service.exportTestCases(input,{mountId:f.output.id,path:'人工验收.xlsx'},'test_cases_xlsx');
 const book=new ExcelJS.Workbook();await book.xlsx.readFile(path.join(f.output.path,'人工验收.xlsx'));assert.equal(book.worksheets[0].rowCount,2);assert.equal(book.worksheets[0].getCell('M2').value,'未执行');
 await f.service.exportTestCases(input,{mountId:f.output.id,path:'人工验收.md'},'test_cases_markdown');assert.match(await fs.readFile(path.join(f.output.path,'人工验收.md'),'utf8'),/阻止退回/);
 await f.service.apply(change.id);assert.equal(change.status,'applied');assert.equal(await fs.readFile(path.join(f.output.path,change.path),'utf8'),change.content);
 await reviewFixtureDelivery(f.service,run.id);
 await assert.rejects(f.service.exportTestCases({mountId:change.mountId,path:change.path},{mountId:change.mountId,path:change.path},'copy'),/OVERWRITE_SOURCE/);
 f.service.state.mounts.push({...f.output,id:'same-output-alias'});
 await reviewFixtureDelivery(f.service,run.id);
 await assert.rejects(f.service.exportTestCases({mountId:change.mountId,path:change.path},{mountId:'same-output-alias',path:change.path},'copy'),/OVERWRITE_SOURCE/);
 if(process.platform==='win32')await assert.rejects(f.service.exportTestCases({mountId:change.mountId,path:change.path},{mountId:change.mountId,path:change.path.toUpperCase()},'copy'),/OVERWRITE_SOURCE/);
 await assert.rejects(f.service.exportTestCases({mountId:change.mountId,path:change.path,expectedContentHash:'0'.repeat(64)},{mountId:f.output.id,path:'outdated.md'},'test_cases_markdown'),/VERSION_CONFLICT/);
 await assert.rejects(f.service.exportTestCases({mountId:change.mountId,path:change.path},{mountId:f.resource.id,path:'参考资料/forbidden.xlsx'},'test_cases_xlsx'),/REFERENCE_READ_ONLY/);
 f.service.setPermission('artifact_write','deny');await assert.rejects(f.service.exportTestCases({mountId:change.mountId,path:change.path},{mountId:f.output.id,path:'denied.xlsx'},'test_cases_xlsx'),/PERMISSION_DENIED/);
 assert.equal(parseTestCaseSuite(change.content).executionStatus,'not_run');assert(f.store.operationsForRun('manual-test-case-export').some(o=>o.state==='succeeded'));
});
test('Plan, fake sources, changed source and revoked permission never create/save/export a valid-looking case file',async t=>{
 let f!:Awaited<ReturnType<typeof fixture>>;
 f=await fixture(t,async o=>{const read=f.service.state.runs.find(r=>r.id===o.runId)!.sourceReads![0],input={...proposal(testCaseSourceId(read)),mountId:f.output.id};
  if(o.mode==='plan'){await assert.rejects(o.log('draft_test_cases',input,()=>o.draftTestCases!(input)),/PLAN_TOOL_DENIED/);await assert.rejects(f.service.draftTestCases(o.runId,input),/PLAN_TOOL_DENIED/);return;}
  await assert.rejects(o.log('draft_test_cases',{},()=>o.draftTestCases!({...input,cases:[{...input.cases[0],sourceIds:['fake']}]})),/SOURCE_UNKNOWN/);
  await o.log('draft_test_cases',input,()=>o.draftTestCases!(input));
 });
 assert.equal((await terminal(f.service,await f.start('plan'))).status,'awaiting_plan');assert.equal(f.service.state.changes.length,0);
 const run=await terminal(f.service,await f.start());const c=f.service.state.changes[0],input={mountId:c.mountId,path:c.path,changeId:c.id};await reviewFixtureDelivery(f.service,run.id);
 await fs.appendFile(path.join(f.resource.path,f.source.path),'规则已变');await assert.rejects(f.service.apply(c.id),/SOURCE_CHANGED/);assert.equal(c.status,'pending');
 await assert.rejects(f.service.exportTestCases(input,{mountId:f.output.id,path:'blocked.xlsx'},'test_cases_xlsx'),/SOURCE_CHANGED|TASK_DELIVERY_BLOCKED:.*来源版本已变化/);await assert.rejects(fs.stat(path.join(f.output.path,'blocked.xlsx')),/ENOENT/);
 f.service.setPermission('workspace_read','deny');await assert.rejects(f.service.exportTestCases(input,{mountId:f.output.id,path:'denied.md'},'test_cases_markdown'),/PERMISSION_DENIED/);
});
test('ordinary edits validate schema and host provenance before commit; conflict preserves the draft',async t=>{
 let f!:Awaited<ReturnType<typeof fixture>>,edited=false;
 f=await fixture(t,async o=>{const read=f.service.state.runs.find(r=>r.id===o.runId)!.sourceReads![0],input={...proposal(testCaseSourceId(read)),mountId:f.output.id};await o.log('draft_test_cases',input,()=>o.draftTestCases!(input));const draft=await o.readDraft!({mountId:f.output.id,path:input.path});
  await assert.rejects(o.log('edit_draft',{},()=>o.editDraft!({mountId:f.output.id,path:input.path,changeId:draft.changeId,expectedContentHash:draft.contentHash,oldText:'"not_run"',newText:'"passed"'})),/TEST_CASE_INVALID/);
  assert.equal(f.service.state.changes[0].content.includes('"passed"'),false);
  await o.log('edit_draft',{},()=>o.editDraft!({mountId:f.output.id,path:input.path,changeId:draft.changeId,expectedContentHash:draft.contentHash,oldText:'"退回缺少原因"',newText:'"退回原因必填检查"'}));edited=true;
 });
 const run=await terminal(f.service,await f.start());assert.equal(run.status,'succeeded',run.error);assert(edited);assert.equal(f.service.state.changes.length,1);const c=f.service.state.changes[0];assert.equal(parseTestCaseSuite(c.content).cases[0].title,'退回原因必填检查');
 await fs.writeFile(path.join(f.output.path,c.path),'external file');await assert.rejects(f.service.apply(c.id),/VERSION_CONFLICT/);assert.equal(c.status,'conflict');assert.equal(await fs.readFile(path.join(f.output.path,c.path),'utf8'),'external file');
});
test('same-version re-read retains immutable original host receipt through edit/save/export and restart',async t=>{
 let f!:Awaited<ReturnType<typeof fixture>>,originalReadAt='';
 f=await fixture(t,async o=>{
  const run=f.service.state.runs.find(r=>r.id===o.runId)!,first=structuredClone(run.sourceReads![0]);originalReadAt=first.readAt;
  const input={...proposal(testCaseSourceId(first)),mountId:f.output.id};await o.log('draft_test_cases',input,()=>o.draftTestCases!(input));
  // Reproduce the host sourceRead callback after another actual read of identical bytes.
  assert.equal(hash(await o.files.read(first.mountId,first.path)),first.contentHash);
  await o.sourceRead!({...first,readAt:new Date(Date.parse(first.readAt)+1000).toISOString()});assert.notEqual(run.sourceReads![0].readAt,first.readAt);
  const draft=await o.readDraft!({mountId:f.output.id,path:input.path});
  await o.log('edit_draft',{},()=>o.editDraft!({mountId:f.output.id,path:input.path,changeId:draft.changeId,expectedContentHash:draft.contentHash,oldText:'"退回缺少原因"',newText:'"同版重读后更新标题"'}));
 });
 const run=await terminal(f.service,await f.start());assert.equal(run.status,'succeeded',run.error);const c=f.service.state.changes[0];assert.equal(parseTestCaseSuite(c.content).sourceSnapshots[0].readAt,originalReadAt);
 await f.service.apply(c.id);await reviewFixtureDelivery(f.service,run.id);await f.service.exportTestCases({mountId:c.mountId,path:c.path},{mountId:f.output.id,path:'重读后导出.md'},'test_cases_markdown');
 // Re-open from persisted state; the old read must still be proved by frozen task sources.
 const reloaded=new Service(f.store,()=>{throw Error('NO_CLOUD');},()=>{});try{await reloaded.exportTestCases({mountId:c.mountId,path:c.path},{mountId:f.output.id,path:'重启后导出.md'},'test_cases_markdown');}finally{reloaded.dispose();await Promise.allSettled([...(reloaded as any).agentIndex.queues.values()]);}
});

test('one Run generates multiple suites after same-version reread and wider located read, with immutable proofs after restart',async t=>{
 let f!:Awaited<ReturnType<typeof fixture>>;const snapshots:any[]=[];
 f=await fixture(t,async o=>{
  const run=f.service.state.runs.find(r=>r.id===o.runId)!,first=structuredClone(run.sourceReads![0]);assert(first.truncated);
  const generate=async(filename:string)=>{const input={...proposal(testCaseSourceId(first)),mountId:f.output.id,path:filename};await o.log('draft_test_cases',input,()=>o.draftTestCases!(input));snapshots.push(parseTestCaseSuite(f.service.state.changes[0].content).sourceSnapshots[0]);};
  await generate('第一套.testcases.json');
  const text=await o.files.read(first.mountId,first.path);assert.equal(hash(text),first.contentHash);
  const reread={...first,readAt:new Date(Date.parse(first.readAt)+1000).toISOString()};await o.sourceRead!(reread);await generate('第二套.testcases.json');
  const wider={...first,readAt:new Date(Date.parse(first.readAt)+2000).toISOString(),includedCharacters:text.length,truncated:false,locator:'characters:0-'+text.length};await o.sourceRead!(wider);await generate('第三套.testcases.json');
  assert.equal(snapshots[1].readAt,reread.readAt);assert.equal(snapshots[2].locator,wider.locator);assert.equal(snapshots[2].includedCharacters,text.length);
  const contract=(await f.service.getTaskAcceptance(run.id))!.contract;assert.equal(contract.prd.sources.length,1);assert.equal(contract.prd.sources[0].readAt,first.readAt);
  // Evict current reads to prove retention is durable rather than an accidental mutable-list match.
  run.sourceReads=[];(f.service as any).save();
 },'# 审批规则\n\n退回必须填写原因。\n'+'正文规则。'.repeat(8000));
 const run=await terminal(f.service,await f.start());assert.equal(run.status,'succeeded',run.error);assert.equal(f.service.state.changes.length,3);
 const reloaded=new Service(f.store,()=>{throw Error('NO_CLOUD');},()=>{});try{
  for(const c of reloaded.state.changes){await reviewFixtureDelivery(reloaded,run.id);await reloaded.exportTestCases({mountId:c.mountId,path:c.path,changeId:c.id},{mountId:f.output.id,path:c.id+'.md'},'test_cases_markdown');await reloaded.apply(c.id);}
  const c=reloaded.state.changes[0],forged=JSON.parse(c.content);forged.sourceSnapshots[0].readAt='2020-01-01T00:00:00.000Z';await assert.rejects(reloaded.validateTestCaseDraft({...c,content:JSON.stringify(forged)}),/SOURCE_UNVERIFIED/);
 }finally{reloaded.dispose();await Promise.allSettled([...(reloaded as any).agentIndex.queues.values()]);}
});

test('exports cannot overwrite a writable PRD source, including mount aliases and Windows case variants',async t=>{
 let f!:Awaited<ReturnType<typeof fixture>>;
 f=await fixture(t,async o=>{const read=f.service.state.runs.find(r=>r.id===o.runId)!.sourceReads![0],input={...proposal(testCaseSourceId(read)),mountId:f.output.id};await o.log('draft_test_cases',input,()=>o.draftTestCases!(input));});
 const text=await fs.readFile(path.join(f.resource.path,f.source.path),'utf8');f.source.mountId=f.output.id;f.source.path='已有PRD.md';await fs.writeFile(path.join(f.output.path,f.source.path),text);
 const run=await terminal(f.service,await f.start());assert.equal(run.status,'succeeded',run.error);const c=f.service.state.changes[0],input={mountId:c.mountId,path:c.path,changeId:c.id};
 f.service.state.mounts.push({...f.output,id:'source-output-alias'});
 await reviewFixtureDelivery(f.service,run.id);
 for(const mountId of [f.output.id,'source-output-alias'])await assert.rejects(f.service.exportTestCases(input,{mountId,path:f.source.path},'test_cases_markdown'),/OVERWRITE_SOURCE/);
 if(process.platform==='win32')await assert.rejects(f.service.exportTestCases(input,{mountId:f.output.id,path:f.source.path.toUpperCase()},'test_cases_markdown'),/OVERWRITE_SOURCE/);
 assert.equal(await fs.readFile(path.join(f.output.path,f.source.path),'utf8'),text);
});
