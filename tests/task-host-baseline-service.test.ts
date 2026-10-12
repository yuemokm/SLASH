import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {Service} from '../main/service.js';
import {Store} from '../main/store.js';
import {QualityReportRepository} from '../main/quality-history.js';
import type {PrototypeRunner,PrototypeRunnerInput} from '../main/prototype-acceptance.js';
import type {PrototypeAcceptanceCase} from '../shared/prototype-acceptance.js';
import {requestSchema} from '../shared/types.js';

const html='<!doctype html><html><head><title>合成回归</title></head><body><form><label>名称<input value="合成"></label><button type="submit">保存</button></form><div id="content">原行为</div></body></html>';
const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jF3sAAAAASUVORK5CYII=','base64');
const baseline:PrototypeAcceptanceCase[]=Array.from({length:9},(_,i)=>({id:'frozen:'+i,title:'原用例'+i,steps:[{action:'assert',assertion:'visible',selector:'#content',expected:true}]}));
async function fixture(t:test.TestContext){
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'slash-host-nine-')),profile=path.join(dir,'profile');let store=new Store(profile),service:Service;const executed:PrototypeAcceptanceCase[][]=[];let failFrozen=false,runnerVersion='electron-snapshot-cdp-v5',expectedRunnerVersion:string|undefined,hook:(input:PrototypeRunnerInput)=>Promise<void>=async()=>{};
 const runner:PrototypeRunner=async input=>{input.assertCurrent?.();await hook(input);const cases=input.cases.map(c=>{const failed=failFrozen&&c.id==='frozen:0';return{caseId:c.id,status:failed?'failed' as const:'passed' as const,steps:c.steps.map((_,stepIndex)=>({stepIndex,status:failed?'failed' as const:'passed' as const,observed:!failed}))};});executed.push(structuredClone(input.cases));return{runnerVersion,status:cases.every(c=>c.status==='passed')?'passed':'failed',cases,screenshots:input.cases.map(c=>({caseId:c.id,bytes:png})),notice:'合成流程适配器；不代表真实浏览器'};};
 const make=()=>new Service(store,()=>{throw Error('NO_CLOUD');},()=>{},undefined,{runPrototypeAcceptance:runner,expectedPrototypeRunnerVersion:expectedRunnerVersion});service=make();await service.workspace(path.join(dir,'project'));service.setPermission('workspace_read','allow');service.setPermission('artifact_write','allow');
 const mount=service.state.mounts.find(m=>m.name==='成果')!,target={mountId:mount.id,path:'原型/合成/index.html'};await fs.mkdir(path.dirname(path.join(mount.path,target.path)),{recursive:true});await fs.writeFile(path.join(mount.path,target.path),html);
 let view=await service.savePrototypeAcceptance({...target,title:'冻结9项',cases:baseline},'build');view=await service.setPrototypeAcceptanceRequired({...target,mode:'build',required:true,expectedRevision:view.spec!.revision,expectedSpecHash:view.spec!.specHash});
 const run={id:randomUUID(),conversationId:service.conversation(),status:'running',mode:'build' as const,phase:'generating' as const,input:'手机端增加说明，保留原有9项交互。',startedAt:new Date().toISOString()};service.state.runs.push(run);(service as any).beginTaskAcceptance(run);await(service as any).beforeTaskArtifactWrite(run.id,target);
 const change=await service.files.draft(target.mountId,target.path,html.replace('原行为','原行为与新说明'),run.id);(service as any).registerTaskChange(run.id,change);service.state.changes.unshift(change);service.save();
 t.after(async()=>{service.dispose();await Promise.allSettled([...(service as any).agentIndex.queues.values()]);store.close();await fs.rm(dir,{recursive:true,force:true,maxRetries:5,retryDelay:30});});
 return{get service(){return service;},get store(){return store;},run,target,change,executed,runner,confirmed:view.spec!,setFail:()=>{failFrozen=true;},setHook:(fn:typeof hook)=>{hook=fn;},setRunnerVersion:(v:string)=>{runnerVersion=v;},domain:()=>(service as any).taskDomain(run.id),prototypes:()=>(service as any).prototypes(),async reopen(expected?:string){expectedRunnerVersion=expected;service.save();service.dispose();await Promise.allSettled([...(service as any).agentIndex.queues.values()]);store.close();store=new Store(profile);service=make();}};
}

