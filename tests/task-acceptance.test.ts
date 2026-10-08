import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {TaskAcceptanceDomain,type TaskAcceptanceDependencies} from '../main/task-acceptance.js';
import {Store} from '../main/store.js';
import {taskAcceptanceDefineSchema,type TaskAcceptanceOutput,type TaskAcceptanceCriterion,type TaskTargetSnapshot,type TaskHostCheckInput,type TaskHostCheckOutcome} from '../shared/task-acceptance.js';
import type {PrototypeAcceptanceEvidence} from '../shared/prototype-acceptance.js';
import {buildContentReviewInput,reviewContent,verifyContentReviewReceipt} from '../main/content-review.js';

const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
const cases=[{id:'save',title:'保存反馈',steps:[{action:'assert' as const,assertion:'visible' as const,selector:'#success',expected:true}]}];
function memory(){const values=new Map<string,unknown>();return{get<T>(key:string,fallback:T):T{return structuredClone(values.has(key)?values.get(key):fallback) as T;},set(key:string,value:unknown){values.set(key,structuredClone(value));}};}
function fixture(overrides:Partial<TaskAcceptanceDependencies>={}){
 const store=overrides.store??memory(),snapshots=new Map<string,TaskTargetSnapshot>();let workspace='workspace',allowed=true;
 const deps:TaskAcceptanceDependencies={store,workspaceId:()=>workspace,guard:()=>{if(!allowed)throw Error('PERMISSION_DENIED');},readTarget:async target=>{const snapshot=snapshots.get(target.path);if(!snapshot)throw Error('NOT_FOUND');return structuredClone(snapshot);},...overrides};
 const domain=new TaskAcceptanceDomain(deps);domain.begin({runId:'run',request:{id:'request',text:'生成模块PRD，保留现有保存反馈。',source:'initial'}});
 const output=(content='# 模块PRD\n\n保存后反馈成功。',source:'draft'|'applied'='draft'):TaskAcceptanceOutput=>{snapshots.set('PRD.md',{content});return{id:'prd',kind:'markdown',target:source==='draft'?{source,mountId:'output',path:'PRD.md',changeId:'change',baseHash:null,contentHash:hash(content)}:{source,mountId:'readonly',path:'PRD.md',contentHash:hash(content)}};};
 const criterion=(expected='保存后反馈成功。'):TaskAcceptanceCriterion=>({id:'save',text:'文档保留具体保存反馈说明',requestIds:['request'],outputIds:['prd'],required:true,origin:'user_request',checker:{kind:'text_assertion',expected,match:'contains'}});
 return{domain,store,snapshots,output,criterion,setWorkspace:(value:string)=>{workspace=value;},setAllowed:(value:boolean)=>{allowed=value;}};
}
function prototypePass(input:TaskHostCheckInput):TaskHostCheckOutcome{
 assert.equal(input.criterion.checker.kind,'prototype_cases');if(input.criterion.checker.kind!=='prototype_cases')throw Error('wrong checker');
 const at=new Date().toISOString(),definitions=input.criterion.checker.cases;
 const prototype:PrototypeAcceptanceEvidence={executionId:'execution',specId:'spec',specRevision:1,specHash:hash(JSON.stringify(definitions)),mountId:input.output.target.mountId,path:input.output.target.path,entryHash:input.output.target.contentHash,manifest:[{path:input.output.target.path,hash:input.output.target.contentHash,bytes:input.content.length}],sourceRefs:[],status:'passed',cases:definitions.map(c=>({caseId:c.id,status:'passed',steps:c.steps.map((_,stepIndex)=>({stepIndex,status:'passed',observed:true}))})),screenshots:definitions.map(c=>({id:'screen-'+c.id,caseId:c.id,mimeType:'image/png',bytes:100,contentHash:hash(c.id)})),startedAt:at,finishedAt:at,runnerVersion:'host-runner',notice:'实际DOM观察',caseDefinitions:definitions,completionVersionState:'current'};
 return{status:'passed',reason:'具体DOM断言通过',evidence:[{kind:'prototype_report',targetHash:input.output.target.contentHash,checkerVersion:'host-runner',prototype}]};
}

test('普通聊天无需成果验收，明确交付而无成果保持未验证',async()=>{
 const f=fixture();assert.equal((await f.domain.validate('run')).status,'not_applicable');f.domain.begin({runId:'deliverable',scope:'deliverable',request:{id:'new',text:'写一份PRD',source:'initial'}});assert.equal((await f.domain.validate('deliverable')).status,'unverified');
});

