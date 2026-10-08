import {composerTrigger,composerPopup,chooseComposerModel,chooseComposerWorkflow,chooseComposerPermission,ensureLegacyFixtureMounts} from './composer-smoke-helpers.mjs';
import {_electron as electron} from 'playwright';
import {createServer} from 'node:http';
import {randomUUID} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {Store} from '../dist/main/store.js';
import {Service} from '../dist/main/service.js';

// Fresh, isolated data; this script never reads a user's model keys or publishes.
const root=process.cwd();
const development=process.argv.includes('--dev');
const output=path.join(root,'.test-data',`pm-focus-${Date.now()}`);
const profile=path.join(output,'profile');
const workspace=path.join(output,'workspace');
await fs.mkdir(output,{recursive:true});
const store=new Store(profile);
const service=new Service(store,()=>'',()=>{});
await service.workspace(workspace);
await ensureLegacyFixtureMounts(service);
const conversationId=service.conversation(undefined,'客户准入方案');
const reference=service.state.mounts.find(item=>item.name==='参考资料');
const artifacts=service.state.mounts.find(item=>item.name==='产出材料');
const prototypes=service.state.mounts.find(item=>item.name==='原型');
const processes=service.state.mounts.find(item=>item.name==='过程文件');
assert.ok(reference&&artifacts&&prototypes&&processes);
const meetingFile='现场访谈.md';
const meetingContent='# 客户准入现场访谈\n\n客户原话：退回必须填写原因。\n已确认：审批记录需要保留操作者和时间。\n未确认：复核时限待确认。\n现场证据编号：FIELD-20261002。\n';
await fs.writeFile(path.join(reference.path,meetingFile),meetingContent);
const prdFile='客户准入PRD.md';
await fs.writeFile(path.join(artifacts.path,prdFile),'# 客户准入 PRD\n\n'+Array.from({length:34},(_,index)=>`## 规则 ${index+1}\n\n退回必须填写原因。操作记录保留操作者与时间。复核时限待确认。\n`).join('\n'));
const previousPrd=await fs.readFile(path.join(artifacts.path,prdFile),'utf8');
const revision=await service.files.draft(artifacts.id,prdFile,previousPrd+'\n## 本轮补充\n退回理由至少五个字。\n','fixture-revision');
service.state.changes.unshift(revision);await service.apply(revision.id);
const prototypeFile='客户准入.html';
const prototypeContent='<!doctype html><html lang="zh"><head><meta charset="utf-8"><title>客户准入</title><style>body{font:16px system-ui;padding:32px}button,input{font:inherit;padding:10px;margin:8px}#message{min-height:32px}</style></head><body><main><h1>客户准入</h1><form id="approval"><label>退回原因<input id="reason" required></label><button id="reject" type="submit">退回申请</button></form><p id="message" role="status">等待处理</p></main><script>document.querySelector("#approval").addEventListener("submit",event=>{event.preventDefault();document.querySelector("#message").textContent="已退回："+document.querySelector("#reason").value;});</script></body></html>';
await fs.writeFile(path.join(prototypes.path,prototypeFile),prototypeContent);
const flowFile='准入流程.drawio';
await fs.writeFile(path.join(processes.path,flowFile),'<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/><mxCell id="start" value="开始" style="shape=ellipse;" vertex="1" parent="1"><mxGeometry x="20" y="20" width="100" height="60" as="geometry"/></mxCell><mxCell id="end" value="结束" style="shape=ellipse;" vertex="1" parent="1"><mxGeometry x="200" y="20" width="100" height="60" as="geometry"/></mxCell><mxCell id="edge" value="提交" edge="1" parent="1" source="start" target="end"><mxGeometry relative="1" as="geometry"/></mxCell></root></mxGraphModel>');
const prd=await service.registerArtifact(conversationId,{mountId:artifacts.id,relativePath:prdFile,kind:'document',title:'客户准入 PRD'});
const prototype=await service.registerArtifact(conversationId,{mountId:prototypes.id,relativePath:prototypeFile,kind:'prototype',title:'客户准入原型'});
await service.registerArtifact(conversationId,{mountId:processes.id,relativePath:flowFile,kind:'flow',title:'客户准入流程'});
service.linkArtifacts(conversationId,{fromArtifactId:prototype.id,toArtifactId:prd.id,relation:'implements',certainty:'confirmed',rationale:'准入主流程',locator:'退回申请'});
const review=await service.createReview(conversationId,{artifactId:prd.id,title:'原方案检查'});
const issue=service.addReviewIssue(review.id,{title:'确认复核时限',description:'访谈未给出具体时限。',locator:'规则 1',basis:'现场访谈',impact:'验收条件待确定'});
await service.recordRequirement(conversationId,{title:'保留退回原因',summary:'现场访谈确认需保留原因。',status:'needs_clarification',sources:[{id:'source-interview',mountId:reference.id,relativePath:meetingFile}],assumptions:[],pendingQuestions:[{id:'question-sla',question:'复核时限是多少？'}],confirmedFacts:[{id:'fact-reason',text:'退回必须填写原因',sourceRefIds:['source-interview'],confirmedBy:'source'}]});
const archivedId=service.conversation(undefined,'归档可删除示例');service.conversation(archivedId,undefined,true);
store.set('app-preferences',{shareLockTtlMs:420000,parallelReadOnlyLimit:3});
service.save();store.close();