test('真实Service固定host3与冻结9独立执行、分别持久化；普通调用仍合并且不能弱化',async t=>{
 const f=await fixture(t),original=f.domain().getContract(f.run.id),host=original.criteria.find((c:any)=>c.id.startsWith('host:render:'))!;assert.equal(host.checker.cases.length,3);assert.deepEqual(original.baseline[0].cases,baseline);
 const report=await f.service.checkTaskAcceptance(f.run.id);assert.equal(report.automaticStatus,'passed');assert.equal(report.versionState,'current');assert.deepEqual(f.executed.map(c=>c.length),[3,9]);
 const rendered=report.results.find(r=>r.criterionId===host.id)!;assert.equal(rendered.status,'passed');assert.equal(rendered.evidence[0].prototype!.caseOrigin,'host_task_check');assert.equal(rendered.evidence[0].prototype!.cases.length,3);assert.equal(report.regression[0].status,'passed');assert.deepEqual(report.regression[0].evidence[0].prototype!.caseDefinitions,baseline);
 const partialId=rendered.evidence[0].reportId!,fullId=report.regression[0].evidence[0].reportId!;const partial=await f.prototypes().report(partialId);assert.equal(partial.versionState,'current');assert.equal(new QualityReportRepository(f.store,report.workspaceId).get(partialId)!.gate!.allowed,false);
 const draft=f.prototypes().report(fullId).then((r:any)=>({mountId:f.target.mountId,path:f.target.path,draft:r.evidence.draft}));assert.equal((await f.service.getPrototypeAcceptance(await draft)).latestReport!.reportId,fullId);
 await assert.rejects(f.prototypes().runCases(await draft,host.checker.cases,{mode:'build',runId:f.run.id}),/Too big|too_big|<=10|at most/);
 const forged={...host,checker:{kind:'prototype_cases',cases:[...host.checker.cases.slice(0,2),{...host.checker.cases[2],title:'伪造宿主规则'}]}};await assert.rejects((f.service as any).checkTaskCriterion({contract:original,criterion:forged,output:original.outputs[0],content:f.change.content,dependencies:[]}),/Too big|too_big|<=10|at most/);
 assert.equal(requestSchema.safeParse({...await draft,type:'prototypeAcceptanceRun',mode:'build',hostIndependent:true}).success,false);
 await f.reopen();const reopened=await f.service.getTaskAcceptance(f.run.id);assert.equal(reopened!.latestReport!.automaticStatus,'passed');assert.equal(reopened!.latestReport!.versionState,'current');assert.equal((await f.prototypes().report(partialId)).evidence.caseOrigin,'host_task_check');assert.equal((await f.prototypes().report(partialId)).versionState,'current');assert.equal(f.executed.length,2,'重开只核验证据不重放检查');assert.equal((await f.service.getPrototypeAcceptance(await draft)).latestReport!.reportId,fullId);
});

test('host3通过不能放行required9；冻结9失败仍进入任务失败与正式门禁',async t=>{
 const f=await fixture(t),contract=f.domain().getContract(f.run.id),host=contract.criteria.find((c:any)=>c.id.startsWith('host:render:'))!,output=contract.outputs[0];
 const onlyHost=await(f.service as any).checkTaskCriterion({contract,criterion:host,output,content:f.change.content,dependencies:[]});assert.equal(onlyHost.status,'passed');const target={...f.target,draft:onlyHost.evidence[0].prototype.draft};assert.equal((await f.service.getPrototypeAcceptance(target)).latestReport,undefined);await assert.rejects(f.service.assertPrototypeAcceptanceDelivery(f.target.mountId,f.target.path),/PROTOTYPE_ACCEPTANCE_REQUIRED/);assert.equal((await f.service.getPrototypeAcceptance(f.target)).spec!.cases.length,9);
 f.setFail();const report=await f.service.checkTaskAcceptance(f.run.id);assert.equal(report.automaticStatus,'failed');assert.equal(report.results.find(r=>r.criterionId===host.id)!.status,'passed');assert.equal(report.regression[0].status,'failed');assert.equal(report.regression[0].evidence[0].prototype!.cases.length,9);assert.equal(report.regression[0].evidence[0].prototype!.cases[0].status,'failed');await assert.rejects(f.service.assertPrototypeAcceptanceDelivery(f.target.mountId,f.target.path),/PROTOTYPE_ACCEPTANCE_REQUIRED/);
 assert.equal(await f.service.files.read(f.target.mountId,f.target.path),html,'原件与冻结规格未改写');
});

test('缺失/变更冻结proof拒绝独立通路，取消/撤权/版本变化不报当前通过',async t=>{
 const f=await fixture(t),contract=f.domain().getContract(f.run.id),host=contract.criteria.find((c:any)=>c.id.startsWith('host:render:'))!,b=contract.baseline[0],target=(f.service as any).taskPrototypeTarget(f.run.id,contract.outputs[0].target),ctx={mode:'build' as const,runId:f.run.id};const proof={specId:b.specId,specRevision:b.specRevision,specHash:b.specHash,mountId:b.target.mountId,path:b.target.path,cases:b.cases};
 for(const wrong of [{...proof,specHash:'f'.repeat(64)},{...proof,cases:baseline.slice(0,8)}])await assert.rejects(f.prototypes().runTaskHostCases(target,host.checker.cases,ctx,wrong),/BASELINE_MISMATCH/);
 const abort=new AbortController();abort.abort();await assert.rejects(f.prototypes().runTaskHostCases(target,host.checker.cases,{...ctx,signal:abort.signal},proof),/CANCELLED/);assert.equal(f.executed.length,0);
 f.setHook(async()=>{f.change.content+='<!-- changed while browser runs -->';});const changed=await f.prototypes().runTaskHostCases(target,host.checker.cases,ctx,proof);assert.notEqual(changed.versionState,'current');f.change.content=f.change.content.replace('<!-- changed while browser runs -->','');
 f.setHook(async()=>{f.service.setPermission('workspace_read','deny');});await assert.rejects(f.prototypes().runTaskHostCases(target,host.checker.cases,ctx,proof),/PERMISSION_DENIED/);
});