test('原始输入保留真实文字且不能改写；新增steer使旧通过失效',async()=>{
 const f=fixture();f.domain.define('run',{outputs:[f.output()],criteria:[f.criterion()]});const report=await f.domain.validate('run');assert.equal(report.status,'passed');assert.equal(report.businessCoverage.status,'unverified');assert.match(report.summary,/自动检查通过，业务覆盖尚待确认/);
 const before=f.domain.getContract('run');f.domain.appendRequest('run',{id:'steer',text:'  还需要失败反馈。\n',source:'steer'});const contract=f.domain.getContract('run');assert.equal(contract.requests[1].text,'  还需要失败反馈。\n');assert.equal(contract.requests[1].textHash,hash(contract.requests[1].text));assert.notEqual(before.contractHash,contract.contractHash);assert.throws(()=>f.domain.appendRequest('run',{id:'request',text:'只做保存即可。',source:'initial'}),/REQUEST_IMMUTABLE/);
 const current=await f.domain.getReport('run',report.id);assert.equal(current!.status,'unverified');assert.equal(current!.versionState,'stale');assert.equal(f.domain.listReports('run')[0].status,'passed');
});

test('候选要求不能删改、降低必检或伪造passed；定义遗漏不删除旧要求',()=>{
 const f=fixture(),criterion=f.criterion();f.domain.define('run',{outputs:[f.output()],criteria:[criterion]});for(const changed of [{...criterion,required:false},{...criterion,checker:{kind:'text_assertion' as const,expected:'反馈',match:'contains' as const}},{...criterion,text:'缩小要求'}])assert.throws(()=>f.domain.define('run',{criteria:[changed]}),/CRITERION_IMMUTABLE/);
 const before=f.domain.getContract('run');f.domain.define('run',{criteria:[],outputs:[]});assert.deepEqual(f.domain.getContract('run').criteria,before.criteria);assert.deepEqual(f.domain.getContract('run').outputs,before.outputs);
 assert.equal(taskAcceptanceDefineSchema.safeParse({criteria:[{...criterion,status:'passed'}]}).success,false);assert.equal(taskAcceptanceDefineSchema.safeParse({criteria:[{...criterion,evidence:[{passed:true}]}]}).success,false);
 assert.throws(()=>f.domain.define('run',{criteria:[{...criterion,id:'invalid',requestIds:['imaginary']}]}),/REQUEST_NOT_FOUND/);
});

test('草稿和正式成果都以实际内容hash核对，输出更新和未登记外部编辑失效',async()=>{
 for(const source of ['draft','applied'] as const){const f=fixture(),output=f.output(undefined,source);f.domain.define('run',{outputs:[output],criteria:[f.criterion()]});const report=await f.domain.validate('run');assert.equal(report.status,'passed');f.snapshots.set(output.target.path,{content:'# 外部变更\n\n新正文'});assert.equal((await f.domain.getReport('run',report.id))!.versionState,'stale');assert.equal((await f.domain.validate('run')).status,'unverified');const next=f.output('# 模块PRD\n\n保存后反馈成功。\n新增失败反馈。',source);f.domain.define('run',{outputs:[next]});assert.equal((await f.domain.getReport('run',report.id))!.status,'unverified');assert.equal((await f.domain.validate('run')).status,'passed');}
});

test('明确用户变更只能走宿主接口，引用真实输入并保留旧要求历史',async()=>{
 const f=fixture(),criterion=f.criterion();f.domain.define('run',{outputs:[f.output()],criteria:[criterion]});const report=await f.domain.validate('run');f.domain.appendRequest('run',{id:'override',text:'这一次将保存成功说明改为“已经提交”。',source:'steer'});const replacement={...criterion,requestIds:['request','override'],checker:{kind:'text_assertion' as const,expected:'已经提交',match:'contains' as const}};
 assert.throws(()=>f.domain.amendCriterionFromRequest('run',{requestId:'override',authorizationQuote:'虚构用户授权',criterionId:'save',replacement}),/AUTHORIZATION_MISMATCH/);f.domain.amendCriterionFromRequest('run',{requestId:'override',authorizationQuote:'将保存成功说明改为“已经提交”',criterionId:'save',replacement});const contract=f.domain.getContract('run');assert.deepEqual(contract.criterionAmendments[0].previous,criterion);assert.deepEqual(contract.criteria[0],replacement);assert.equal((await f.domain.getReport('run',report.id))!.versionState,'stale');assert.equal((await f.domain.validate('run')).status,'failed');assert.equal(contract.baseline.length,0);
});

