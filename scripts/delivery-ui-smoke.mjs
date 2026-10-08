import {composerTrigger,composerPopup,chooseComposerModel,chooseComposerWorkflow,chooseComposerPermission,ensureLegacyFixtureMounts} from './composer-smoke-helpers.mjs';
import {_electron as electron} from 'playwright';
import {randomUUID} from 'node:crypto';
import {createServer} from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {Store} from '../dist/main/store.js';
import {Service} from '../dist/main/service.js';

// Real persisted domain fixtures and Electron UI, using only a fresh profile.
// Only the local deterministic HTTP model receives send requests. Build first;
// this script never builds or packages, publishes, or changes user profiles.
const root=process.cwd();
const baseline=process.argv.includes('--baseline');
const packaged=process.argv.includes('--packaged');
const settingsSaveOnly=process.argv.includes('--settings-save-only');
const output=path.join(root,'.test-data',`delivery-ui-${packaged?'packaged':'development'}-${Date.now()}`);
const profile=path.join(output,'profile');
const workspace=path.join(output,'客户准入项目');
const alternateWorkspace=path.join(output,'另一个项目');
await fs.mkdir(output,{recursive:true});
const store=new Store(profile);
const service=new Service(store,()=>'',()=>{});
await service.workspace(alternateWorkspace);
await ensureLegacyFixtureMounts(service);
service.conversation(undefined,'另一个项目的会话');
await service.workspace(workspace);
await ensureLegacyFixtureMounts(service);
const conversationId=service.conversation(undefined,'客户准入方案');
const now=new Date().toISOString();
const conversation=service.state.conversations.find(item=>item.id===conversationId);
conversation.messages.push(
 {role:'user',time:now,text:'请根据客户准入现场访谈，整理退回规则、权限与验收条件，并核对原型和 PRD。'},
 {role:'assistant',time:now,text:'# 客户准入方案\n\n已整理现场访谈、权限规则和页面说明。退回必须填写原因；审批记录保留操作者与时间。\n\n## 规则与验收\n\n| 场景 | 规则 | 验收 |\n| --- | --- | --- |\n| 退回申请 | 原因至少五个字 | 必填并保存 |\n| 审批记录 | 保留操作者与时间 | 可查询 |\n\n## 待确认\n\n复核时限仍需业务方确认。\n\n资料路径示例：`参考资料/客户准入现场访谈与跨部门审批权限记录.md`。'},
);
const runId=randomUUID();
service.state.runs.unshift({id:runId,conversationId,status:'succeeded',phase:'completed',mode:'build',permissionMode:'standard',startedAt:now,updatedAt:now,finishedAt:now,attempt:1,input:conversation.messages[0].text,plan:{status:'completed',source:'heuristic',createdAt:now,completedAt:now,steps:['读取授权资料并核对来源','整理原型与 PRD 的规则','检查验收条件与交付成果']}});
const mount=name=>service.state.mounts.find(item=>item.name===name);
const prdFile='客户准入PRD.md';
const prototypeFile='客户准入.html';
const referenceFile='现场访谈.md';
await fs.writeFile(path.join(mount('参考资料').path,referenceFile),'# 现场访谈\n\n退回需要填写原因，复核时限待确认。\n');
await fs.appendFile(path.join(workspace,'AGENTS.md'),'\n# 工作区规则\n\n以真实来源为准，缺失业务规则应标为待确认。\n');
await fs.writeFile(path.join(mount('产出材料').path,prdFile),'# 客户准入 PRD\n\n| 场景 | 规则 | 验收 |\n| --- | --- | --- |\n| 退回申请 | 原因至少五个字 | 必填并保存 |\n| 审批记录 | 保留操作者与时间 | 可查询 |\n\n'+Array.from({length:40},(_,i)=>`## 规则 ${i+1}\n\n退回必须填写原因。操作记录保留操作者与时间。复核时限待确认。\n`).join('\n'));
await fs.writeFile(path.join(mount('原型').path,prototypeFile),'<!doctype html><html lang="zh"><meta charset="utf-8"><title>客户准入</title><style>body{font:16px system-ui;padding:24px}input,button{font:inherit;padding:8px}label{display:block;margin-bottom:12px}</style><h1>客户准入</h1><form id="approval"><label>退回原因 <input id="reason" required></label><button id="reject">退回申请</button></form><p id="message" role="status">等待处理</p><script>document.querySelector("#approval").onsubmit=e=>{e.preventDefault();document.querySelector("#message").textContent="已退回："+document.querySelector("#reason").value}</script></html>');
await service.registerArtifact(conversationId,{mountId:mount('产出材料').id,relativePath:prdFile,kind:'document',title:'客户准入 PRD'});
await service.registerArtifact(conversationId,{mountId:mount('原型').id,relativePath:prototypeFile,kind:'prototype',title:'客户准入原型'});
const planConversationId=service.conversation(undefined,'待确认的研究方案');
const planRunId=randomUUID();
service.state.conversations.find(item=>item.id===planConversationId).messages.push({role:'user',time:now,text:'先整理可选方案，等待我确认后执行。'});
service.state.runs.unshift({id:planRunId,conversationId:planConversationId,status:'awaiting_plan',phase:'waiting_plan',mode:'plan',permissionMode:'standard',startedAt:now,updatedAt:now,attempt:1,proposal:{status:'pending',summary:'此持久夹具用于检查待确认方案的布局。请选择业务规则与验收范围。',options:[{id:'rules',title:'核对审批规则',steps:['读取访谈来源','列出未确认规则']},{id:'acceptance',title:'整理验收条件',steps:['映射页面行为','准备验收清单']}],selectedOptionIds:['rules'],customText:'',createdAt:now}});
const failedConversationId=service.conversation(undefined,'失败与恢复示例');
const failedRunId=randomUUID();
service.state.conversations.find(item=>item.id===failedConversationId).messages.push({role:'user',time:now,text:'检查来源版本与差异。'});
service.state.runs.unshift({id:failedRunId,conversationId:failedConversationId,status:'failed',phase:'failed',mode:'build',permissionMode:'standard',startedAt:now,updatedAt:now,finishedAt:now,attempt:1,resumable:true,error:'夹具：来源文件在检查期间发生变化，请重新读取版本后继续。'});
service.state.changes.unshift(await service.files.draft(mount('产出材料').id,'待确认规则草稿.md','# 待确认规则\n\n这是隔离测试夹具中的未应用草稿。\n',runId));
const archivedId=service.conversation(undefined,'归档可删除交付示例');service.conversation(archivedId,undefined,true);
service.state.connections.push({id:randomUUID(),name:'隔离本地连接',kind:'mcp',transport:'http',url:'http://127.0.0.1:9/mcp',args:[],enabled:false});
service.save();store.close();