test('声明新runner版本后旧v5通过证据仅标陈旧并保留；任务/交付门禁重验v6后恢复',async t=>{
 const f=await fixture(t),oldTask=await f.service.checkTaskAcceptance(f.run.id),saved=await f.service.runPrototypeAcceptance({...f.target,mode:'build'},'build');assert.equal(oldTask.automaticStatus,'passed');assert.equal(saved.latestReport!.versionState,'current');const oldId=saved.latestReport!.reportId,oldEvidence=structuredClone(saved.latestReport!.evidence),before=f.executed.length;
 await f.reopen('electron-snapshot-cdp-v6');assert.equal(f.executed.length,before,'读取重开不重放浏览器');const old=await f.service.getPrototypeAcceptance(f.target);assert.equal(old.latestReport!.versionState,'stale');assert.match(old.latestReport!.versionReasons.join('；'),/检查器版本已变化.*重新检查/);assert.equal(old.latestReport!.evidence.status,'passed','历史观察不改写');assert.equal(old.latestReport!.evidence.runnerVersion,'electron-snapshot-cdp-v5');
 const task=(await f.service.getTaskAcceptance(f.run.id))!.latestReport!;assert.equal(task.versionState,'stale');assert.notEqual(task.status,'passed');assert.equal(task.automaticStatus,'passed','旧自动结果保留历史，但陈旧绑定不能放行');await assert.rejects(f.service.assertPrototypeAcceptanceDelivery(f.target.mountId,f.target.path),/PROTOTYPE_ACCEPTANCE_REQUIRED/);await assert.rejects(f.service.preparePrototypeAcceptanceExport(f.target.mountId,f.target.path),/PROTOTYPE_ACCEPTANCE_REQUIRED/);assert.equal(f.executed.length,before);
 const second={...f.run,id:randomUUID(),input:'追加说明，保留已确认9项。'};f.service.state.runs.push(second);(f.service as any).beginTaskAcceptance(second);await(f.service as any).beforeTaskArtifactWrite(second.id,f.target);assert.deepEqual((f.service as any).taskDomain(second.id).getContract(second.id).baseline[0].cases,baseline,'before-write仍冻结全部用户确认9项，不因陈旧观察删除');
 f.setRunnerVersion('electron-snapshot-cdp-v6');const rechecked=await f.service.checkTaskAcceptance(f.run.id);assert.equal(rechecked.versionState,'current');assert.equal(rechecked.automaticStatus,'passed');const current=await f.service.runPrototypeAcceptance({...f.target,mode:'build'},'build');assert.equal(current.latestReport!.versionState,'current');await f.service.assertPrototypeAcceptanceDelivery(f.target.mountId,f.target.path);
 const raw=new QualityReportRepository(f.store,oldTask.workspaceId).get(oldId)!.report.details!.prototypeAcceptance!;assert.deepEqual(raw,oldEvidence,'旧存储证据和截图版本不改写');
});

test('正式main构造Service时传递同一真实浏览器版本常量，非仅测试适配器声明',async()=>{
 // Electron's production entry cannot be imported into the Node test process.
 // Combine this bounded source wiring check with the service integration above
 // and the project's main-process type check; do not claim an app launch here.
 const source=await fs.readFile(new URL('../main/main.ts',import.meta.url),'utf8');assert.match(source,/import\s*\{[^}]*PROTOTYPE_BROWSER_VERSION[^}]*\}\s*from '\.\/prototype-browser\.js'/);
 const start=source.indexOf('new Service(');assert(start>=0);const end=source.indexOf('expectedPrototypeRunnerVersion:PROTOTYPE_BROWSER_VERSION',start);assert(end>start);assert.match(source.slice(start,end+61),/runPrototypeAcceptance,\s*expectedPrototypeRunnerVersion:PROTOTYPE_BROWSER_VERSION/);
});

test('before-write不会把过期v5非必检通过报告继承为previous_verified基线',async t=>{
 const f=await fixture(t);await f.service.runPrototypeAcceptance({...f.target,mode:'build'},'build');const view=await f.service.getPrototypeAcceptance(f.target);await f.service.setPrototypeAcceptanceRequired({...f.target,mode:'build',required:false,expectedRevision:view.spec!.revision,expectedSpecHash:view.spec!.specHash});await f.reopen('electron-snapshot-cdp-v6');
 const next={...f.run,id:randomUUID(),input:'修改合成页面说明。'};f.service.state.runs.push(next);(f.service as any).beginTaskAcceptance(next);const before=f.executed.length;await(f.service as any).beforeTaskArtifactWrite(next.id,f.target);assert.equal((f.service as any).taskDomain(next.id).getContract(next.id).baseline.length,0);assert.equal(f.executed.length,before);assert.equal((await f.service.getPrototypeAcceptance(f.target)).latestReport!.versionState,'stale');
});