test('宿主明确修改旧回归规则须绑定真实用户输入，保留旧cases且模型定义不能改基线',async()=>{
 const f=fixture(),output=f.output();f.domain.define('run',{outputs:[output]});f.domain.freezeBaseline('run',{id:'baseline',outputId:output.id,target:output.target,origin:'previous_verified',cases});const previous=f.domain.getContract('run').baseline[0];f.domain.appendRequest('run',{id:'override-baseline',text:'把原成功提示调整为“已提交”，保留保存动作。',source:'steer'});const changed=[{...cases[0],steps:[{action:'assert' as const,assertion:'visible' as const,selector:'#submitted',expected:true}]}];
 assert.throws(()=>f.domain.amendBaselineFromRequest('run',{requestId:'override-baseline',authorizationQuote:'虚构修改授权',baselineId:'baseline',cases:changed}),/AUTHORIZATION_MISMATCH/);f.domain.amendBaselineFromRequest('run',{requestId:'override-baseline',authorizationQuote:'原成功提示调整为“已提交”',baselineId:'baseline',cases:changed});changed[0].steps[0].selector='#mutated';const current=f.domain.getContract('run');assert.deepEqual(current.baselineAmendments[0].previous,previous);assert.equal(current.baseline[0].cases[0].steps[0].action,'assert');assert.equal((current.baseline[0].cases[0].steps[0] as any).selector,'#submitted');assert.throws(()=>f.domain.define('run',{baseline:[]} as any),/Unrecognized key/);assert.equal(current.requests.find(r=>r.id==='override-baseline')!.text,'把原成功提示调整为“已提交”，保留保存动作。');
});

test('只读成果验证只读取宿主快照，不调用任何成果写入',async()=>{
 let reads=0;const f=fixture({readTarget:async()=>{reads++;return{content:'# 只读资料\n\n正文。'};}});const output=f.output('# 只读资料\n\n正文。','applied');f.domain.define('run',{outputs:[output]});assert.equal((await f.domain.validate('run')).status,'passed');assert.ok(reads>=2);assert.equal(f.domain.getContract('run').outputs[0].target.mountId,'readonly');
});

test('内容审查来源撤权返回不可用投影并隐藏旧引文，持久原审查仍保留历史',async()=>{
 let sourceReadable=true;const f=fixture({refreshContentReview:async receipt=>{if(!sourceReadable)throw Error('SOURCE_PERMISSION_REVOKED');return receipt;}}),output=f.output(),contract=f.domain.getContract('run'),sourceText='SOURCE-BIZ-SECRET：保存完成时应反馈成功。';f.domain.define('run',{outputs:[output]});const base=await f.domain.validate('run'),input=buildContentReviewInput({requests:contract.requests.map(({id,text})=>({id,text})),artifacts:[{id:output.id,sha256:output.target.contentHash,text:f.snapshots.get('PRD.md')!.content}],sources:[{id:'source',sha256:hash(sourceText),text:sourceText}]});const receipt=await reviewContent({input,reviewer:{provider:'fixture',modelId:'fixture',protocol:'openai-completions'},review:async()=>({stopReason:'stop',raw:{findings:[{category:'contradiction',severity:'advisory',confidence:'high',explanation:'对照提供的成功提示原句核对表达。',artifacts:[{artifactRef:'A1',quote:'保存后反馈成功。'}],sources:[{sourceRef:'S1',quote:sourceText}],requests:[]}],coverage:{artifactRefs:['A1'],sourceRefs:['S1'],requestRefs:['R1'],directions:['fact_inference','scope_expansion','contradiction','cross_artifact_consistency','field_semantics','request_coverage'],limitations:[]}}})});const attached=await f.domain.attachContentReview('run',base.id,receipt);assert.equal(attached.status,'needs_human');assert.equal(attached.contentReview!.findings.length,1);sourceReadable=false;const unavailable=(await f.domain.get('run')).latestReport!;assert.equal(unavailable.versionState,'unavailable');assert.equal(unavailable.status,'unverified');assert.equal(unavailable.contentReview!.versionState,'unavailable');assert.equal(unavailable.contentReview!.status,'unverified');assert.deepEqual(unavailable.contentReview!.findings,[]);assert.doesNotMatch(JSON.stringify(unavailable.contentReview),/SOURCE-BIZ-SECRET/);assert.equal(verifyContentReviewReceipt(unavailable.contentReview!),true);const historical=f.domain.latestContentReview('run')!;assert.equal(historical.versionState,'current');assert.equal(historical.findings.length,1);assert.match(historical.findings[0].sourceBindings[0].quote,/SOURCE-BIZ-SECRET/);
});