const evidence={status:'running',baseline,packaged,fixture:'Persisted isolated Store/Service messages, succeeded/awaiting_plan/failed Runs and pending ChangeSet are visual fixtures. Running and approval states use actual Pi against a deterministic loopback model. No real cloud, SMB or external publishing.',profile,output,pageErrors:[],checks:[],failures:[],states:[],screenshots:[],networkRequests:[],fonts:[],titlebars:[],popups:[],platformFonts:[],controlStyles:[],modelRequests:[],coverageLimitations:['External CLI/MCP/SMB production integration and real model quality are outside these isolated UI fixtures.']};
evidence.scope=settingsSaveOnly?'Focused packaged UI model/MCP create-edit-save and archive deletion; full layout matrix is a separate evidence run.':'Full three-theme, three-window delivery UI matrix and real UI model/MCP create-edit-save.';
const sockets=new Set();
const server=createServer(async(req,res)=>{
 let body='';for await(const chunk of req)body+=chunk;
 const data=JSON.parse(body);evidence.modelRequests.push({model:data.model,stream:data.stream});
 const prompt=JSON.stringify(data.messages||[]);
 if(prompt.includes('WAIT-RUN-UI')){res.writeHead(200,{'content-type':'text/event-stream'});res.write(': loopback fixture holds a real running session\n\n');return;}
 const tool={id:'call_'+randomUUID(),type:'function',function:{name:'write_draft',arguments:JSON.stringify({mountId:mount('产出材料').id,path:'审批测试草稿.md',content:'# 审批测试\n\n仅位于隔离测试目录。'})}};
 const metadata={id:'chatcmpl-'+randomUUID(),created:Math.floor(Date.now()/1000),model:data.model};
 res.writeHead(200,{'content-type':'text/event-stream'});
 res.write('data: '+JSON.stringify({...metadata,object:'chat.completion.chunk',choices:[{index:0,delta:{role:'assistant',tool_calls:[{index:0,...tool}]},finish_reason:null}]})+'\n\n');
 res.write('data: '+JSON.stringify({...metadata,object:'chat.completion.chunk',choices:[{index:0,delta:{},finish_reason:'tool_calls'}]})+'\n\n');res.end('data: [DONE]\n\n');
});
server.on('connection',socket=>{sockets.add(socket);socket.on('close',()=>sockets.delete(socket));});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const modelBaseUrl=`http://127.0.0.1:${server.address().port}/v1`;
let app,page;
const themes=[['reference','经典瓷白'],['graphite','石墨深色'],['sand','柔和米色']];
const sizes=[[1366,900],[1100,760],[1600,1000]];
const prefix=()=>`${evidence.theme}-${evidence.window.width}x${evidence.window.height}`;
const call=async request=>{const response=await page.evaluate(value=>window.pm.request(value),request);if(!response.ok)throw Error(response.error);return response.data;};
async function verify(name,action){try{await action();evidence.checks.push(`${prefix()}: ${name}`);}catch(error){const screenshotName=`${prefix()}-failed-${name.replace(/[<>:\\|?*\/]/g,'_')}.png`;await page.screenshot({path:path.join(output,screenshotName)}).catch(()=>{});evidence.failures.push({state:prefix(),check:name,error:String(error),screenshot:screenshotName});console.log('FAIL '+prefix()+' '+name+' '+String(error));}}
async function screenshot(name){const file=`${prefix()}-${name}.png`;await page.screenshot({path:path.join(output,file)});evidence.screenshots.push(file);}
async function hitTarget(locator,label){await locator.waitFor({state:'visible'});const geometry=await locator.evaluate(el=>{const r=el.getBoundingClientRect();const target=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return{x:r.x,y:r.y,width:r.width,height:r.height,hit:target===el||el.contains(target),window:{width:innerWidth,height:innerHeight}};});assert.ok(geometry.width>0&&geometry.height>0&&geometry.x>=0&&geometry.y>=0&&geometry.x+geometry.width<=geometry.window.width+1&&geometry.y+geometry.height<=geometry.window.height+1,`${label} clipped: ${JSON.stringify(geometry)}`);assert.ok(geometry.hit,`${label} center covered: ${JSON.stringify(geometry)}`);}
async function layout(name,{composer=false,gutters=false}={}){
 const result=await page.evaluate(()=>{
  const box=el=>{if(!el)return null;const r=el.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom,scrollWidth:el.scrollWidth,clientWidth:el.clientWidth};};
  const messages=document.querySelector('.messages'),message=document.querySelector('.message.assistant');
  const m=box(messages),a=box(message);
  const overflow=[...document.querySelectorAll('.work,.conversation,.composer,.composer-bottom,.page,.settings-body,.preview,.details-pane')].filter(el=>el.getBoundingClientRect().width>0).map(el=>({selector:el.className,...box(el)}));
  const details=document.querySelector('.details-pane');
  return{window:{width:innerWidth,height:innerHeight},document:{width:document.documentElement.clientWidth,scrollWidth:document.documentElement.scrollWidth},composer:box(document.querySelector('.composer')),textarea:box(document.querySelector('textarea[aria-label="描述你的任务"]')),messages:m,message:a,gutters:m&&a?{left:a.x-m.x,right:m.right-a.right}:null,detailsVisible:!!document.querySelector('.work.details-open'),detailsOverlay:details&&['absolute','fixed'].includes(getComputedStyle(details).position)&&!!document.querySelector('.work.details-open'),overflow};
 });
 evidence.states.push({name:`${prefix()}-${name}`,...result});
 await verify(name+' 全局及工作区无横溢',()=>{assert.ok(result.document.scrollWidth<=result.document.width+1,JSON.stringify(result.document));for(const item of result.overflow)assert.ok(item.scrollWidth<=item.clientWidth+1,`${item.selector}: ${item.scrollWidth} > ${item.clientWidth}`);});
 if(composer){await verify(name+' 输入框与操作可见',async()=>{assert.ok(result.composer&&result.composer.bottom<=result.window.height+1&&result.textarea.height>=112,JSON.stringify(result.composer));if(result.detailsOverlay){await hitTarget(page.locator('.details-pane').getByRole('button',{name:'收起详情'}),'overlay收起详情');}else{await hitTarget(page.getByLabel('描述你的任务'),'描述你的任务');for(const label of ['选择模型','Agent 模式','运行权限模式'])await hitTarget(composerTrigger(page,label),label);const send=page.getByRole('button',{name:'发送',exact:true});const action=await send.isVisible()?send:page.getByRole('button',{name:'停止任务',exact:true});await hitTarget(action,'发送或停止任务');}});}
 if(gutters)await verify(name+' 消息左右留白至少20px',()=>{assert.ok(result.gutters&&result.gutters.left>=20&&result.gutters.right>=20,JSON.stringify(result.gutters));});
 await screenshot(name);
}
async function closeSettings(){const close=page.getByRole('button',{name:'关闭设置'});if(await close.isVisible())await close.click();}
async function collapseDetails(){const close=page.locator('.details-pane').getByRole('button',{name:'收起详情'});if(await close.isVisible())await close.click();}
async function openDetails(){const open=page.getByRole('button',{name:'展开详情'});if(await open.isVisible())await open.click();await page.locator('.details-pane').getByRole('button',{name:'收起详情'}).waitFor({state:'visible'});}
async function selectConversation(){await page.locator('.project-conversations > button').filter({hasText:'客户准入方案'}).click();await page.locator('.message.assistant').waitFor();}
async function openFile(folder,file){await page.getByRole('button',{name:'成果',exact:true}).first().click();const back=page.getByRole('button',{name:'返回目录列表'});if(await back.isVisible())await back.click();await page.locator('.folder-card').filter({hasText:folder}).click();await page.locator('.file-row').filter({hasText:file}).getByRole('button',{name:'阅读',exact:true}).click();await page.getByRole('button',{name:'会话',exact:true}).first().click();await page.locator('.preview').waitFor();}
async function projectMenu(name){const current=page.locator('.project-row[aria-current="true"]');await current.click({button:'right'});const menu=page.getByRole('menu');await menu.waitFor();await hitTarget(menu.getByRole('menuitem',{name,exact:true}),name);await menu.getByRole('menuitem',{name,exact:true}).click();await menu.waitFor({state:'hidden'});}
async function fonts(name){
 await page.evaluate(()=>document.fonts.ready);
 const values=await page.evaluate(()=>[...document.querySelectorAll('.welcome h1,.message.assistant .prose p,.composer textarea,.sidebar-main>.new,.settings-heading h1')].filter(el=>el.getBoundingClientRect().width>0).map(el=>({selector:el.className||el.tagName,text:el.textContent?.slice(0,40),fontFamily:getComputedStyle(el).fontFamily,fontSize:getComputedStyle(el).fontSize,lineHeight:getComputedStyle(el).lineHeight})));
 evidence.fonts.push({state:`${prefix()}-${name}`,values});
 await verify(name+' 中文正文与控件无衬线字体',()=>{for(const item of values)assert.ok(/sans-serif/i.test(item.fontFamily)&&!/(Georgia|Times New Roman|宋体|SimSun)/i.test(item.fontFamily),JSON.stringify(item));});
 await verify(name+' Chromium实际使用内置Noto Sans SC字形',async()=>{
  const cdp=await page.context().newCDPSession(page);await cdp.send('DOM.enable');await cdp.send('CSS.enable');
  try{for(const selector of ['.welcome h1','.message.assistant .prose p','.sidebar-main>.new','.composer textarea']){
   if(!await page.locator(selector).first().isVisible())continue;
   const input=selector==='.composer textarea'?page.locator(selector):null,original=input?await input.inputValue():null;
   if(input&&!original)await input.fill('实际字体检查：客户准入审批与验收条件。English 123');
   const {root:doc}=await cdp.send('DOM.getDocument',{depth:-1,pierce:true});const {nodeId}=await cdp.send('DOM.querySelector',{nodeId:doc.nodeId,selector});
   const {fonts:platform}=await cdp.send('CSS.getPlatformFontsForNode',{nodeId});
   if(input&&!platform.length){
    const {node}=await cdp.send('DOM.describeNode',{nodeId,depth:-1,pierce:true});
    const inspect=async current=>{if(current.nodeType===1&&current.nodeId){const found=await cdp.send('CSS.getPlatformFontsForNode',{nodeId:current.nodeId});platform.push(...found.fonts);}for(const child of [...(current.shadowRoots||[]),...(current.children||[])])await inspect(child);};for(const shadow of node.shadowRoots||[])await inspect(shadow);
   }
   if(input&&!original)await input.fill(original);
   evidence.platformFonts.push({state:`${prefix()}-${name}`,selector,fonts:platform});
   assert.ok(platform.some(font=>/Noto Sans SC/i.test(font.familyName)&&font.isCustomFont&&font.glyphCount>0),`${selector}: ${JSON.stringify(platform)}`);
  }}finally{await cdp.detach();}
 });
}
async function selectNamedConversation(title){await page.locator('.project-conversations > button').filter({hasText:title}).click();await page.locator('.run-plan-card').waitFor();}
async function previewAction(label){const preview=page.locator('.preview'),action=preview.getByRole('button',{name:label,exact:true});if(!await action.isVisible())await preview.locator('.preview-more>summary').click();await action.click();}
async function toolPage(label){const toggle=page.getByRole('button',{name:/更多工具/});if(await toggle.getAttribute('aria-expanded')!=='true')await toggle.click();await page.locator('nav').getByRole('button',{name:new RegExp(label)}).click();}
async function runStates(){
 await selectNamedConversation('待确认的研究方案');
 await verify('持久Plan待确认未伪装completed且可编辑',async()=>{
  const before=(await call({type:'state'})).runs.find(item=>item.id===planRunId);assert.equal(before.status,'awaiting_plan');assert.equal(before.proposal.status,'pending');
  await page.getByLabel('自定义方案补充').fill('保留来源和待确认条件');await page.locator('.plan-option').filter({hasText:'整理验收条件'}).locator('input').check();
  await page.waitForFunction(id=>window.pm.request({type:'state'}).then(result=>result.data.runs.find(item=>item.id===id)?.proposal.customText==='保留来源和待确认条件'),planRunId);
  const checkbox=page.locator('.plan-option').filter({hasText:'整理验收条件'}).locator('input');assert.equal(await checkbox.isChecked(),true);
  const sample=()=>checkbox.evaluate(el=>{const css=getComputedStyle(el),after=getComputedStyle(el,'::after');const probe=document.createElement('i');probe.style.backgroundColor=getComputedStyle(el.closest('.app')).getPropertyValue('--theme-accent');document.body.append(probe);const accent=getComputedStyle(probe).backgroundColor;probe.remove();return{accentColor:css.accentColor,checked:el.checked,appearance:css.appearance,background:css.backgroundColor,accent,after:{content:after.content,display:after.display,opacity:after.opacity,borderColor:after.borderColor}};});
  await checkbox.uncheck();const unchecked=await sample();await checkbox.check();const checked=await sample();evidence.controlStyles.push({state:prefix(),label:'Plan checkbox',checked,unchecked});
  if(checked.appearance==='none'){assert.equal(checked.background,checked.accent);assert.notEqual(checked.background,unchecked.background);assert.notEqual(checked.after.content,'none');assert.notEqual(checked.after.display,'none');assert.notEqual(checked.after.opacity,'0');}else assert.notEqual(checked.accentColor,'auto');
  await hitTarget(page.getByRole('button',{name:'确认并开始 Build'}),'Plan确认');
 });await layout('plan-awaiting-confirmation',{composer:true});
 await selectNamedConversation('失败与恢复示例');await page.locator('.run-plan-error').waitFor();await hitTarget(page.getByRole('button',{name:'继续任务'}),'失败继续');await layout('run-failed-recovery',{composer:true});
 await selectConversation();const change=page.locator('.change').filter({hasText:'待确认规则草稿.md'});await change.waitFor();await change.scrollIntoViewIfNeeded();await hitTarget(change.getByRole('button',{name:'查看',exact:true}),'草稿查看');await hitTarget(change.getByRole('button',{name:'应用修改',exact:true}),'草稿应用');await layout('changeset-pending',{composer:true});
 await verify('待应用草稿真实文件尚未写入',async()=>{const state=await call({type:'state'});assert.equal(state.changes.find(item=>item.path==='待确认规则草稿.md').status,'pending');await assert.rejects(fs.stat(path.join(mount('产出材料').path,'待确认规则草稿.md')));});
 for(const [token,targetStatus,name] of [['WAIT-RUN-UI','running','run-running'],['WAIT-APPROVAL-UI','waiting_user','run-waiting-permission']]){
  await page.locator('.sidebar-main>.new').click();const state=await call({type:'state'});const id=state.conversations.find(item=>item.title==='新会话'&&!item.archived)?.id;assert.ok(id);
  const modelId=(await call({type:'models'})).groups.flatMap(group=>group.models).find(item=>item.provider==='fixture').id;
  await call({type:'permissionSet',capability:'artifact_write',decision:'ask'});
  const run=await call({type:'send',id,text:token+'：本地确定性模型驱动的实际 UI 状态，仅用于布局验收。',mode:'build',permissionMode:'standard',modelEntryId:modelId});
  const actualRunId=typeof run==='string'?run:run.id;
  try{
   await page.waitForFunction(({id,status})=>window.pm.request({type:'state'}).then(result=>{const item=result.data.runs.find(item=>item.id===id);return item?.status===status&&(status!=='running'||item.phase==='generating');}),{id:actualRunId,status:targetStatus},{timeout:20000});
   await layout(name,{composer:true});
   if(targetStatus==='waiting_user'){const approvals=await call({type:'pendingApprovals',conversationId:id});assert.ok(approvals.some(item=>item.status==='pending'&&item.capability==='artifact_write'));const approval=page.locator('.approval-card');await approval.waitFor();await approval.scrollIntoViewIfNeeded();for(const action of ['仅这次允许','允许并记住','拒绝'])await hitTarget(approval.getByRole('button',{name:action,exact:true}),action+'审批');await screenshot('permission-approval-card');}
  }finally{await call({type:'cancel',id:actualRunId});await page.waitForFunction(id=>window.pm.request({type:'state'}).then(result=>!['queued','running','waiting_user','cancelling','validating'].includes(result.data.runs.find(item=>item.id===id)?.status)),actualRunId,{timeout:20000});}
 }
 await selectConversation();
}
async function fixedFormActions(form,{save,close,name}){
 const headerBefore=await form.locator('.subdialog-heading').boundingBox();
 const advanced=form.locator('details.advanced');if(await advanced.count()&&await advanced.getAttribute('open')===null)await advanced.locator('summary').click();
 const names=form.getByLabel(name,{exact:true});await names.fill('客户准入与跨部门审批配置_'.repeat(12));
 const input=form.locator('input[type="url"]');if(await input.count())await input.fill('http://127.0.0.1:9/'+('very-long-isolated-layout-fixture/').repeat(25));
 const json=form.locator('textarea.json');if(await json.count())await json.fill(JSON.stringify(Array.from({length:20},(_,i)=>`layout-fixture-${i}`),null,2));
 const headerAfter=await form.locator('.subdialog-heading').boundingBox();assert.ok(headerAfter.height<=headerBefore.height+2,`Long name expanded fixed header: ${JSON.stringify({headerBefore,headerAfter})}`);assert.ok(headerAfter.height<=120,`Header too tall: ${headerAfter.height}`);
 const body=form.locator('.subdialog-body');await body.waitFor();
 const geometry=await body.evaluate(el=>{el.scrollTop=(el.scrollHeight-el.clientHeight)/2;return{scrollTop:el.scrollTop,scrollHeight:el.scrollHeight,clientHeight:el.clientHeight,overflow:getComputedStyle(el).overflowY};});
 // Never scroll an action into view: header and footer must stay exposed while
 // only the content body scrolls, including expanded advanced fields.
 await hitTarget(form.locator('.subdialog-heading h2'),'子表单标题');await hitTarget(form.getByRole('button',{name:close,exact:true}),'子表单关闭');await hitTarget(form.getByRole('button',{name:save,exact:true}),save);await hitTarget(form.getByRole('button',{name:'取消',exact:true}),'子表单取消');
 const overflow=await form.evaluate(el=>[el,...el.querySelectorAll('.subdialog-heading,.subdialog-body,.subdialog-actions,.form-grid')].map(item=>({selector:item.className,scrollWidth:item.scrollWidth,clientWidth:item.clientWidth})));for(const item of overflow)assert.ok(item.scrollWidth<=item.clientWidth+1,JSON.stringify(item));
 evidence.states.push({name:`${prefix()}-${save}-fixed-actions`,geometry,overflow});await screenshot(save+'-fixed-actions-long-content');
 await body.evaluate(el=>{el.scrollTop=el.scrollHeight;});
 for(const label of [save,'取消',close])await hitTarget(form.getByRole('button',{name:label,exact:true}),label+'内容底部固定可用');
}
async function settingsChecks(settings){
 const preferencesBefore=await call({type:'appPreferences'});
 await verify('设置仅七个分类且任务记录保留在会话',async()=>{assert.equal(await settings.locator('.settings-nav button').count(),7);assert.equal(await settings.locator('.settings-nav button').filter({hasText:'任务与回执'}).count(),0);assert.ok((await call({type:'state'})).runs.some(item=>item.id===runId));});
 for(const tab of ['通用','工作空间','模型','质量检查','连接','权限与审批','归档会话']){
  const button=settings.locator('.settings-nav button').filter({hasText:tab}).first();await hitTarget(button,'设置 '+tab);await button.click();
  await verify('设置 '+tab+' 居中且无横溢',async()=>{
   const amount=await settings.locator('.settings-body').evaluate(el=>el.scrollWidth-el.clientWidth);assert.ok(amount<=1,`${tab}: ${amount}`);
   const box=await settings.boundingBox(),viewport=await page.evaluate(()=>({width:innerWidth,height:innerHeight}));assert.ok(box.x>20&&box.y>=36&&box.width<viewport.width-20&&box.height<viewport.height-40,JSON.stringify({box,viewport}));assert.ok(Math.abs(box.x+(box.width/2)-(viewport.width/2))<=3,'settings not centered');
  });await layout('settings-'+tab);
  if(tab==='模型')await verify('模型新增及编辑长表单页脚可达',async()=>{
   for(const edit of [false,true]){
    if(edit)await settings.locator('.model-row').filter({hasText:'本地布局验证'}).getByRole('button',{name:'编辑',exact:true}).click();else await settings.getByRole('button',{name:'添加模型',exact:true}).click();
    const form=settings.locator('.subdialog');await form.waitFor();await layout(edit?'model-edit-form':'model-add-form');
    try{await fixedFormActions(form,{save:'保存模型',close:'关闭模型表单',name:'显示名称'});}finally{await form.getByRole('button',{name:'关闭模型表单',exact:true}).click();await form.waitFor({state:'hidden'});}
   }
  });
  if(tab==='质量检查')await verify('Switch真实设置与状态颜色一致',async()=>{
   const control=settings.getByRole('switch',{name:'在线文档发布前强制质量检查',exact:true});const before=await control.getAttribute('aria-checked');const sample=()=>control.evaluate(el=>({checked:el.getAttribute('aria-checked'),background:getComputedStyle(el).backgroundColor,knob:getComputedStyle(el.firstElementChild).transform}));
   const first=await sample();
   try{await control.click();await page.waitForFunction(first=>{const el=document.querySelector('[role="switch"][aria-label="在线文档发布前强制质量检查"]');return el?.getAttribute('aria-checked')!==first.checked&&getComputedStyle(el).backgroundColor!==first.background&&getComputedStyle(el.firstElementChild).transform!==first.knob;},first);const second=await sample();assert.notEqual(first.background,second.background);assert.notEqual(first.knob,second.knob);const saved=await call({type:'appPreferences'});assert.equal(saved.qualityGateEnabled,second.checked==='true');assert.equal(saved.forceQualityCheckBeforeDelivery,second.checked==='true');evidence.controlStyles.push({state:prefix(),label:'在线文档发布前强制质量检查',first,second});await screenshot('settings-switch-state');}finally{if(await control.getAttribute('aria-checked')!==before)await control.click();await page.waitForFunction(expected=>window.pm.request({type:'appPreferences'}).then(result=>result.data.qualityGateEnabled===expected&&result.data.forceQualityCheckBeforeDelivery===expected),before==='true');}
  });
  if(tab==='权限与审批')await verify('权限分段真实保存与选中背景可区分',async()=>{
   const segments=settings.locator('.segments[aria-label="访问互联网"]');const original=(await call({type:'state'})).permissions.web_read;
   for(const [label,decision] of [['允许','allow'],['禁止','deny'],['每次询问','ask']]){
    await segments.getByRole('button',{name:label,exact:true}).click();await page.waitForFunction(decision=>window.pm.request({type:'state'}).then(result=>result.data.permissions.web_read===decision),decision);
    await page.waitForFunction(label=>{const group=document.querySelector('.segments[aria-label="访问互联网"]');if(!group)return false;const buttons=[...group.querySelectorAll('button')],selected=buttons.find(button=>button.textContent===label);const probe=document.createElement('i');probe.style.backgroundColor=getComputedStyle(group).getPropertyValue('--theme-raised');document.body.append(probe);const expected=getComputedStyle(probe).backgroundColor;probe.remove();return selected?.getAttribute('aria-pressed')==='true'&&getComputedStyle(selected).backgroundColor===expected&&buttons.filter(button=>button!==selected).every(button=>getComputedStyle(button).backgroundColor==='rgba(0, 0, 0, 0)');},label);
    const active=segments.getByRole('button',{name:label,exact:true});assert.ok((await active.getAttribute('aria-pressed'))==='true'||(await active.getAttribute('class'))?.split(' ').includes('active'));
    const styles=await segments.getByRole('button').evaluateAll(buttons=>buttons.map(button=>({text:button.textContent,active:button.classList.contains('active'),pressed:button.getAttribute('aria-pressed'),background:getComputedStyle(button).backgroundColor,color:getComputedStyle(button).color})));evidence.controlStyles.push({state:prefix(),label:'访问互联网',styles});const selected=styles.find(item=>item.text===label);assert.notEqual(selected.background,'rgba(0, 0, 0, 0)','selected permission background remained transparent');assert.ok(styles.filter(item=>item.text!==label).every(item=>item.background!==selected.background),JSON.stringify(styles));await screenshot('settings-permission-'+decision);
   }await call({type:'permissionSet',capability:'web_read',decision:original});
  });
  if(tab==='连接')await verify('连接新增及编辑长表单页脚可达',async()=>{
   await settings.locator('.discovery-panel').getByRole('button',{name:'重新查找',exact:true}).waitFor();await page.waitForFunction(()=>!document.querySelector('.connection-page .discovery-heading button')?.disabled);
   assert.ok(await settings.locator('.connection-line').filter({hasText:'隔离本地连接'}).isVisible(),'manual MCP missing from main connections');assert.equal(await settings.locator('.discovery-row').filter({hasText:'隔离本地连接'}).count(),0,'manual MCP incorrectly rendered as discovered official CLI');assert.deepEqual(evidence.pageErrors,[],'asynchronous discovery crashed renderer');await screenshot('connections-discovery-complete');
   for(const edit of [false,true]){
    if(edit)await settings.locator('.connection-line').filter({hasText:'隔离本地连接'}).getByRole('button',{name:'编辑',exact:true}).click();else await settings.getByRole('button',{name:'添加连接',exact:true}).click();
    const form=page.locator('.connection-form-modal');await form.waitFor();await layout(edit?'connection-edit-form':'connection-add-form');
    try{await fixedFormActions(form,{save:'保存连接',close:'关闭连接表单',name:'名称'});}finally{await form.getByRole('button',{name:'关闭连接表单',exact:true}).click();await form.waitFor({state:'hidden'});}
   }
  });
 }
 await verify('仅打开分类和取消子表单保留配置',async()=>assert.deepEqual(await call({type:'appPreferences'}),preferencesBefore));
}
async function detailsPersistence(){
 if(baseline)return;
 await verify('详情展开/收起持久化和焦点恢复',async()=>{
  await openDetails();await page.reload();await page.locator('.brand').waitFor();
  const pane=page.locator('.details-pane');await pane.getByRole('button',{name:'收起详情'}).waitFor({state:'visible'});
  const overlay=await pane.evaluate(el=>['absolute','fixed'].includes(getComputedStyle(el).position));
  if(overlay){
   await page.getByRole('button',{name:'设置',exact:true}).first().click();const settings=page.getByRole('dialog',{name:'设置'});await settings.waitFor();await page.keyboard.press('Escape');await settings.waitFor({state:'hidden'});assert.equal(await page.locator('.work.details-open').count(),1,'settings Escape closed underlying details');
   await page.keyboard.press('Escape');await page.getByRole('button',{name:'展开详情'}).waitFor({state:'visible'});
   await page.waitForFunction(()=>['展开详情','描述你的任务'].includes(document.activeElement?.getAttribute('aria-label')));const focus=await page.evaluate(()=>({label:document.activeElement?.getAttribute('aria-label'),role:document.activeElement?.getAttribute('role')}));assert.ok(['展开详情','描述你的任务'].includes(focus.label),JSON.stringify(focus));
  }else await collapseDetails();
  await hitTarget(page.getByLabel('描述你的任务'),'详情关闭后输入');await page.getByLabel('描述你的任务').click();assert.equal(await page.getByLabel('描述你的任务').evaluate(el=>el===document.activeElement),true);
  await page.reload();await page.locator('.brand').waitFor();await page.getByRole('button',{name:'展开详情'}).waitFor({state:'visible'});
 });
 await collapseDetails();
}

