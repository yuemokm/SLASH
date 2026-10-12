import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {TaskAcceptanceDomain} from '../main/task-acceptance.js';
import {Service} from '../main/service.js';
import {repairableTaskFailures,taskRepairPrompt} from '../main/task-completion.js';
import {visualReviewCandidates,visualReviewInput,reviewPrototypeVisual,verifyVisualReview,isCurrentVisualReview,sealVisualReview,VISUAL_REVIEW_POLICY} from '../main/prototype-visual-review.js';
import type {VisualReviewImage} from '../shared/prototype-visual-review.js';
import {VISUAL_REVIEW_LIMITS,VISUAL_REVIEW_VERSION,visualReviewReceiptSchema} from '../shared/prototype-visual-review.js';
import type {TaskAcceptanceOutput,TaskHostCheckOutcome} from '../shared/task-acceptance.js';
import {taskModelReportProjection,taskModelVisualReviewSummary} from '../main/task-acceptance-model-view.js';
const hash=(text:string)=>createHash('sha256').update(text).digest('hex');
const opinion={screenshotRef:'V1',category:'overlap',confidence:'high',explanation:'按钮被浮层遮挡',suggestion:'局部调整按钮与浮层间距',region:{x:.1,y:.2,width:.3,height:.2}};
const wire=(findings:unknown[]=[opinion])=>JSON.stringify({findings,limitations:[]});
async function fixture(){
 const values=new Map<string,unknown>(),store={get<T>(key:string,fallback:T){return structuredClone(values.get(key)??fallback) as T;},set(key:string,value:unknown){values.set(key,structuredClone(value));}};
 let content='<!doctype html><html><body><button onclick="this.textContent=123">保存</button></body></html>',dep=hash('css'),allowed=true;const output:TaskAcceptanceOutput={id:'html',kind:'html',target:{source:'draft',mountId:'out',path:'page.html',changeId:'change',baseHash:null,contentHash:hash(content)}};
 const caseDefinition={id:'desktop',title:'页面检查',viewport:{width:1440,height:900},steps:[{action:'assert' as const,assertion:'visible' as const,selector:'body',expected:true}]};
 const options={store,workspaceId:()=> 'workspace',readTarget:async()=>{if(!allowed)throw Error('PERMISSION_DENIED');return{content,dependencies:[{mountId:'out',path:'style.css',contentHash:dep}]};},refreshVisualReview:async(receipt:import('../shared/prototype-visual-review.js').VisualReviewReceipt)=>receipt,check:async():Promise<TaskHostCheckOutcome>=>({status:'passed',reason:'DOM观察',evidence:[{kind:'prototype_report',reportId:'browser-report',targetHash:output.target.contentHash,checkerVersion:'fixture',prototype:{executionId:'browser-execution',specId:'spec',specRevision:1,specHash:hash('spec'),mountId:'out',path:'page.html',entryHash:output.target.contentHash,manifest:[{path:'page.html',hash:output.target.contentHash,bytes:content.length}],sourceRefs:[],status:'passed',completionVersionState:'current',caseDefinitions:[caseDefinition],cases:[{caseId:'desktop',status:'passed',steps:[{stepIndex:0,status:'passed',observed:true}],viewport:{width:1440,height:900}}],screenshots:[{id:'screen',caseId:'desktop',mimeType:'image/png',bytes:100,contentHash:hash('pixels')}],startedAt:'now',finishedAt:'now',runnerVersion:'fixture',notice:'fixture'}}]})};
 const domain=new TaskAcceptanceDomain(options);domain.begin({runId:'run',request:{id:'request',source:'initial',text:'生成可操作页面，界面只放产品内容，制作和模拟说明留在交付说明。'}});domain.define('run',{outputs:[output],criteria:[{id:'render',text:'DOM检查',requestIds:['request'],outputIds:['html'],origin:'user_request',required:true,checker:{kind:'prototype_cases',cases:[caseDefinition]}}]});
 const report=await domain.validate('run'),image:VisualReviewImage={ref:'V1',outputId:'html',receipt:{source:'prototype_screenshot',mimeType:'image/png',contentHash:hash('pixels'),bytes:100,width:1440,height:900,viewport:{width:1440,height:900},readAt:'now',mountId:'out',path:'page.html',entryHash:output.target.contentHash,reportId:'browser-report',executionId:'browser-execution',screenshotId:'screen',caseId:'desktop',versionState:'current'}};
 const make=(text=wire(),assertCurrent=async()=>{})=>reviewPrototypeVisual({report,images:[image],requests:domain.getContract('run').requests,reviewer:{modelId:'fixture',provider:'fixture',protocol:'openai-completions'},assertCurrent,review:async()=>({text,stopReason:'stop',durationMs:1})});
 return{store,domain,report,image,make,options,setContent:(value:string)=>{content=value;},setDep:()=>{dep=hash('new-css');},revoke:()=>{allowed=false;}};
}
test('截图候选只从正式同版本浏览器报告选，意见绑定截图/成果/区域且只进入局部修稿',async()=>{
 const f=await fixture();assert.equal(f.report.status,'passed');assert.equal(visualReviewCandidates(f.report).selected.length,1);const receipt=await f.make();assert.equal(verifyVisualReview(receipt),true);assert.equal(receipt.findings[0].screenshotHash,hash('pixels'));assert.equal(receipt.findings[0].entryHash,f.image.receipt.entryHash);
 const attached=await f.domain.attachVisualReview('run',f.report.id,receipt);assert.equal(attached.status,'needs_human');const failures=repairableTaskFailures(attached);assert.equal(failures.length,1);assert.equal(failures[0].evidence[0].kind,'model_visual_review');assert.match(taskRepairPrompt(attached,1),/不得删减业务规则、必要产品反馈、来源映射/);assert.match(taskRepairPrompt(attached,1),/第1\/2轮/);
});