test('依赖新增、删除和改hash都使旧结果过期；不同成果依赖分别冻结',async()=>{
 const f=fixture(),output=f.output(),dep={mountId:'output',path:'app.js',contentHash:hash('old')};f.snapshots.get('PRD.md')!.dependencies=[dep];f.domain.define('run',{outputs:[output]});const report=await f.domain.validate('run');assert.equal(report.status,'passed');
 for(const dependencies of [[],[{...dep,contentHash:hash('new')}],[dep,{mountId:'output',path:'styles.css',contentHash:hash('css')}]]){f.snapshots.get('PRD.md')!.dependencies=dependencies;assert.equal((await f.domain.getReport('run',report.id))!.versionState,'stale');}
 f.snapshots.get('PRD.md')!.dependencies=[dep];assert.equal((await f.domain.getReport('run',report.id))!.versionState,'current');
});

test('来源快照与PRD假设独立记录，current不代表业务正确；来源改动或不可读不能通过',async()=>{
 const sourceHash=hash('只读原文');let actual=sourceHash,readable=true,reads=0;const f=fixture({readSourceHash:async source=>{reads++;assert.equal(source.mountId,'reference');if(!readable)throw Error('DENIED');return actual;}});f.domain.define('run',{outputs:[f.output()],criteria:[f.criterion()],prd:{sources:[{mountId:'reference',path:'rules.md',versionId:'v1',contentHash:sourceHash,readAt:new Date().toISOString(),characters:5,includedCharacters:5,truncated:false}],assumptions:[{id:'timing',text:'保存分配时机尚待确认',sourceRefIds:[]}],coverage:[{requestId:'request',requestQuote:'生成模块PRD',criterionIds:['save']}]}});
 const report=await f.domain.validate('run');assert.equal(report.status,'passed');assert.equal(report.businessCoverage.status,'unverified');assert.deepEqual(report.businessCoverage.assumptionIds,['timing']);assert.ok(reads);actual=hash('新版原文');assert.equal((await f.domain.getReport('run',report.id))!.versionState,'stale');readable=false;assert.equal((await f.domain.getReport('run',report.id))!.versionState,'unavailable');assert.equal((await f.domain.validate('run')).status,'unverified');
});

test('PRD覆盖映射不能捏造请求摘录或引用其他输入的检查，也不自行确认语义覆盖',async()=>{
 const f=fixture();f.domain.define('run',{outputs:[f.output()],criteria:[f.criterion()]});assert.throws(()=>f.domain.define('run',{prd:{sources:[],assumptions:[],coverage:[{requestId:'request',requestQuote:'用户没有说过的话',criterionIds:['save']}]}}),/COVERAGE_QUOTE_MISMATCH/);f.domain.appendRequest('run',{id:'next',text:'请加入提交后返回入口。',source:'follow_up'});assert.throws(()=>f.domain.define('run',{prd:{sources:[],assumptions:[],coverage:[{requestId:'next',requestQuote:'返回入口',criterionIds:['save']}]}}),/COVERAGE_CRITERION_MISMATCH/);const report=await f.domain.validate('run');assert.deepEqual(report.businessCoverage.unmappedRequestIds,['next']);assert.equal(report.status,'passed');assert.equal(report.businessCoverage.status,'unverified');
});

test('冻结baseline按独立旧用例执行并参与结果；模型不能替换历史基线',async()=>{
 const calls:Array<TaskHostCheckInput>=[];const f=fixture({check:async input=>{calls.push(structuredClone({...input,signal:undefined}));return input.baseline?{status:'failed',reason:'保存反馈回归失败',evidence:[{kind:'prototype_report',targetHash:input.output.target.contentHash,checkerVersion:'host-runner'}]}:prototypePass(input);}});const output=f.output();f.domain.define('run',{outputs:[output],criteria:[{...f.criterion(),checker:{kind:'prototype_cases',cases}}]});const baseline={id:'previous',outputId:'prd',target:output.target,origin:'previous_verified' as const,cases};f.domain.freezeBaseline('run',baseline);cases[0].title='调用方后续修改';assert.notEqual(f.domain.getContract('run').baseline[0].cases[0].title,cases[0].title);cases[0].title='保存反馈';assert.throws(()=>f.domain.freezeBaseline('run',{...baseline,cases:[{...cases[0],steps:[{action:'assert',assertion:'visible',selector:'#different',expected:true}]}]}),/BASELINE_IMMUTABLE/);
 const report=await f.domain.validate('run');assert.equal(report.status,'failed');assert.equal(report.results.at(-1)!.status,'passed');assert.equal(report.regression[0].status,'failed');assert.equal(calls.filter(c=>c.baseline).length,1);
});