// A deterministic OpenAI-compatible fixture exercises the real Pi session and
// tool gateway. This is integration evidence, not a real-provider quality claim.
const requests=[];
const server=createServer(async(req,res)=>{
 try{
  let body='';for await(const chunk of req)body+=chunk;
  const data=JSON.parse(body);requests.push(data);
  const messages=data.messages??[];
  const lastUser=messages.findLastIndex(item=>item.role==='user');
  const hasTool=messages.slice(lastUser+1).some(item=>item.role==='tool');
  const isWork=JSON.stringify(messages.slice(lastUser)).includes('FIELD-20261002');
  const tool=isWork&&!hasTool?{id:'call_'+randomUUID(),type:'function',function:{name:'write_draft',arguments:JSON.stringify({mountId:artifacts.id,path:'会议整理.md',content:'# 会议整理\n\n## 已确认\n退回必须填写原因。审批记录需要保留操作者和时间。\n\n## 待确认\n复核时限待确认。\n\n来源：现场访谈.md；FIELD-20261002。\n'})}}:undefined;
  const reply={role:'assistant',...(tool?{tool_calls:[tool],content:null}:{content:'已整理现场访谈，并保留来源与待确认事项。测试模型只用于验证应用流程。'})};
  const metadata={id:'chatcmpl-'+randomUUID(),created:Math.floor(Date.now()/1000),model:data.model};
  if(data.stream){
   res.writeHead(200,{'content-type':'text/event-stream'});
   const delta=tool?{role:'assistant',tool_calls:[{index:0,...tool}]}:reply;
   res.write('data: '+JSON.stringify({...metadata,object:'chat.completion.chunk',choices:[{index:0,delta,finish_reason:null}]})+'\n\n');
   res.write('data: '+JSON.stringify({...metadata,object:'chat.completion.chunk',choices:[{index:0,delta:{},finish_reason:tool?'tool_calls':'stop'}],usage:{prompt_tokens:40,completion_tokens:30,total_tokens:70}})+'\n\n');
   res.end('data: [DONE]\n\n');
  }else{res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({...metadata,object:'chat.completion',choices:[{index:0,message:reply,finish_reason:tool?'tool_calls':'stop'}],usage:{prompt_tokens:40,completion_tokens:30,total_tokens:70}}));}
 }catch(error){res.writeHead(500);res.end(String(error));}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const port=server.address().port;
let app;
const evidence={integrationModel:'local deterministic fixture using real Pi runtime',pageErrors:[],checks:[]};
async function launch(){
 const common={cwd:root,env:{...process.env,PM_SLASH_DATA_DIR:profile}};
 app=await electron.launch(development?{...common,args:['.']}:{...common,executablePath:path.join(root,'release','win-unpacked','slash.exe')});
 const page=await app.firstWindow();page.on('pageerror',error=>evidence.pageErrors.push(error.message));await page.locator('.brand').waitFor();return page;
}
function check(name){evidence.checks.push(name);console.log('PASS '+name);}
try{
 const page=await launch();
 const call=async request=>{const response=await page.evaluate(value=>window.pm.request(value),request);if(!response.ok)throw Error(response.error);return response.data;};
 const previewAction=async name=>{const preview=page.locator('.preview');const action=preview.getByRole('button',{name,exact:true});if(!await action.isVisible())await preview.locator('.preview-more > summary').click();await action.click();};
 await call({type:'modelUpsert',model:{provider:'fixture',name:'本地集成测试',baseUrl:`http://127.0.0.1:${port}/v1`,modelId:'fixture-model',protocol:'openai-completions'},key:'fixture-only-not-a-secret'});
 const models=await call({type:'models'});const entry=models.groups.flatMap(group=>group.models).find(model=>model.provider==='fixture');assert.ok(entry);
 await call({type:'modelDefault',id:entry.id});
 // Navigation and settings controls must remain reachable at laptop sizes.
 await app.evaluate(({BrowserWindow})=>{const w=BrowserWindow.getAllWindows()[0];w.unmaximize();w.setSize(1366,900);});
 await page.getByRole('button',{name:'设置',exact:true}).first().waitFor();
 assert.equal(await page.locator('.sidebar-rail button').filter({hasText:/评审|决策/}).count(),0);
 check('精简导航与设置入口');
 const work=page.getByLabel('待确认与检查问题',{exact:true});
 await work.locator('summary').first().click();
 await work.getByText('复核时限是多少？',{exact:false}).waitFor();
 await work.getByText('确认复核时限',{exact:true}).waitFor();
 const answerForm=work.locator('form').filter({has:page.locator('textarea[aria-label^="答复"]')});
 await answerForm.locator('textarea').fill('工作日 24 小时内处理');await answerForm.getByRole('button').click();
 await work.getByRole('button',{name:'包含已处理'}).click();
 await work.getByText(/工作日 24 小时内处理/).waitFor();
 check('检查问题在当前会话可见');
 await work.locator('summary').first().click();
 await page.screenshot({path:path.join(output,'workspace.png')});
 // Advanced defaults do not erase existing configuration when merely opened.
 const preferencesBefore=await call({type:'appPreferences'});
 await page.getByRole('button',{name:'设置',exact:true}).first().click();
 const settings=page.getByRole('dialog',{name:'设置'});await settings.waitFor();
 assert.equal(await settings.locator('.settings-nav button').count(),8);
 assert.equal(await settings.locator('.settings-nav button').filter({hasText:'任务与回执'}).count(),0);
 for(const label of ['通用','系统提示词','工作空间','模型','质量检查','连接','权限与审批','归档会话']){
  await settings.locator('.settings-nav button').filter({hasText:label}).first().click();
  const overflow=await settings.locator('.settings-body').evaluate(el=>el.scrollWidth-el.clientWidth);assert.ok(overflow<=1,`${label} overflow ${overflow}`);
 }
 await settings.locator('.settings-nav button').filter({hasText:'工作空间'}).click();
 assert.equal(await settings.locator('.settings-section:not([hidden]) .settings-advanced').getAttribute('open'),null);
 await settings.locator('.settings-section:not([hidden]) .settings-advanced > summary').click();
 assert.equal(await settings.getByLabel('共享锁有效期').inputValue(),'420000');
 assert.deepEqual(await call({type:'appPreferences'}),preferencesBefore);
 await page.screenshot({path:path.join(output,'settings.png')});
 await settings.locator('.settings-nav button').filter({hasText:'归档会话'}).click();
 page.once('dialog',dialog=>dialog.accept());
 await settings.locator('.task').filter({hasText:'归档可删除示例'}).getByRole('button',{name:'删除',exact:true}).click();
 await settings.getByText('暂无归档会话').waitFor();
 await settings.getByRole('button',{name:'关闭设置'}).click();
 check('设置分类布局、高级默认收起、参数保留和归档删除');
 // Verify a real interaction before element-selection mode intercepts clicks.
 await page.getByRole('button',{name:'成果',exact:true}).first().click();
 await page.locator('.folder-card').filter({hasText:'原型'}).click();
 await page.locator('.file-row').filter({hasText:prototypeFile}).getByRole('button',{name:'阅读',exact:true}).click();
 const frame=page.frameLocator('.preview iframe');
 await frame.locator('#reject').click();assert.equal(await frame.locator('#message').innerText(),'等待处理');
 await frame.locator('#reason').fill('材料不完整');await frame.locator('#reject').click();
 assert.match(await frame.locator('#message').innerText(),/已退回：材料不完整/);
 assert.equal(await frame.locator('body').evaluate(()=>typeof window.pm),'undefined');
 const requestCount=requests.length;
 await frame.locator('body').evaluate((_,port)=>{const form=document.createElement('form');form.method='POST';form.action=`http://127.0.0.1:${port}/forbidden-form`;document.body.append(form);form.submit();form.remove();},port);
 await new Promise(resolve=>setTimeout(resolve,100));assert.equal(requests.length,requestCount,'prototype form escaped preview CSP');
 await page.getByRole('button',{name:'选择元素',exact:true}).click();
 await page.getByRole('button',{name:'退出点选',exact:true}).waitFor();
 await frame.locator('#reject').click();
 await page.locator('.selection-card').getByRole('button',{name:'加入会话',exact:true}).click();
 assert.match(await page.getByLabel('描述你的任务').inputValue(),/选中范围/);
 await previewAction('基于原型补 PRD');
 assert.match(await page.getByLabel('任务上下文',{exact:true}).innerText(),/原型/);
 // Popovers should anchor to the trigger, remain in the viewport, and be custom.
 for(const label of ['选择模型','Agent 模式','运行权限模式']){
  const select=composerTrigger(page,label);await select.click();
  const list=composerPopup(page,label);await list.waitFor();
  const [a,b]=await Promise.all([select.boundingBox(),list.boundingBox()]);const viewport=page.viewportSize()||await page.evaluate(()=>({width:innerWidth,height:innerHeight}));
  assert.ok(a&&b&&b.x>=0&&b.y>=0&&b.x+b.width<=viewport.width+1&&b.y+b.height<=viewport.height+1,`${label} outside viewport`);
  assert.ok(b.y+b.height<=a.y+3||b.y>=a.y+a.height-3,`${label} overlaps trigger`);
  await page.keyboard.press('Escape');
 }
 await page.screenshot({path:path.join(output,'prototype.png')});
 check('可点击原型、表单校验、元素引用、原型补 PRD、压缩后的选框');
 await page.getByRole('button',{name:'关闭预览',exact:true}).click();
 await page.getByRole('button',{name:'成果',exact:true}).first().click();
 await page.locator('.folder-card').filter({hasText:'产出材料'}).click();
 await page.locator('.file-row').filter({hasText:prdFile}).getByRole('button',{name:'阅读',exact:true}).click();
 await page.locator('.document-reader .markdown').waitFor();
 const reader=await page.locator('.document-reader').evaluate(el=>({height:el.clientHeight,scroll:el.scrollHeight,overflow:getComputedStyle(el).overflowY}));
 assert.ok(reader.height>0&&reader.scroll>reader.height&&reader.overflow==='auto');
 await previewAction('受影响内容');
 await page.getByRole('list',{name:'受影响内容清单'}).getByText('客户准入原型',{exact:true}).waitFor();
 await previewAction('查看差异');
 await page.getByRole('button',{name:'根据实际差异生成变更说明',exact:true}).click();
 assert.match(await page.getByLabel('任务上下文',{exact:true}).innerText(),/变更说明/);
 const composer=await page.locator('.composer').boundingBox();const windowHeight=await page.evaluate(()=>innerHeight);assert.ok(composer.y+composer.height<=windowHeight+1);
 await page.screenshot({path:path.join(output,'document.png')});
 check('文档独立滚动、真实影响清单、大输入区保持可见');
 await page.getByRole('button',{name:'关闭预览',exact:true}).click();
 await page.locator('.rail-item[aria-label="资源"]').click();
 await page.locator('.folder-card').filter({hasText:'过程文件'}).click();
 await page.locator('.file-row').filter({hasText:flowFile}).getByRole('button',{name:'阅读',exact:true}).click();
 await page.locator('.flow-preview img').waitFor();
 check('过程目录中的流程图在资源中可预览');
 await page.locator('.flow-preview .icon-button').click();
 const toolsToggle=page.getByRole('button',{name:/更多工具/});
 if(await toolsToggle.getAttribute('aria-expanded')!=='true')await toolsToggle.click();
 await page.locator('nav').getByRole('button',{name:/共享文件夹/}).click();
 await page.getByLabel('本机共享环境').waitFor();
 await page.getByRole('button',{name:/连接同事发来的共享/}).click();
 assert.ok(await page.getByLabel('共享盘符').inputValue());
 assert.equal(await page.getByRole('button',{name:'连接并打开网络盘'}).isEnabled(),false);
 check('共享辅助入口、系统检测与缺少邀请时禁用连接');
 await page.getByRole('button',{name:'会话',exact:true}).first().click();
 // Local source picker stays in the conversation and returns chosen files.
 await chooseComposerWorkflow(page,'会议后整理');
 const picker=page.getByRole('dialog',{name:'选择引用资料'});if(!await picker.isVisible()){await composerTrigger(page,'添加').click();await composerPopup(page,'添加').getByRole('button',{name:'引用资料',exact:true}).click();}await picker.waitFor();
 while(await picker.getByRole('option',{selected:true}).count())await picker.getByRole('option',{selected:true}).first().click();
 await picker.getByRole('option').filter({hasText:meetingFile}).click();
 await picker.getByRole('button',{name:'确认引用'}).click();
 await picker.waitFor({state:'hidden'});check('会话内引用真实资料');
 await chooseComposerModel(page,'本地集成测试');
 await chooseComposerPermission(page,'完全访问');
 await page.getByLabel('描述你的任务').fill('整理这份现场访谈，区分已确认、待确认与行动项。');
 await page.getByRole('button',{name:'发送',exact:true}).click();
 let runId;const startDeadline=Date.now()+10000;
 while(Date.now()<startDeadline){const current=await call({type:'state'});runId=current.runs.find(item=>item.conversationId===conversationId&&item.workflow?.kind==='meeting')?.id;if(runId)break;await new Promise(resolve=>setTimeout(resolve,100));}
 assert.ok(runId,'composer did not start the selected workflow');
 const deadline=Date.now()+45000;let state,run;
 while(Date.now()<deadline){state=await call({type:'state'});run=state.runs.find(item=>item.id===runId);if(run&&['succeeded','failed','cancelled'].includes(run.status))break;await new Promise(resolve=>setTimeout(resolve,100));}
 assert.equal(run?.status,'succeeded',run?.error||`run ${runId} did not finish`);
 assert.equal(run.workflow?.kind,'meeting');assert.ok(run.workflow.receipts?.some(receipt=>receipt.path===meetingFile&&receipt.contentHash));
 assert.ok(requests.some(request=>JSON.stringify(request.messages).includes('FIELD-20261002')),'real source missing from model context');
 const draft=state.changes.find(change=>change.runId===runId&&change.path==='会议整理.md');assert.ok(draft);assert.equal(draft.status,'pending');assert.match(draft.content,/待确认/);
 check('真实 Pi 工作流读取来源→工具草稿→可追溯回执');
 // Isolated model selection, source hashes and draft survive restart.
 await app.close();app=undefined;
 const restarted=await launch();
 const restored=await restarted.evaluate(()=>window.pm.request({type:'state'}));assert.ok(restored.ok);
 assert.ok(restored.data.runs.find(item=>item.id===runId)?.workflow?.receipts?.length);
 assert.ok(restored.data.changes.some(item=>item.id===draft.id));
 check('工作流和草稿重启恢复');
 await restarted.screenshot({path:path.join(output,'workflow.png')});
 assert.deepEqual(evidence.pageErrors,[]);
 evidence.status='passed';evidence.output=output;
 await fs.writeFile(path.join(output,'result.json'),JSON.stringify(evidence,null,2));
 console.log(JSON.stringify({status:evidence.status,output,checks:evidence.checks}));
}catch(error){
 evidence.status='failed';evidence.error=String(error);
 if(app){const windows=app.windows();if(windows[0])await windows[0].screenshot({path:path.join(output,'failure.png')}).catch(()=>{});}
 await fs.writeFile(path.join(output,'result.json'),JSON.stringify(evidence,null,2));throw error;
}finally{if(app)await app.close();await new Promise(resolve=>server.close(resolve));}

