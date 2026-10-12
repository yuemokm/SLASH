import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import mammoth from 'mammoth';
import {Service} from '../main/service.js';
import {Store} from '../main/store.js';
import type {RuntimeOptions,RuntimeHandle} from '../main/agent.js';
import type {PmWorkflow} from '../shared/types.js';
import {taskAcceptanceProposalSchema} from '../shared/task-acceptance.js';

const hash=(value:string|Buffer)=>createHash('sha256').update(value).digest('hex');
const template='# 模板\n\n# 1. 功能需求\n\n## 1.1 详细说明\n\n|字段名称|类型|默认值|校验规则|\n|---|---|---|---|\n|名称|文本|无|不能为空|\n\n# 2. 集成需求\n\n## 2.1 详细说明\n\n本模块没有外部调用；范围由录入与查询组成。\n';
const defective=template.replace('|默认值','').replace('|---|---|---|---|','|---|---|---|').replace('|无','').replace('## 2.1 详细说明\n\n本模块没有外部调用；范围由录入与查询组成。','接口相关资料尚未提供。');
async function terminal(service:Service,id:string){for(let n=0;n<1000;n++){const run=service.state.runs.find(r=>r.id===id)!;if(run.finishedAt&&!['queued','running','validating','repairing','cancelling'].includes(run.status))return run;await new Promise(resolve=>setTimeout(resolve,10));}throw Error('local template fixture timeout');}
async function fixture(t:test.TestContext,prompt:(o:RuntimeOptions,round:number)=>Promise<void>){
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'slash-prd-template-')),store=new Store(path.join(dir,'profile'));let rounds=0;
 const service=new Service(store,()=> 'fixture-key',()=>{},async o=>({messages:[{role:'assistant',stopReason:'stop'}],abort:async()=>{},dispose:()=>{},prompt:async()=>{await prompt(o,++rounds);}} as unknown as RuntimeHandle)),instances=[service];
 await service.workspace(path.join(dir,'project'));service.setPermission('workspace_read','allow');service.setPermission('artifact_write','allow');
 t.after(async()=>{for(const instance of instances){instance.dispose();await Promise.allSettled([...(instance as any).agentIndex.queues.values()]);}await new Promise(resolve=>setTimeout(resolve,20));store.close();await fs.rm(dir,{recursive:true,force:true,maxRetries:5,retryDelay:30});});
 const resource=service.state.mounts.find(m=>m.name==='资源')!,output=service.state.mounts.find(m=>m.name==='成果')!,selected={mountId:resource.id,path:'参考资料/template.md'};
 await fs.writeFile(path.join(resource.path,selected.path),template);
 const workflow:PmWorkflow={kind:'prd',sources:[],template:selected};
 const write=async(o:RuntimeOptions,name:string,content:string)=>{const target={mountId:output.id,path:'PRD/'+name};await o.log('write_draft',target,async()=>{const change=await o.files.draft(target.mountId,target.path,content,o.runId!);o.draft!(change);});return target;};
 return{dir,store,service,instances,resource,output,selected,workflow,write,rounds:()=>rounds};
}
test('Service automatic unique PRD binding reaches existing bounded repair without another model tool',async t=>{
 let f!:Awaited<ReturnType<typeof fixture>>,target!:{mountId:string;path:string};
 f=await fixture(t,async(o,round)=>{if(round===1)target=await f.write(o,'module.md',defective);else{assert.equal(round,2);const report=(await o.getTaskAcceptance!())!.latestReport!,failure=report.results.find(r=>r.criterionId==='host:prd-template')!;assert.equal(failure.status,'failed');assert.match(failure.reason,/默认值/);assert.match(failure.reason,/2.1/);const snapshot=await o.readDraft!(target);await o.log('edit_draft',target,()=>o.editDraft!({...target,changeId:snapshot.changeId,expectedContentHash:snapshot.contentHash,oldText:defective,newText:template}));}o.delta('本地模板草稿已保留。');});
 const run=await terminal(f.service,await f.service.send(f.service.conversation(),'生成本模块PRD','build','standard',undefined,undefined,undefined,undefined,undefined,f.workflow));
 assert.equal(run.status,'succeeded',run.error);assert.equal(f.rounds(),2);assert.equal(run.acceptance!.repairRounds,1);
 const view=(await f.service.getTaskAcceptance(run.id))!;assert.equal(view.latestReport!.results.find(r=>r.criterionId==='host:prd-template')!.status,'passed');assert.equal(view.contract.template!.outputId,undefined,'unique auto binding remains recomputable, never silently pins a first draft');
 assert.equal(view.latestReport!.businessCoverage.status,'unverified');await assert.rejects(fs.stat(path.join(f.output.path,target.path)),/ENOENT/);assert.equal(f.service.state.changes.length,1);
 const summary=await f.service.getTaskAcceptanceForModel(run.id,{});assert.equal((summary.items[0] as {data:any}).data.template.binding,'automatic_unique');
});
test('template with multiple ordinary Markdown outputs stays unverified until explicit specific binding; frozen structure cannot be proposed',async t=>{
 let f!:Awaited<ReturnType<typeof fixture>>;
 f=await fixture(t,async o=>{await f.write(o,'notes.md','# 工作记录\n\n待整理内容。');await f.write(o,'actual.md',template);const first=await o.checkTaskAcceptance!();assert.equal(first.results.find(r=>r.criterionId==='host:prd-template')!.status,'unverified');const view=(await o.getTaskAcceptance!())!,selected=view.contract.outputs.find(output=>output.target.path.endsWith('actual.md'))!;
 assert.throws(()=>taskAcceptanceProposalSchema.parse({template:{sections:[]}}));await o.defineTaskAcceptance!({templateOutputId:selected.id});const frozen=(await o.getTaskAcceptance!())!.contract.template!;assert.equal(frozen.outputId,selected.id);await assert.rejects(o.defineTaskAcceptance!({templateOutputId:view.contract.outputs.find(output=>output.id!==selected.id)!.id}),/BINDING_IMMUTABLE/);o.delta('本地模板绑定完成。');});
 const run=await terminal(f.service,await f.service.send(f.service.conversation(),'生成PRD和记录','build','standard',undefined,undefined,undefined,undefined,undefined,f.workflow));assert.equal(run.status,'succeeded',run.error);const view=(await f.service.getTaskAcceptance(run.id))!;assert.equal(view.latestReport!.results.find(r=>r.criterionId==='host:prd-template')!.status,'passed');
});
test('Plan does not copy DOCX, convert original, create TXT or freeze a task contract',async t=>{
 let f!:Awaited<ReturnType<typeof fixture>>;
 f=await fixture(t,async o=>{assert.equal(o.mode,'plan');o.delta('方案 1：先确认模板版本，再起草模块PRD。');});
 const parser=t.mock.method(mammoth,'convertToHtml'),bytes=await fs.readFile('.test-data/prd-user-template/千禾prd模板_离线结构副本.docx');f.workflow.template={mountId:f.resource.id,path:'参考资料/template.docx'};await fs.writeFile(path.join(f.resource.path,f.workflow.template.path),bytes);
 const before=f.store.db.prepare("SELECT count(*) AS count FROM kv WHERE key LIKE 'processing-copy:%'").get()!.count;
 const run=await terminal(f.service,await f.service.send(f.service.conversation(),'先规划PRD','plan','standard',undefined,undefined,undefined,undefined,undefined,f.workflow));
 assert.equal(run.status,'awaiting_plan',run.error);assert.equal(run.workflow!.templateSnapshot!.state,'unverified');assert.match(run.workflow!.templateSnapshot!.limitations.join(' '),/Plan只读/);assert.equal(run.acceptance,undefined);assert.equal(parser.mock.calls.length,0);assert.equal(f.service.state.changes.length,0);assert.equal(f.store.db.prepare("SELECT count(*) AS count FROM kv WHERE key LIKE 'processing-copy:%'").get()!.count,before);
});
test('real user DOCX reuse and previous PRD replay fail on default column + 6.2 via Service; no repeated TXT draft',async t=>{
 let f!:Awaited<ReturnType<typeof fixture>>;
 const original=await fs.readFile('.test-data/prd-user-template/千禾prd模板_离线结构副本.docx'),previous=await fs.readFile('.test-data/prd-template-findrows-retest/case-PRD-TEMPLATE/pending-1.md','utf8');
 f=await fixture(t,async(o,round)=>{if(round===1)await f.write(o,'actual.md',previous);o.delta('保留缺项草稿供本地核对。');});const parser=t.mock.method(mammoth,'convertToHtml');
 f.workflow.template={mountId:f.resource.id,path:'参考资料/企业模块规范.docx'};await fs.writeFile(path.join(f.resource.path,f.workflow.template.path),original);
 const copy=await f.service.copyForProcessing(f.workflow.template),extract=await f.service.processProcessingCopy(copy.id,'extract_text');await f.service.apply(extract.changeId);assert.equal(parser.mock.calls.length,1);
 const rawParser=t.mock.method(mammoth,'extractRawText');
 const run=await terminal(f.service,await f.service.send(f.service.conversation(),'按指定模板生成模块PRD','build','standard',undefined,undefined,undefined,undefined,undefined,f.workflow));
 assert.equal(run.status,'succeeded',run.error);assert.equal(f.rounds(),3);assert.equal(run.acceptance!.repairRounds,2);assert.equal(parser.mock.calls.length,1);
 assert.equal(rawParser.mock.calls.length,0,'full validation/content-review preparation must not reconvert template original through Files.read');assert(!run.sourceReads?.some(s=>s.path===f.workflow.template!.path),'explicit template is not business evidence');
 const view=(await f.service.getTaskAcceptance(run.id))!,result=view.latestReport!.results.find(r=>r.criterionId==='host:prd-template')!;
 assert.equal(result.status,'failed');assert.match(result.reason,/默认值/);assert.match(result.reason,/6.2/);assert.equal(view.contract.template!.sections.length,25);assert.equal(f.service.state.changes.length,2);assert.equal(hash(await fs.readFile(path.join(f.resource.path,f.workflow.template.path))),hash(original));
 await fs.mkdir('.test-data/prd-template-acceptance-local',{recursive:true});await fs.writeFile('.test-data/prd-template-acceptance-local/service-replay.json',JSON.stringify({cloudCalls:0,runId:run.id,status:run.status,acceptance:run.acceptance,parserCalls:parser.mock.calls.length,template:view.contract.template,result,originalUnchanged:true,notice:'本地Service工具夹具，不代表真实云模型生成通过'},null,2));
});
test('current desktop template isolated copy runs formal Service replay; no original conversion or business-source promotion',async t=>{
 let f!:Awaited<ReturnType<typeof fixture>>;const input='.test-data/prd-template-acceptance-local/千禾prd模板_当前测试副本.docx',bytes=await fs.readFile(input),previous=await fs.readFile('.test-data/prd-template-findrows-retest/case-PRD-TEMPLATE/pending-1.md','utf8'),before=hash(bytes);
 f=await fixture(t,async(o,round)=>{if(round===1)await f.write(o,'current-template-replay.md',previous);o.delta('当前模板本地核对结果已记录，业务内容仍需确认。');});
 f.workflow.template={mountId:f.resource.id,path:'参考资料/current-template.docx'};await fs.writeFile(path.join(f.resource.path,f.workflow.template.path),bytes);const rawParser=t.mock.method(mammoth,'extractRawText'),parser=t.mock.method(mammoth,'convertToHtml');
 const run=await terminal(f.service,await f.service.send(f.service.conversation(),'按明确选择的当前模板核对旧PRD','build','standard',undefined,undefined,undefined,undefined,undefined,f.workflow));assert.equal(run.status,'succeeded',run.error);assert.equal(rawParser.mock.calls.length,0);assert.equal(parser.mock.calls.length,1);
 const view=(await f.service.getTaskAcceptance(run.id))!,result=view.latestReport!.results.find(r=>r.criterionId==='host:prd-template')!;assert(result);assert.equal(result.status,'failed');assert.match(result.reason,/默认值/);assert.match(result.reason,/6.2/);assert.doesNotMatch(result.reason,/缺少模板章节[^；]*T0X名称/);assert(view.contract.template!.sections.some(s=>s.ambiguous));assert.equal(f.service.state.changes.length,1,'only PRD draft, no converted TXT');assert(!run.sourceReads?.some(s=>s.path===f.workflow.template!.path));
 assert.equal(hash(await fs.readFile(input)),before);assert.equal(hash(await fs.readFile(path.join(f.resource.path,f.workflow.template.path))),before);
 await fs.writeFile('.test-data/prd-template-acceptance-local/current-service-replay.json',JSON.stringify({cloudCalls:0,sourceBytes:bytes.length,sourceCopyUnchanged:true,runId:run.id,status:run.status,acceptance:run.acceptance,parserCalls:parser.mock.calls.length,rawParserCalls:rawParser.mock.calls.length,template:view.contract.template,result,notice:'当前桌面模板的隔离副本，经正式Service复制和解析链核对旧PRD；本地运行夹具，不是新的真实云生成'},null,2));
});
test('Markdown source changes, restart and revocation invalidate old template result',async t=>{
 let f!:Awaited<ReturnType<typeof fixture>>;
 f=await fixture(t,async o=>{if(o.mode==='plan')o.delta('方案 1：确认所选模板版本后起草。');else{await f.write(o,'actual.md',template);o.delta('草稿已保留。');}});
 const run=await terminal(f.service,await f.service.send(f.service.conversation(),'生成模块PRD','build','standard',undefined,undefined,undefined,undefined,undefined,f.workflow));assert.equal(run.status,'succeeded',run.error);
 const restored=new Service(f.store,()=> 'fixture-key',()=>{});f.instances.push(restored);await restored.initializeDefaultProject();assert.equal((await restored.getTaskAcceptance(run.id))!.latestReport!.results.find(r=>r.criterionId==='host:prd-template')!.status,'passed');
 await fs.appendFile(path.join(f.resource.path,f.selected.path),'\n来源发生变化。\n');const stale=(await restored.getTaskAcceptance(run.id))!.latestReport!;assert.equal(stale.versionState,'stale');assert.match(stale.versionReasons.join(' '),/模板原件/);
 f.service.setPermission('workspace_read','deny');assert.equal((await f.service.getTaskAcceptance(run.id))!.latestReport!.versionState,'unavailable');
});
test('Build creates only a registered DOCX byte copy; copy mutation invalidates stored template after restart',async t=>{
 const f=await fixture(t,async o=>o.delta('所选模板已核对，业务资料仍待补充。')),bytes=await fs.readFile('.test-data/prd-user-template/千禾prd模板_离线结构副本.docx');
 f.workflow.template={mountId:f.resource.id,path:'参考资料/new-template.docx'};await fs.writeFile(path.join(f.resource.path,f.workflow.template.path),bytes);
 const run=await terminal(f.service,await f.service.send(f.service.conversation(),'核对模板再准备PRD','build','standard',undefined,undefined,undefined,undefined,undefined,f.workflow));
 assert.equal(run.status,'succeeded',run.error);assert(run.workflow!.templateSnapshot!.copyId);assert.equal(f.service.state.changes.length,0,'template structure derivation does not create a TXT draft');assert.equal(hash(await fs.readFile(path.join(f.resource.path,f.workflow.template.path))),hash(bytes));
 const copy=run.workflow!.templateSnapshot!.copy!,mount=f.service.state.mounts.find(m=>m.id===copy.mountId)!;await fs.appendFile(path.join(mount.path,copy.path),'copy changed');
 const restored=new Service(f.store,()=> 'fixture-key',()=>{});f.instances.push(restored);await restored.initializeDefaultProject();const view=(await restored.getTaskAcceptance(run.id))!;assert.equal(view.latestReport!.versionState,'stale');assert.match(view.latestReport!.versionReasons.join(' '),/处理副本/);
});
test('Plan confirmation carries the expected selected template hash and rejects changed content before runtime',async t=>{
 let f!:Awaited<ReturnType<typeof fixture>>;f=await fixture(t,async o=>{assert.equal(o.mode,'plan');o.delta('方案 1：按已选模板起草模块PRD。\n步骤：核对字段与集成范围。');});
 const plan=await terminal(f.service,await f.service.send(f.service.conversation(),'先规划PRD','plan','standard',undefined,undefined,undefined,undefined,undefined,f.workflow));assert.equal(plan.status,'awaiting_plan',plan.error);assert(plan.workflow!.templateSnapshot!.source.contentHash);
 await fs.appendFile(path.join(f.resource.path,f.selected.path),'\n# 3. 新要求\n\n来源已变更。\n');
 const id=await f.service.confirmPlan(plan.id,[plan.proposal!.options[0].id],'');const build=await terminal(f.service,id);assert.equal(build.status,'failed');assert.match(build.error!,/模板版本已变化/);assert.equal(f.rounds(),1);
});
test('true resume keeps host-frozen template identity when cache was removed',async t=>{
 let f!:Awaited<ReturnType<typeof fixture>>;f=await fixture(t,async(o,round)=>{if(round===1){await f.write(o,'module.md',template);throw Error('FIXTURE_INTERRUPTED');}o.delta('继续核对已有草稿。');});
 const first=await terminal(f.service,await f.service.send(f.service.conversation(),'生成模块PRD','build','standard',undefined,undefined,undefined,undefined,undefined,f.workflow));assert.equal(first.status,'failed');assert(first.resumable);const before=(await f.service.getTaskAcceptance(first.id))!.contract.template!;
 f.store.db.prepare("DELETE FROM kv WHERE key LIKE 'prd-template-cache:v1:%'").run();
 const resumed=await terminal(f.service,await f.service.resumeRun(first.id));assert.equal(resumed.status,'succeeded',resumed.error);const after=(await f.service.getTaskAcceptance(resumed.id))!.contract.template!;assert.equal(after.snapshotHash,before.snapshotHash);assert.equal(after.source.readAt,before.source.readAt);assert.equal(f.service.state.changes.length,1);
});
test('long template structure remains fully retrievable through existing bounded JSON pagination',async t=>{
 let f!:Awaited<ReturnType<typeof fixture>>;f=await fixture(t,async o=>o.delta('结构仍待填写。'));const text='# 大型模板\n\n'+Array.from({length:160},(_,i)=>'# '+(i+1)+'. 模块需求章节'+i+'\n\n请按实际资料填写说明。\n\n').join('');assert(text.length>4000);await fs.writeFile(path.join(f.resource.path,f.selected.path),text);
 const run=await terminal(f.service,await f.service.send(f.service.conversation(),'核对完整模板','build','standard',undefined,undefined,undefined,undefined,undefined,f.workflow));assert.equal(run.status,'succeeded',run.error);
 let cursor:unknown,serialized='',complete:any;
 for(let n=0;n<100;n++){const page=await f.service.getTaskAcceptanceForModel(run.id,{section:'prd',itemId:'selected-template',...(cursor?{cursor}:{})});assert(JSON.stringify(page).length<=12000);for(const item of page.items){if('encoding' in item)serialized+=item.text;else complete=item.data;}if(!page.nextCursor)break;cursor=page.nextCursor;}
 const frozen=complete??JSON.parse(serialized);assert.equal(frozen.sections.length,160);assert.equal(frozen.sections.at(-1).ordinal,'160');
});
for(const action of ['cancel','revoke'] as const)test('DOCX preparation '+action+' prevents late snapshot/cache/output commit',async t=>{
 const f=await fixture(t,async()=>assert.fail('runtime must not start')),bytes=await fs.readFile('.test-data/prd-user-template/千禾prd模板_离线结构副本.docx');
 f.workflow.template={mountId:f.resource.id,path:'参考资料/template.docx'};await fs.writeFile(path.join(f.resource.path,f.workflow.template.path),bytes);await f.service.copyForProcessing(f.workflow.template);
 let reached!:()=>void,release!:()=>void;const start=new Promise<void>(resolve=>reached=resolve),blocked=new Promise<void>(resolve=>release=resolve),original=mammoth.convertToHtml;
 t.mock.method(mammoth,'convertToHtml',async(...args:Parameters<typeof original>)=>{const result=await original(...args);reached();await blocked;return result;});
 const id=await f.service.send(f.service.conversation(),'按模板生成PRD','build','standard',undefined,undefined,undefined,undefined,undefined,f.workflow);await start;if(action==='cancel')f.service.cancel(id);else f.service.setPermission('workspace_read','deny');release();const run=await terminal(f.service,id);
 assert.equal(run.status,action==='cancel'?'cancelled':'failed',run.error);assert.equal(f.service.state.changes.length,0);assert.equal((await f.service.getTaskAcceptance(id))!.contract.template,undefined);assert.equal(f.store.db.prepare("SELECT count(*) AS count FROM kv WHERE key LIKE 'prd-template-cache:v1:%'").get()!.count,0);
});
test('no template keeps existing ordinary workflow compatibility',async t=>{
 let f!:Awaited<ReturnType<typeof fixture>>;f=await fixture(t,async o=>{await f.write(o,'module.md','# 模块PRD\n\n本次只说明录入。');o.delta('模块草稿已保留。');});
 const run=await terminal(f.service,await f.service.send(f.service.conversation(),'生成模块PRD','build','standard',undefined,undefined,undefined,undefined,undefined,{kind:'prd',sources:[]}));
 assert.equal(run.status,'succeeded',run.error);const view=(await f.service.getTaskAcceptance(run.id))!;assert.equal(view.contract.template,undefined);assert(!view.latestReport!.results.some(r=>r.criterionId==='host:prd-template'));assert.equal(f.rounds(),1);
});