try{
 const common={cwd:root,env:{...process.env,PM_SLASH_DATA_DIR:profile,PM_SLASH_DEV_SERVER_URL:''}};
 app=await electron.launch(packaged?{...common,executablePath:path.join(root,'release','win-unpacked','slash.exe')}:{...common,args:['.']});
 page=await app.firstWindow();page.setDefaultTimeout(10000);page.on('pageerror',error=>evidence.pageErrors.push(error.message));
 page.on('request',request=>{if(/^https?:/.test(request.url())&&!/^http:\/\/127\.0\.0\.1(?::\d+)?\//.test(request.url()))evidence.networkRequests.push(request.url());});
 await page.locator('.brand').waitFor();
 const actualProfile=await app.evaluate(({app})=>app.getPath('userData'));assert.equal(path.resolve(actualProfile),path.resolve(profile));
 await app.evaluate(({BrowserWindow})=>{const win=BrowserWindow.getAllWindows()[0];const original=win.setTitleBarOverlay.bind(win);win.__uiSmokeOverlayCalls=[];win.setTitleBarOverlay=options=>{win.__uiSmokeOverlayCalls.push(options);return original(options);};});
 await call({type:'modelUpsert',model:{provider:'fixture',name:'本地布局验证',baseUrl:modelBaseUrl,modelId:'layout-only',protocol:'openai-completions'},key:'layout-only-loopback-fixture'});
 const models=await call({type:'models'});const model=models.groups.flatMap(group=>group.models).find(item=>item.provider==='fixture');assert.ok(model);await call({type:'modelDefault',id:model.id});
 // Select the actually configured isolated entry through the UI; a fresh
 // app may already have selected its first credential-free catalog entry.
 await composerTrigger(page,'选择模型').click();
 await page.getByRole('listbox',{name:'选择模型'}).getByRole('option').filter({hasText:'本地布局验证'}).click();await page.keyboard.press('Escape');
 if(settingsSaveOnly){evidence.theme='reference';evidence.window=await app.evaluate(({BrowserWindow})=>{const [width,height]=BrowserWindow.getAllWindows()[0].getSize();return{width,height};});}
 for(const [theme,label] of settingsSaveOnly?[]:themes){
  evidence.theme=theme;
  await page.getByRole('button',{name:'设置',exact:true}).first().click();
  const settings=page.getByRole('dialog',{name:'设置'});await settings.waitFor();await settings.locator('.settings-nav button').filter({hasText:'通用'}).click();
  await settings.getByRole('radio',{name:new RegExp(label)}).click();await page.locator(`.app[data-theme="${theme}"]`).waitFor();assert.equal(await page.evaluate(()=>localStorage.getItem('slash:theme')),theme);await call({type:'windowTheme',theme});await closeSettings();
  for(const [width,height] of sizes){
   await app.evaluate(({BrowserWindow},size)=>{const win=BrowserWindow.getAllWindows()[0];win.unmaximize();win.setSize(size.width,size.height);},{width,height});
   evidence.window=await app.evaluate(({BrowserWindow})=>{const win=BrowserWindow.getAllWindows()[0];const [width,height]=win.getSize();return{width,height,minSize:win.getMinimumSize()};});
   evidence.window.requested={width,height};
   // Windows DPI conversion can round the outer window by one or two pixels.
   assert.ok(Math.abs(evidence.window.width-width)<=2);assert.ok(Math.abs(evidence.window.height-height)<=2);
   await closeSettings();if(await page.getByRole('button',{name:'关闭预览',exact:true}).isVisible())await page.getByRole('button',{name:'关闭预览',exact:true}).click();
   await page.locator('.sidebar-main > .new').click();await page.locator('.welcome').waitFor();
   if(!baseline)await verify('新会话默认详情隐藏且会话占据主画布',async()=>{
    assert.equal(await page.locator('.work.details-collapsed').count(),1);
    assert.equal(await page.locator('.details-pane').isVisible(),false,'collapsed pane still renders');
    const geometry=await page.locator('.work').evaluate(el=>{const work=el.getBoundingClientRect(),conversation=el.querySelector('.conversation').getBoundingClientRect(),pane=el.querySelector('.details-pane').getBoundingClientRect();return{workHeight:work.height,conversationHeight:conversation.height,paneWidth:pane.width,paneHeight:pane.height};});
    assert.equal(geometry.paneWidth,0,JSON.stringify(geometry));assert.equal(geometry.paneHeight,0,JSON.stringify(geometry));assert.ok(geometry.conversationHeight>=geometry.workHeight*.95,JSON.stringify(geometry));
    await hitTarget(page.locator('.welcome h1'),'空会话标题');
   });
   await layout('new-empty',{composer:true});
   await fonts('new-empty');
   const titlebar=await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].__uiSmokeOverlayCalls.at(-1));
   const nativeWindowBackground=await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].getBackgroundColor());
   const cssPalette=await page.locator('.app').evaluate(el=>{const style=getComputedStyle(el);return{theme:el.getAttribute('data-theme'),titlebar:style.getPropertyValue('--theme-titlebar').trim(),native:style.getPropertyValue('--theme-window').trim(),topStrip:(()=>{const top=document.elementFromPoint(innerWidth/2,18);return{tag:top?.tagName,className:top?.className,background:top?getComputedStyle(top).backgroundColor:null}})(),background:style.backgroundColor,chrome:style.getPropertyValue('--window-chrome').trim(),before:getComputedStyle(el,'::before').backgroundColor};});
   evidence.titlebars.push({state:prefix(),titlebar,nativeWindowBackground,cssPalette});
   await verify('原生标题栏与CSS背景实际一致',()=>{
    const expected=cssPalette.titlebar||cssPalette.chrome;
    assert.match(expected,/^#[0-9a-f]{6}$/i);assert.equal(titlebar?.color,expected);
    assert.equal(nativeWindowBackground.toLowerCase().replace(/^#ff(?=[0-9a-f]{6}$)/,'#'),expected.toLowerCase(),'native window background differs from CSS window chrome');
    const channels=expected.slice(1).match(/../g).map(value=>parseInt(value,16));const rgb=`rgb(${channels.join(', ')})`;
    assert.equal(cssPalette.background,rgb,'CSS .app exposed top strip differs from native titlebar background');assert.equal(cssPalette.topStrip.background,rgb,'Element at title strip point has a different background');
   });
   await collapseDetails();
   await verify('输入内容及 Shift+Enter 可编辑',async()=>{const input=page.getByLabel('描述你的任务');await input.fill('界面验证草稿');await input.press('Shift+Enter');await input.press('x');assert.equal(await input.inputValue(),'界面验证草稿\nx');await input.fill('');});
   await selectConversation();await page.locator('.run-plan-card').waitFor();await page.locator('.run-plan-card').scrollIntoViewIfNeeded();await layout('conversation-run',{composer:true,gutters:true});await fonts('conversation-run');
   await runStates();
   await verify('会话Markdown表格实际渲染',async()=>{const table=page.locator('.message.assistant .prose table');await table.waitFor();assert.equal(await table.locator('tbody tr').count(),2);assert.equal(await table.locator('th').first().innerText(),'场景');});
   await openDetails();await layout('conversation-details',{composer:true,gutters:true});await collapseDetails();
   await detailsPersistence();await selectConversation();
   for(const label of ['选择模型','Agent 模式','运行权限模式']){
    await verify(label+' 弹层定位与选项可点击',async()=>{
     const trigger=composerTrigger(page,label);await hitTarget(trigger,label);await trigger.click();const list=composerPopup(page,label);await list.waitFor();const [a,b]=await Promise.all([trigger.boundingBox(),list.boundingBox()]);const viewport=await page.evaluate(()=>({width:innerWidth,height:innerHeight}));assert.ok(a&&b&&b.x>=0&&b.y>=0&&b.x+b.width<=viewport.width+1&&b.y+b.height<=viewport.height+1,`${label} bounds ${JSON.stringify({a,b,viewport})}`);assert.ok(b.y+b.height<=a.y+3||b.y>=a.y+a.height-3,`${label} overlaps trigger`);const palette=await list.evaluate(el=>{const popup=getComputedStyle(el),app=getComputedStyle(document.querySelector('.app'));return{popupBackground:popup.backgroundColor,popupColor:popup.color,values:['--theme-bg','--theme-text','--theme-raised'].map(key=>({key,popup:popup.getPropertyValue(key).trim(),app:app.getPropertyValue(key).trim()}))};});evidence.popups.push({state:prefix(),label,palette});await screenshot('popup-'+label);for(const value of palette.values)assert.equal(value.popup,value.app,`${label} portal ${value.key}`);const option=label==='选择模型'?list.getByRole('option').first():list.getByRole('radio').first();await hitTarget(option,label+' option');await option.click();await page.keyboard.press('Escape');await list.waitFor({state:'hidden'});await page.waitForFunction(label=>document.activeElement?.getAttribute('aria-label')===label,label==='Agent 模式'?'模式':label==='运行权限模式'?'权限':label);
    });await page.keyboard.press('Escape');
   }
   await verify('引用选择器真实文件、确认与Escape关闭',async()=>{
    const trigger=page.getByRole('button',{name:/引用资料$/});await trigger.click();
    const picker=page.getByRole('dialog',{name:'选择引用资料'});await picker.waitFor();await hitTarget(picker.getByLabel('搜索引用资料'),'引用搜索');
    const alignment=await picker.evaluate(el=>{const rows=[...el.querySelectorAll('.reference-picker-item')].map(row=>({checkX:row.querySelector('.reference-picker-check').getBoundingClientRect().x,copyX:row.querySelector('.reference-picker-item-copy').getBoundingClientRect().x}));const input=el.querySelector('.reference-picker-search input'),icon=el.querySelector('.reference-picker-search>.icon'),css=getComputedStyle(input),box=input.getBoundingClientRect();return{rows,paddingLeft:parseFloat(css.paddingLeft),textX:box.x+parseFloat(css.borderLeftWidth)+parseFloat(css.paddingLeft),iconRight:icon?.getBoundingClientRect().right};});assert.ok(alignment.rows.length>=2);for(const axis of ['checkX','copyX'])assert.ok(Math.max(...alignment.rows.map(row=>row[axis]))-Math.min(...alignment.rows.map(row=>row[axis]))<=1,JSON.stringify(alignment));assert.ok(alignment.iconRight&&alignment.textX>=alignment.iconRight+5,`Search icon overlaps text ${JSON.stringify(alignment)}`);evidence.states.push({name:prefix()+'-reference-picker-alignment',...alignment});
    const file=picker.getByRole('option').filter({hasText:referenceFile});await hitTarget(file,'引用现场访谈');await file.click();await screenshot('reference-picker');await picker.getByRole('button',{name:'确认引用'}).click();await picker.waitFor({state:'hidden'});
    await page.getByRole('button',{name:`移除引用资料 ${referenceFile}`,exact:true}).waitFor();await layout('reference-attached',{composer:true,gutters:true});
    await trigger.click();await picker.waitFor();await page.keyboard.press('Escape');await picker.waitFor({state:'hidden'});assert.equal(await page.locator('.work.details-collapsed').count(),1);await hitTarget(trigger,'关闭引用后入口');
    await page.getByRole('button',{name:`移除引用资料 ${referenceFile}`,exact:true}).click();
   });
   await page.getByRole('button',{name:'资源',exact:true}).first().click();await page.locator('.page-heading h1').filter({hasText:'资源'}).waitFor();await layout('resources');
   await verify('资源搜索无结果空态可恢复',async()=>{const search=page.getByPlaceholder('按文件名搜索');await search.fill('DELIVERY-UI-NO-MATCH-资料');await page.waitForFunction(()=>document.querySelectorAll('.file-row').length===0);assert.equal(await page.locator('.file-row').count(),0);await layout('resources-empty-search');await search.fill('');await page.locator('.file-row').filter({hasText:referenceFile}).waitFor();});
   await page.getByRole('button',{name:'成果',exact:true}).first().click();await page.locator('.page-heading h1').filter({hasText:'成果'}).waitFor();await layout('artifacts');
   await verify('文件目录与搜索真实过滤',async()=>{
    await page.getByPlaceholder('按文件名搜索').fill(prdFile);await page.waitForFunction(()=>document.querySelectorAll('.file-row').length===1);await page.locator('.file-row').filter({hasText:prdFile}).waitFor();assert.equal(await page.locator('.file-row').count(),1);await layout('artifacts-search-file');await page.getByPlaceholder('按文件名搜索').fill('');
    const back=page.getByRole('button',{name:'返回目录列表'});if(await back.isVisible())await back.click();await page.locator('.folder-card').filter({hasText:'产出材料'}).click();await page.locator('.file-row').filter({hasText:prdFile}).waitFor();await layout('artifacts-directory-rows');await back.click();
   });
   await toolPage('规则与模板');await page.locator('.page-heading h1').filter({hasText:'规则与模板'}).waitFor();await layout('templates');
   await toolPage('共享文件夹');await page.locator('.share-choice').first().waitFor();await layout('share-home');
   await page.locator('.share-choice').filter({hasText:'连接同事'}).click();await page.locator('.share-wizard').waitFor();await layout('share-connect-form');await page.locator('.back-link').click();
   await page.locator('.share-choice').filter({hasText:'把本机文件夹'}).click();await page.locator('.share-wizard').waitFor();await layout('share-create-form');await page.locator('.back-link').click();
   await selectConversation();
   await openFile('产出材料',prdFile);await page.locator('.document-reader .markdown').waitFor();await collapseDetails();await layout('document-preview',{composer:true,gutters:true});
   await verify('项目侧栏可收起展开且预览获更多宽度',async()=>{
    const collapse=page.getByRole('button',{name:'收起项目侧栏',exact:true});const before=await page.locator('.preview').boundingBox();await hitTarget(collapse,'收起项目侧栏');await collapse.click();await page.getByRole('button',{name:'展开项目侧栏',exact:true}).waitFor();const after=await page.locator('.preview').boundingBox();assert.ok(after.width>before.width,JSON.stringify({before,after}));await layout('preview-project-sidebar-collapsed',{composer:true,gutters:true});await page.getByRole('button',{name:'展开项目侧栏',exact:true}).click();await collapse.waitFor();
   });
   await verify('文档Markdown表格实际渲染',async()=>{const table=page.locator('.document-reader .markdown table');await table.waitFor();assert.equal(await table.locator('tbody tr').count(),2);assert.equal(await table.locator('th').first().innerText(),'场景');});
   await verify('预览更多操作入口可恢复',async()=>{
    const preview=page.locator('.preview');const more=preview.locator('.preview-more > summary');await hitTarget(more,'更多操作');await more.click();
    const quality=preview.getByRole('button',{name:'质量检查',exact:true});await hitTarget(quality,'质量检查');await quality.click();
    await preview.getByLabel('成果质量检查结果').waitFor();await layout('document-quality-result',{composer:true});
    const diff=preview.getByRole('button',{name:'查看差异',exact:true});if(!await diff.isVisible())await more.click();await hitTarget(diff,'查看差异');await screenshot('preview-more-actions');await page.keyboard.press('Escape');assert.equal(await diff.isVisible(),false,'更多操作Escape未关闭');await hitTarget(more,'更多操作恢复');
    await previewAction('查看差异');await preview.getByLabel('成果版本差异').waitFor();await layout('document-diff-result',{composer:true});
   });
   await verify('文档真实内容独立滚动',async()=>{const reader=await page.locator('.document-reader').evaluate(el=>({height:el.clientHeight,scroll:el.scrollHeight,overflow:getComputedStyle(el).overflowY}));assert.ok(reader.height>0&&reader.scroll>reader.height&&reader.overflow==='auto',JSON.stringify(reader));});
   await openDetails();await layout('document-preview-details',{composer:true,gutters:true});await collapseDetails();await page.getByRole('button',{name:'关闭预览',exact:true}).click();
   await openFile('原型',prototypeFile);
   await verify('原型真实交互与隔离',async()=>{const frame=page.frameLocator('.preview iframe');await frame.locator('#reason').fill('材料不完整');await frame.locator('#reject').click();await frame.getByText('已退回：材料不完整',{exact:true}).waitFor();assert.equal(await frame.locator('#message').innerText(),'已退回：材料不完整');assert.equal(await frame.locator('body').evaluate(()=>typeof window.pm),'undefined');});await layout('prototype-preview',{composer:true,gutters:true});await page.getByRole('button',{name:'关闭预览',exact:true}).click();
   await page.getByRole('button',{name:'设置',exact:true}).first().click();await settings.waitFor();
   await settingsChecks(settings);
   await closeSettings();
   await verify('项目菜单资源/成果/新会话真实功能',async()=>{
    await projectMenu('打开资源');await page.locator('.page-heading h1').filter({hasText:'资源'}).waitFor();assert.equal((await call({type:'state'})).root,workspace);
    await projectMenu('打开成果');await page.locator('.page-heading h1').filter({hasText:'成果'}).waitFor();
    const before=(await call({type:'state'})).conversations.length;await projectMenu('在此项目新建会话');await page.locator('.welcome').waitFor();assert.equal((await call({type:'state'})).conversations.length,before+1);assert.equal((await call({type:'state'})).root,workspace);
   });
   await verify('项目切换隔离及会话恢复',async()=>{
    const alternate=page.locator('.project-row').filter({hasText:'另一个项目'});await alternate.click();await page.locator('.project-row[aria-current="true"]').filter({hasText:'另一个项目'}).waitFor();const alternateState=await call({type:'state'});assert.equal(alternateState.root,alternateWorkspace);assert.equal(alternateState.conversations.some(item=>item.id===conversationId),false);assert.equal(await page.locator('.project-group.current .project-conversations > button').filter({hasText:'客户准入方案'}).count(),0);
    await page.locator('.project-row').filter({hasText:'客户准入项目'}).click();await selectConversation();assert.equal((await call({type:'state'})).root,workspace);
   });
   console.log(`Completed ${prefix()}; ${evidence.failures.length} failures so far`);
  }
 }
 await page.getByRole('button',{name:'设置',exact:true}).first().click();const finalSettings=page.getByRole('dialog',{name:'设置'});
 await verify('隔离模型通过UI实际新增和编辑保存',async()=>{
  try{
  await finalSettings.locator('.settings-nav button').filter({hasText:'模型'}).first().click();await finalSettings.getByRole('button',{name:'添加模型',exact:true}).click();const form=finalSettings.locator('.subdialog');await form.waitFor();
  await form.getByLabel('供应商名称',{exact:true}).fill('ui-fixture');await form.getByLabel('显示名称',{exact:true}).fill('通过表单新增的本地模型');const advanced=form.locator('details.advanced');if(await advanced.getAttribute('open')===null)await advanced.locator('summary').click();await form.getByLabel('API 地址',{exact:true}).fill(modelBaseUrl);await form.getByLabel('模型 ID',{exact:true}).fill('ui-form-layout');await form.locator('input[type="password"]').fill('isolated-ui-fixture-key');await form.getByRole('button',{name:'保存模型'}).click();await form.waitFor({state:'hidden'});
  let model=(await call({type:'models'})).groups.flatMap(group=>group.models).find(item=>item.provider==='ui-fixture');assert.ok(model?.hasKey);assert.equal(model.name,'通过表单新增的本地模型');
  await finalSettings.locator('.model-row').filter({hasText:model.name}).getByRole('button',{name:'编辑',exact:true}).click();await form.waitFor();await form.getByLabel('显示名称',{exact:true}).fill('通过表单编辑的本地模型');await form.getByRole('button',{name:'保存模型'}).click();await form.waitFor({state:'hidden'});model=(await call({type:'models'})).groups.flatMap(group=>group.models).find(item=>item.provider==='ui-fixture');assert.equal(model.name,'通过表单编辑的本地模型');assert.ok(model.hasKey,'editing name erased fixture credential');
  }finally{const close=finalSettings.getByRole('button',{name:'关闭模型表单',exact:true});if(await close.isVisible())await close.click();}
 });
 await verify('停用的本地MCP连接通过UI实际新增和编辑保存',async()=>{
  try{
  await finalSettings.locator('.settings-nav button').filter({hasText:'连接'}).first().click();await finalSettings.getByRole('button',{name:'添加连接',exact:true}).click();const form=page.locator('.connection-form-modal');await form.waitFor();
  const selectLabels=await form.locator('select').evaluateAll(elements=>elements.map(el=>({labels:[...el.labels].map(label=>label.textContent.replace(/\s+/g,' ').trim()),options:[...el.options].map(option=>({value:option.value,text:option.textContent}))})));evidence.controlStyles.push({state:prefix(),label:'Connection native select labels',selectLabels});
  await form.getByLabel('名称',{exact:true}).fill('通过表单新增的停用连接');await form.getByLabel(/^连接方式/).selectOption('http');await form.getByLabel('服务地址',{exact:true}).fill('http://127.0.0.1:9/mcp');await form.getByLabel('保存后启用',{exact:true}).uncheck();await form.getByRole('button',{name:'保存连接'}).click();await form.waitFor({state:'hidden'});
  let connection=(await call({type:'state'})).connections.find(item=>item.name==='通过表单新增的停用连接');assert.ok(connection);assert.equal(connection.enabled,false);
  await finalSettings.locator('.connection-line').filter({hasText:connection.name}).getByRole('button',{name:'编辑',exact:true}).click();await form.waitFor();await form.getByLabel('名称',{exact:true}).fill('通过表单编辑的停用连接');await form.getByRole('button',{name:'保存连接'}).click();await form.waitFor({state:'hidden'});connection=(await call({type:'state'})).connections.find(item=>item.id===connection.id);assert.equal(connection.name,'通过表单编辑的停用连接');assert.equal(connection.enabled,false);
  }finally{const close=page.getByRole('button',{name:'关闭连接表单',exact:true});if(await close.isVisible())await close.click();}
 });
 await finalSettings.locator('.settings-nav button').filter({hasText:'归档会话'}).click();
 await verify('归档会话实际删除且持久状态同步',async()=>{page.once('dialog',dialog=>dialog.accept());await finalSettings.locator('.task').filter({hasText:'归档可删除交付示例'}).getByRole('button',{name:'删除',exact:true}).click();await page.waitForFunction(id=>window.pm.request({type:'state'}).then(result=>!result.data.conversations.some(item=>item.id===id)),archivedId);await screenshot('archived-deleted');});await closeSettings();
 assert.deepEqual(evidence.pageErrors,[]);assert.deepEqual(evidence.networkRequests,[],'unexpected external renderer network requests');
 evidence.status=evidence.failures.length?'failed':'passed';
 await fs.writeFile(path.join(output,'result.json'),JSON.stringify(evidence,null,2));
 console.log(JSON.stringify({status:evidence.status,output,checks:evidence.checks.length,failures:evidence.failures}));
 if(evidence.failures.length&&!baseline)process.exitCode=1;
}catch(error){evidence.status='failed';evidence.fatal=String(error);if(page)await page.screenshot({path:path.join(output,'failure.png')}).catch(()=>{});await fs.writeFile(path.join(output,'result.json'),JSON.stringify(evidence,null,2));throw error;}
finally{if(app)await app.close();for(const socket of sockets)socket.destroy();await new Promise(resolve=>server.close(resolve));}