test('同成果同版本同视口的重复PNG只占一个视觉名额，保留交互后的不同截图',async()=>{
 const f=await fixture(),report=structuredClone(f.report),result=report.results.find(item=>item.evidence.some(e=>e.prototype))!,evidence=result.evidence.find(e=>e.prototype)!;
 assert.ok(evidence.prototype);
 const prototype=evidence.prototype;
 prototype.cases=[...prototype.cases,...['duplicate','mobile','after-error'].map(caseId=>({...structuredClone(prototype.cases[0]),caseId,viewport:{width:caseId==='mobile'?390:1440,height:caseId==='mobile'?844:900}}))];
 prototype.screenshots=[...prototype.screenshots,...['duplicate','mobile','after-error'].map(caseId=>({...structuredClone(prototype.screenshots[0]),id:caseId,caseId,contentHash:hash(caseId==='duplicate'?'pixels':caseId)}))];
 const selection=visualReviewCandidates(report);
 assert.deepEqual(selection.selected.map(item=>item.caseId),['desktop','mobile','after-error']);
 assert.equal(selection.omitted,0);
 assert.equal(selection.selected[0].reportId,'browser-report');assert.equal(selection.selected[0].screenshotId,'screen');
});

test('相同PNG在不同视口、成果或入口版本之间不能合并；未知视口保守保留',async()=>{
 for(const difference of ['viewport','output','entry','unknown-viewport'] as const){
  const f=await fixture(),report=structuredClone(f.report),copy=structuredClone(report.results.find(item=>item.evidence.some(e=>e.prototype))!),evidence=copy.evidence.find(e=>e.prototype)!;assert.ok(evidence.prototype);
  evidence.reportId='other-report';evidence.prototype.screenshots[0].id='other-screen';
  if(difference==='viewport')evidence.prototype.cases[0].viewport={width:390,height:844};
  if(difference==='output')copy.outputId='another-output';
  if(difference==='entry')evidence.targetHash=evidence.prototype.entryHash=hash('another-entry');
  if(difference==='unknown-viewport')evidence.prototype.cases[0].viewport=undefined;
  report.regression.push(copy);
  assert.equal(visualReviewCandidates(report).selected.length,2,difference);
 }
});