test('原型passed必须有完整宿主证据和相同冻结用例，模型式布尔通过不足以通过',async()=>{
 for(const missing of ['evidence','observed','screenshot','definition','hash'] as const){const f=fixture({check:async input=>{const value=prototypePass(input),p=value.evidence[0].prototype!;if(missing==='evidence')value.evidence=[];if(missing==='observed')delete p.cases[0].steps[0].observed;if(missing==='screenshot')p.screenshots=[];if(missing==='definition')p.caseDefinitions![0].steps=[{action:'assert',assertion:'visible',selector:'#weakened',expected:true}];if(missing==='hash')value.evidence[0].targetHash=hash('unrelated');return value;}});f.domain.define('run',{outputs:[f.output()],criteria:[{...f.criterion(),checker:{kind:'prototype_cases',cases}}]});assert.equal((await f.domain.validate('run')).status,'unverified',missing);}
});

test('缺检查器保留未验证；人工判断独立呈现而不强迫每次弹确认',async()=>{
 const f=fixture();f.domain.define('run',{outputs:[f.output()],criteria:[{...f.criterion(),checker:{kind:'business_provenance',requirementId:'requirement',constraintIds:['code']}}]});assert.equal((await f.domain.validate('run')).status,'unverified');const human=fixture();human.domain.define('run',{outputs:[human.output()],criteria:[{...human.criterion(),checker:{kind:'human_review',reason:'视觉风格是否符合实际场景'}}]});assert.equal((await human.domain.validate('run')).status,'needs_human');assert.equal(human.domain.listReports('run').length,1);
});

test('撤权和取消不落通过记录；执行过程中追加输入使本次覆盖结果过期',async()=>{
 let deny=()=>{};const f=fixture({check:async input=>{deny();return prototypePass(input);}});deny=()=>f.setAllowed(false);f.domain.define('run',{outputs:[f.output()],criteria:[{...f.criterion(),checker:{kind:'prototype_cases',cases}}]});await assert.rejects(f.domain.validate('run'),/PERMISSION_DENIED/);f.setAllowed(true);assert.equal(f.domain.listReports('run').length,0);const controller=new AbortController();controller.abort();await assert.rejects(f.domain.validate('run',{signal:controller.signal}),/CANCELLED/);
 let append=()=>{};const changing=fixture({check:async input=>{append();return prototypePass(input);}});append=()=>{changing.domain.appendRequest('run',{id:'late',text:'追加失败反馈',source:'steer'});};changing.domain.define('run',{outputs:[changing.output()],criteria:[{...changing.criterion(),checker:{kind:'prototype_cases',cases}}]});const report=await changing.domain.validate('run');assert.equal(report.status,'unverified');assert.equal(report.versionState,'stale');
});

test('workspace隔离和返回副本保护持久契约与报告',async()=>{
 const f=fixture();f.domain.define('run',{outputs:[f.output()],criteria:[f.criterion()]});await f.domain.validate('run');const view=await f.domain.get('run');view.contract.requests[0].text='删掉要求';view.latestReport!.results[0].status='failed';assert.notEqual(f.domain.getContract('run').requests[0].text,'删掉要求');assert.equal(f.domain.listReports('run')[0].results[0].status,'passed');f.setWorkspace('other');assert.throws(()=>f.domain.getContract('run'),/NOT_FOUND/);
});

test('真实Store关闭重开保留不可变报告，不重放宿主检查，旧格式数据库兼容',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'slash-task-acceptance-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));const store=new Store(dir);const f=fixture({store});f.domain.define('run',{outputs:[f.output()],criteria:[f.criterion()]});const report=await f.domain.validate('run');store.close();const reopened=new Store(dir);try{let checks=0;const domain=new TaskAcceptanceDomain({store:reopened,workspaceId:()=> 'workspace',readTarget:async target=>f.snapshots.get(target.path)!,check:async()=>{checks++;throw Error('MUST_NOT_REPLAY');}});assert.equal((await domain.getReport('run',report.id))!.id,report.id);assert.equal(domain.getContract('run').requests[0].text,'生成模块PRD，保留现有保存反馈。');assert.equal(checks,0);assert.equal(domain.listReports('run').length,1);}finally{reopened.close();}
});