test('重复截图腾出名额后仍遵守三张与合计图片字节限制',async()=>{
 const f=await fixture(),report=structuredClone(f.report),evidence=report.results.flatMap(item=>item.evidence).find(e=>e.prototype)!;assert.ok(evidence.prototype);
 const prototype=evidence.prototype,original=structuredClone(prototype.screenshots[0]),originalCase=structuredClone(prototype.cases[0]);
 prototype.cases=['a','b','c','d','oversized'].map(caseId=>({...structuredClone(originalCase),caseId}));
 prototype.screenshots=['a','b','c','d','oversized'].map(caseId=>({...structuredClone(original),id:caseId,caseId,contentHash:hash(caseId),bytes:caseId==='oversized'?13*1024*1024:100}));
 assert.deepEqual(visualReviewCandidates(report).selected.map(item=>item.caseId),['a','b','c']);
 assert.equal(visualReviewCandidates(report).omitted,2);
 prototype.screenshots.unshift(prototype.screenshots.pop()!);
 assert.deepEqual(visualReviewCandidates(report).selected.map(item=>item.caseId),['a','b','c']);
});
test('不同桌面状态不吞掉已有手机视口，先覆盖实际CSS视口再稳定补状态',async()=>{
 const f=await fixture(),report=structuredClone(f.report),prototype=report.results.flatMap(r=>r.evidence).find(e=>e.prototype)!.prototype!;
 const originalCase=structuredClone(prototype.cases[0]),originalImage=structuredClone(prototype.screenshots[0]);
 const views=[['desktop',1440,900],['desktop-error',1440,900],['desktop-modal',1440,900],['mobile',390,844],['narrow',320,740]] as const;
 prototype.cases=views.map(([caseId,width,height])=>({...originalCase,caseId,viewport:{width,height}}));
 prototype.screenshots=views.map(([caseId])=>({...originalImage,id:caseId,caseId,contentHash:hash(caseId)}));
 assert.deepEqual(visualReviewCandidates(report).selected.map(i=>i.caseId),['desktop','mobile','narrow']);
 assert.equal(visualReviewCandidates(report).omitted,2);
 prototype.screenshots.pop();
 assert.deepEqual(visualReviewCandidates(report).selected.map(i=>i.caseId),['desktop','mobile','desktop-error']);
 prototype.screenshots.find(i=>i.caseId==='mobile')!.expired=true;
 assert.deepEqual(visualReviewCandidates(report).selected.map(i=>i.caseId),['desktop','desktop-error','desktop-modal']);
});
test('视口优先仍按真实图片字节累计，过大的代表不阻断同视口后续可用图',async()=>{
 const f=await fixture(),report=structuredClone(f.report),prototype=report.results.flatMap(r=>r.evidence).find(e=>e.prototype)!.prototype!;
 const originalCase=structuredClone(prototype.cases[0]),originalImage=structuredClone(prototype.screenshots[0]);
 const views=[['desktop',1440,900,7],['desktop-error',1440,900,1],['mobile-large',390,844,6],['mobile-small',390,844,4],['narrow',320,740,2]] as const;
 prototype.cases=views.map(([caseId,width,height])=>({...originalCase,caseId,viewport:{width,height}}));
 prototype.screenshots=views.map(([caseId,,,mb])=>({...originalImage,id:caseId,caseId,contentHash:hash(caseId),bytes:mb*1024*1024}));
 const selection=visualReviewCandidates(report);
 assert.deepEqual(selection.selected.map(i=>i.caseId),['desktop','mobile-small','desktop-error']);
 assert.equal(selection.selected.reduce((n,i)=>n+i.bytes,0),VISUAL_REVIEW_LIMITS.totalImageBytes);
 assert.equal(selection.omitted,2);
});
const requestProjection=(prompt:string)=>JSON.parse(JSON.parse(prompt.split('<untrusted_visual_evidence>\n')[1].split('\n</untrusted_visual_evidence>')[0]).requests);
test('长背景不会吞掉最新布局要求，JSON有界完整且截断逐条可见',async()=>{
 const f=await fixture(),requests=[{id:'initial',text:'移动端SFA。'+('业务背景与字段定义。'.repeat(1000))},{id:'latest',text:'390宽手机：首屏突出主要操作，减少重复卡片。'}];
 const input=visualReviewInput(f.report,[f.image],requests),projection=requestProjection(input.prompt);
 assert.ok(JSON.stringify(projection).length<=VISUAL_REVIEW_LIMITS.requestCharacters);
 assert.equal(projection.totalRequests,2);assert.deepEqual(projection.requests.map((item:any)=>item.index),[0,1]);
 assert.match(projection.requests[0].text,/移动端SFA/);assert.ok(projection.requests[0].omittedCharacters>0);
 assert.equal(projection.requests[1].text,requests[1].text);assert.equal(projection.requests[1].omittedCharacters,0);
 assert.deepEqual(projection.omittedRequestIndexes,[]);assert.match(input.coverageLimits[0],/1条截断、0条省略/);
 const receipt=await reviewPrototypeVisual({report:f.report,images:[f.image],requests,reviewer:{modelId:'fixture',provider:'fixture',protocol:'fixture'},assertCurrent:async()=>{},review:async()=>({text:wire([]),durationMs:1,stopReason:'stop'})});
 assert.equal(verifyVisualReview(receipt),true);assert.match(receipt.coverageLimits.join('\n'),/1条截断/);
});
test('初始和最近要求优先，省略项逐条列索引；任一未展示正文改变仍使缓存失效',async()=>{
 const f=await fixture(),requests=Array.from({length:100},(_,index)=>({id:'request-'+index,text:'前'+index+' '+('中间背景'.repeat(2000))+' 后'+index}));
 const input=visualReviewInput(f.report,[f.image],requests),projection=requestProjection(input.prompt);
 assert.ok(JSON.stringify(projection).length<=VISUAL_REVIEW_LIMITS.requestCharacters);
 assert.deepEqual(projection.requests.map((item:any)=>item.index),[0,99]);
 assert.match(projection.requests[0].text,/^前0 /);assert.match(projection.requests[0].text,/ 后0$/);
 assert.match(projection.requests[1].text,/^前99 /);assert.match(projection.requests[1].text,/ 后99$/);
 assert.deepEqual(projection.omittedRequestIndexes,Array.from({length:98},(_,index)=>index+1));
 assert.equal(input.inputHash,visualReviewInput(f.report,[f.image],structuredClone(requests)).inputHash);
 requests[50].text='完全未展示的要求已改变';
 assert.notEqual(input.inputHash,visualReviewInput(f.report,[f.image],requests).inputHash);
 const readAgain={...f.image,receipt:{...f.image.receipt,readAt:'later'}};
 assert.equal(visualReviewInput(f.report,[f.image],requests).inputHash,visualReviewInput(f.report,[readAgain],requests).inputHash);
});
test('短要求完整保留；单条超长和转义字符也保持JSON预算并显示尾部要求',async()=>{
 const f=await fixture(),requests=[{id:'first',text:'手机端业务页面'},{id:'next',text:'主要动作优先'},{id:'last',text:'避免装饰挤占操作区'}];
 const complete=requestProjection(visualReviewInput(f.report,[f.image],requests).prompt);
 assert.deepEqual(complete.requests.map((item:any)=>({id:item.id,text:item.text})),requests);
 assert.deepEqual(complete.omittedRequestIndexes,[]);assert.ok(complete.requests.every((item:any)=>item.omittedCharacters===0));
 for(const entries of [[{id:'single',text:'开头要求'+('"\\\n😀'.repeat(3000))+'末尾布局要求'}],[{id:'first',text:'"\\\n'.repeat(5000)},{id:'last',text:'最新开始'+('"\\\n'.repeat(5000))+'最新结尾'}]]){
  const input=visualReviewInput(f.report,[f.image],entries),projection=requestProjection(input.prompt);
  assert.ok(JSON.stringify(projection).length<=VISUAL_REVIEW_LIMITS.requestCharacters);
  assert.equal(projection.requests.length,entries.length);assert.ok(projection.requests.every((item:any)=>item.omittedCharacters>0));
  assert.ok(projection.requests.at(-1).text.endsWith(entries.at(-1)!.text.slice(-6)));
 }
});
test('真实contract最大100条与50万正文字符、200字符转义ID仍不突破6000预算',async()=>{
 const f=await fixture(),requests=Array.from({length:100},(_,index)=>({id:'\u0001'.repeat(197)+String(index).padStart(3,'0'),text:'"\\\n'.repeat(1666)+'xy'}));
 assert.equal(requests.reduce((n,item)=>n+item.text.length,0),500000);assert.ok(requests.every(item=>item.id.length===200));
 const projection=requestProjection(visualReviewInput(f.report,[f.image],requests).prompt);
 assert.ok(JSON.stringify(projection).length<=VISUAL_REVIEW_LIMITS.requestCharacters);
 assert.equal(projection.requests[0].index,0);assert.equal(projection.requests.at(-1).index,99);
 assert.equal(projection.requests.length+projection.omittedRequestIndexes.length,100);
});
test('无问题和中置信度不宣称视觉通过，不自动修不确定意见',async()=>{
 const f=await fixture(),none=await f.domain.attachVisualReview('run',f.report.id,await f.make(wire([])));assert.equal(none.status,'unverified');assert.equal(none.automaticStatus,'passed');assert.equal(repairableTaskFailures(none).length,0);
 const medium=await f.domain.attachVisualReview('run',f.report.id,await f.make(wire([{...opinion,confidence:'medium'}])));assert.equal(medium.status,'needs_human');assert.equal(repairableTaskFailures(medium).length,0);
});
test('模型伪造passed、越界矩形、未知截图或多余工具字段全部拒绝意见',async()=>{
 const f=await fixture();for(const raw of [JSON.stringify({findings:[opinion],limitations:[],status:'passed'}),wire([{...opinion,region:{x:.9,y:0,width:.3,height:.2}}]),wire([{...opinion,screenshotRef:'V3'}]),wire([{...opinion,tool:'write_file'}]),'```json\n'+wire()+'\n```']){const receipt=await f.make(raw);assert.equal(receipt.findings.length,0);assert.equal(receipt.status,'unverified');assert.match(receipt.reason!,/无效/);}
});
test('即使重新计算hash，损坏receipt身份或错误候选不能被当作修稿授权',async()=>{
 const f=await fixture(),receipt=await f.make(),{resultHash:_,...body}=receipt;
 for(const corrupt of [{...body,completion:'invalid'},{...body,completion:'interrupted'},{...body,findings:[{...body.findings[0],screenshotHash:hash('wrong')}]},{...body,findings:[{...body.findings[0],repairEligible:false}]},{...body,findings:[{...body.findings[0],category:'business_fact'}]},{...body,images:[{...body.images[0],receipt:{...body.images[0].receipt,bytes:-1}}]}]){const value=sealVisualReview(corrupt as any);assert.equal(verifyVisualReview(value),false);assert.equal(repairableTaskFailures({...f.report,visualReview:value}).length,0);await assert.rejects(f.domain.attachVisualReview('run',f.report.id,value),/BINDING_MISMATCH/);}
});
test('错误成果/截图版本拒绝输入，调用期间版本变化不提交审查',async()=>{
 const f=await fixture();assert.throws(()=>visualReviewInput(f.report,[{...f.image,receipt:{...f.image.receipt,entryHash:hash('other')}}],[]),/BINDING_INVALID/);assert.throws(()=>visualReviewInput(f.report,[{...f.image,receipt:{...f.image.receipt,contentHash:hash('other')}}],[]),/BINDING_INVALID/);
 let checks=0;await assert.rejects(f.make(wire(),async()=>{if(++checks===2)throw Error('VERSION_CHANGED');}),/VERSION_CHANGED/);
 const controller=new AbortController();controller.abort();await assert.rejects(reviewPrototypeVisual({report:f.report,images:[f.image],requests:[],reviewer:{modelId:'fixture',provider:'fixture',protocol:'fixture'},assertCurrent:async()=>{},signal:controller.signal,review:async()=>{throw Error('must not call');}}),/CANCELLED/);
});
test('重启保留审查；成果/依赖改变或撤权隐藏所有旧截图意见且原报告留存',async()=>{
 for(const change of ['content','dependency','permission'] as const){const f=await fixture(),receipt=await f.make();await f.domain.attachVisualReview('run',f.report.id,receipt);const resumed=new TaskAcceptanceDomain(f.options);assert.equal((await resumed.get('run')).latestReport!.visualReview!.findings.length,1);if(change==='content')f.setContent('changed');else if(change==='dependency')f.setDep();else f.revoke();const view=(await resumed.get('run')).latestReport!;assert.notEqual(view.versionState,'current');assert.equal(view.status,'unverified');assert.deepEqual(view.visualReview!.findings,[]);assert.deepEqual(view.visualReview!.images,[]);assert.equal(verifyVisualReview(view.visualReview!),true);assert.equal(resumed.listReports('run')[0].visualReview!.findings.length,1);}
});
test('模型报告有界保留视觉候选和身份，旧状态不输出候选正文',async()=>{
 const f=await fixture(),receipt=await f.make(),report=await f.domain.attachVisualReview('run',f.report.id,receipt),projection=taskModelReportProjection(report) as any;
 assert.equal(projection.visualReview.findings.length,1);assert.equal(projection.visualReview.images[0].contentHash,hash('pixels'));assert.equal(projection.visualReview.images[0].receipt,undefined);assert.equal(taskModelVisualReviewSummary(report).candidateCount,1);assert.equal(taskModelVisualReviewSummary(report,false).candidateCount,0);
 f.setDep();const stale=(await f.domain.get('run')).latestReport!;assert.equal(taskModelVisualReviewSummary(stale).candidates.length,0);assert.doesNotMatch(JSON.stringify(taskModelReportProjection(stale)),/按钮被浮层遮挡/);
});
test('Service未知视觉/预算不足不送模型；同版本真实image参数进入审查且记录输入数；独立超时不取消父任务',async t=>{
 const f=await fixture(),operations:unknown[]=[],run={id:'run',conversationId:'conversation',modelLimits:{contextWindow:65536,maxTokens:12000}},domain=f.domain;
 const service=Object.create(Service.prototype) as any;Object.assign(service,{state:{root:'root'},runControllers:new Map(),taskRun:()=>run,taskDomain:()=>domain,runIsActive:()=>true,assertBusinessAccess:()=>{},scrub:String,capabilityBroker:{execute:async(_request:unknown,fn:()=>Promise<unknown>)=>fn()},prototypes:()=>({screenshotForAgent:async()=>({receipt:f.image.receipt,image:{type:'image',mimeType:'image/png',data:'REAL-FIXTURE-PIXELS'}})}),store:{operation:(...args:unknown[])=>operations.push(args)}});
 let calls=0,charges=0;const session={reviewContent:async(_prompt:string,_signal:unknown,images:unknown[])=>{calls++;assert.deepEqual(images,[{type:'image',mimeType:'image/png',data:'REAL-FIXTURE-PIXELS'}]);return{text:wire(),durationMs:1,stopReason:'stop'};}};
 const model={id:'fixture',protocol:'openai-completions',supportsVision:undefined};let report=await service.finishTaskVisualReview('run',f.report,session,model,true,()=>{charges++;});assert.equal(calls,0);assert.match(report.visualReviewNotice,/未确认支持视觉/);assert.equal(report.status,'unverified');
 report=await service.finishTaskVisualReview('run',f.report,session,{...model,supportsVision:true},false,()=>{charges++;});assert.equal(calls,0);assert.match(report.visualReviewNotice,/预算不足/);
 report=await service.finishTaskVisualReview('run',f.report,session,{...model,supportsVision:true},true,()=>{charges++;});assert.equal(calls,1);assert.equal(charges,1);assert.equal(report.visualReview!.findings.length,1);assert.match(JSON.stringify(operations),/imageInputCount\\?":1/);
 const realTimeout=AbortSignal.timeout.bind(AbortSignal);t.mock.method(AbortSignal,'timeout',(ms:number)=>{assert.equal(ms,60000);return realTimeout(5);});
 const slow={reviewContent:async(_prompt:string,signal:AbortSignal)=>new Promise((_,reject)=>{const fallback=setTimeout(()=>reject(Error('missing visual timeout')),500);signal.addEventListener('abort',()=>{clearTimeout(fallback);reject(signal.reason);},{once:true});})};
 report=await service.finishTaskVisualReview('run',f.report,slow,{...model,supportsVision:true},true,()=>{charges++;});assert.equal(report.status,'unverified');assert.match(report.visualReviewNotice,/VISUAL_REVIEW_TIMEOUT/);assert.equal(service.runIsActive('run'),true);assert.match(JSON.stringify(operations),/completion\\?":\\?"timeout/);
});

test('task hierarchy policy reaches the actual review callback with immutable request and screenshot identities, and policy bytes participate in inputHash',async()=>{
 const f=await fixture(),text='整体改善录入表单：必要输入按任务顺序组织，主动作容易找到；界面不放制作声明，保留字段与业务行为。';
 f.domain.appendRequest('run',{id:'improve',source:'follow_up',text});const report=await f.domain.validate('run'),requests=f.domain.getContract('run').requests.map(({id,text})=>({id,text}));
 const contractBefore=structuredClone(f.domain.getContract('run'));let captured='';const receipt=await reviewPrototypeVisual({report,images:[f.image],requests,reviewer:{modelId:'fixture',provider:'fixture',protocol:'fixture'},assertCurrent:async()=>{},review:async prompt=>{captured=prompt;return{text:wire([{...opinion,category:'hierarchy',explanation:'主动作与必要输入分区层级相同，难以识别完成入口',suggestion:'在绑定分区内强调主动作和必要输入层级'}]),stopReason:'stop',durationMs:1};}});
 const evidence=JSON.parse(captured.split('<untrusted_visual_evidence>\n')[1].split('\n</untrusted_visual_evidence>')[0]),projection=JSON.parse(evidence.requests);
 assert.deepEqual(projection.requests.map((r:any)=>({id:r.id,text:r.text})),requests);assert.equal(evidence.screenshots[0].receipt.entryHash,report.targets[0].target.contentHash);assert.equal(evidence.screenshots[0].receipt.screenshotId,'screen');assert.equal(evidence.screenshots[0].receipt.contentHash,hash('pixels'));assert.equal(evidence.screenshots[0].receipt.readAt,undefined);
 const hashBody={contractHash:report.contractHash,identities:evidence.screenshots,requestText:evidence.requests,requestsHash:hash(JSON.stringify(requests)),requestSelection:'initial-and-recent-1',version:VISUAL_REVIEW_VERSION,policyHash:hash(VISUAL_REVIEW_POLICY)};
 assert.equal(receipt.inputHash,hash(JSON.stringify(hashBody)));assert.notEqual(receipt.inputHash,hash(JSON.stringify({...hashBody,policyHash:hash('old local-only policy')})));
 assert.match(captured,/任务入口、必要输入与主动作/);assert.match(captured,/截图外.*焦点.*只能标为未验证/);assert.match(captured,/不要求原型增加免责声明区域/);
 const attached=await f.domain.attachVisualReview('run',report.id,receipt);assert.equal(attached.status,'needs_human');assert.equal(attached.automaticStatus,'passed');assert.equal(receipt.findings[0].category,'hierarchy');assert.equal(receipt.findings[0].entryHash,report.targets[0].target.contentHash);assert.deepEqual(f.domain.getContract('run'),contractBefore);
 const repair=taskRepairPrompt(attached,1),payload=JSON.parse(repair.split('<untrusted_host_check_observations>\n')[1].split('\n</untrusted_host_check_observations>')[0]);
 assert.equal(payload.contractHash,report.contractHash);assert.deepEqual(payload.targets,report.targets);assert.deepEqual(payload.issues[0].visualOpinions,[receipt.findings[0]]);assert.match(repair,/绑定的可见分区及必要关联布局/);assert.match(repair,/不授权随意重做整页/);assert.match(repair,/不硬要求保留在界面/);assert.doesNotMatch(repair,/不得删减业务规则、真实\/模拟标记/);
});

test('task hierarchy candidates keep high confidence, version and wire-schema gates; uncertain candidates never become repair authorization',async()=>{
 const f=await fixture(),criteria=structuredClone(f.domain.getContract('run').criteria);
 for(const confidence of ['high','medium','low'] as const){const receipt=await f.make(wire([{...opinion,category:'hierarchy',confidence}])),attached=await f.domain.attachVisualReview('run',f.report.id,receipt);
  assert.equal(verifyVisualReview(receipt),true);assert.equal(receipt.findings[0].repairEligible,confidence==='high');assert.equal(repairableTaskFailures(attached).length,confidence==='high'?1:0);assert.equal(attached.status,'needs_human');assert.equal(attached.automaticStatus,'passed');assert.deepEqual(f.domain.getContract('run').criteria,criteria);
  assert.equal(repairableTaskFailures({...attached,versionState:'stale'}).length,0);assert.equal(repairableTaskFailures({...attached,versionState:'unavailable'}).length,0);
 }
 const invalid=await f.make(wire([{...opinion,category:'task_efficiency',confidence:'high',authorized:true}]));assert.equal(invalid.completion,'invalid');assert.equal(invalid.findings.length,0,'No new response categories or model-supplied authority are accepted');
});

test('v1 receipt remains hash-verifiable history; Service refresh hides old rules without rereading images, while v2 uses current image/version checks',async()=>{
 const f=await fixture(),current=await f.make(),{resultHash:_,...body}=current,old=sealVisualReview({...body,version:'slash-visual-review-1'}),oldBytes=JSON.stringify(old);
 assert.equal(visualReviewReceiptSchema.safeParse(old).success,true);assert.equal(verifyVisualReview(old),true);assert.equal(isCurrentVisualReview(old),false);assert.equal(repairableTaskFailures({...f.report,visualReview:old}).length,0);assert.equal(taskModelVisualReviewSummary({...f.report,visualReview:old}).candidateCount,0);assert.doesNotMatch(JSON.stringify(taskModelReportProjection({visualReview:old})),/按钮被浮层遮挡/);
 assert.equal(isCurrentVisualReview(null),false);assert.equal(isCurrentVisualReview(undefined),false);assert.deepEqual(taskModelReportProjection({visualReview:null}),{visualReview:{status:'unverified',versionState:'unavailable',notice:'当前视觉证据无法核对，旧意见已隐藏'}});
 await f.domain.attachVisualReview('run',f.report.id,old);
 let reads=0;const service=Object.create(Service.prototype) as any;Object.assign(service,{state:{root:'root'},assertBusinessAccess:()=>{},prototypes:()=>({screenshotForAgent:async()=>{reads++;return{receipt:f.image.receipt};}})});
 const refreshed=await service.refreshTaskVisualReview('run',old);assert.equal(refreshed.versionState,'stale');assert.equal(refreshed.version,'slash-visual-review-1');assert.equal(refreshed.status,'unverified');assert.equal(refreshed.findings.length,0);assert.equal(refreshed.images.length,0);assert.equal(verifyVisualReview(refreshed),true);assert.match(refreshed.reason,/规则已变化/);assert.equal(reads,0);assert.equal(JSON.stringify(old),oldBytes);
 f.options.refreshVisualReview=receipt=>service.refreshTaskVisualReview('run',receipt);
 const derived=(await f.domain.get('run')).latestReport!;assert.equal(derived.versionState,'stale');assert.equal(derived.automaticStatus,'passed');assert.equal(derived.results[0].status,'passed','Original DOM observation is not relabeled failed');assert.equal(derived.visualReview!.findings.length,0);
 assert.equal(JSON.stringify(f.domain.listReports('run')[0].visualReview),oldBytes,'Reading never rewrites historical receipt');
 assert.deepEqual(await service.refreshTaskVisualReview('run',current),current);assert.equal(reads,1);assert.equal(isCurrentVisualReview(current),true);
 service.assertBusinessAccess=()=>{throw Error('PERMISSION_DENIED');};await assert.rejects(service.refreshTaskVisualReview('run',current),/PERMISSION_DENIED/);assert.equal(reads,1);
});
