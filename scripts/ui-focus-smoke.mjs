import {composerTrigger,composerPopup,chooseComposerModel,chooseComposerWorkflow,chooseComposerPermission,ensureLegacyFixtureMounts} from './composer-smoke-helpers.mjs';
import {_electron as electron} from 'playwright';
import {randomUUID} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {Store} from '../dist/main/store.js';
import {Service} from '../dist/main/service.js';

// Real persisted domain fixtures and Electron UI, using only a fresh profile.
// No send/modelCheck/provider request is made. Build first; this never packages.
const root=process.cwd();
const baseline=process.argv.includes('--baseline');
const packaged=process.argv.includes('--packaged');
const output=path.join(root,'.test-data',`ui-focus-${baseline?'baseline':'regression'}-${Date.now()}`);
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
await fs.writeFile(path.join(mount('产出材料').path,prdFile),'# 客户准入 PRD\n\n| 场景 | 规则 | 验收 |\n| --- | --- | --- |\n| 退回申请 | 原因至少五个字 | 必填并保存 |\n| 审批记录 | 保留操作者与时间 | 可查询 |\n\n'+Array.from({length:40},(_,i)=>`## 规则 ${i+1}\n\n退回必须填写原因。操作记录保留操作者与时间。复核时限待确认。\n`).join('\n'));
await fs.writeFile(path.join(mount('原型').path,prototypeFile),'<!doctype html><html lang="zh"><meta charset="utf-8"><title>客户准入</title><style>body{font:16px system-ui;padding:24px}input,button{font:inherit;padding:8px}label{display:block;margin-bottom:12px}</style><h1>客户准入</h1><form id="approval"><label>退回原因 <input id="reason" required></label><button id="reject">退回申请</button></form><p id="message" role="status">等待处理</p><script>document.querySelector("#approval").onsubmit=e=>{e.preventDefault();document.querySelector("#message").textContent="已退回："+document.querySelector("#reason").value}</script></html>');
await service.registerArtifact(conversationId,{mountId:mount('产出材料').id,relativePath:prdFile,kind:'document',title:'客户准入 PRD'});
await service.registerArtifact(conversationId,{mountId:mount('原型').id,relativePath:prototypeFile,kind:'prototype',title:'客户准入原型'});
service.save();store.close();

const evidence={status:'running',baseline,fixture:'Persisted Store/Service messages and completed Run; actual IPC and UI navigation; no model generation',profile,output,pageErrors:[],checks:[],failures:[],states:[],screenshots:[],networkRequests:[],fonts:[],titlebars:[],popups:[]};
let app,page;
const themes=[['reference','经典暖白'],['graphite','石墨深色'],['sand','柔和米色']];
const sizes=[[1366,900],[1100,760]];
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
 if(composer){await verify(name+' 输入框与操作可见',async()=>{assert.ok(result.composer&&result.composer.bottom<=result.window.height+1&&result.textarea.height>=80,JSON.stringify(result.composer));if(result.detailsOverlay){await hitTarget(page.locator('.details-pane').getByRole('button',{name:'收起详情'}),'overlay收起详情');}else{await hitTarget(page.getByLabel('描述你的任务'),'描述你的任务');for(const label of ['选择模型','Agent 模式','运行权限模式'])await hitTarget(composerTrigger(page,label),label);await hitTarget(page.getByRole('button',{name:'发送',exact:true}),'发送');}});}
 if(gutters)await verify(name+' 消息左右留白至少20px',()=>{assert.ok(result.gutters&&result.gutters.left>=20&&result.gutters.right>=20,JSON.stringify(result.gutters));});
 await screenshot(name);
}
async function closeSettings(){const close=page.getByRole('button',{name:'关闭设置'});if(await close.isVisible())await close.click();}
async function collapseDetails(){const close=page.locator('.details-pane').getByRole('button',{name:'收起详情'});if(await close.isVisible())await close.click();}
async function openDetails(){const open=page.getByRole('button',{name:'展开详情'});if(await open.isVisible())await open.click();await page.locator('.details-pane').getByRole('button',{name:'收起详情'}).waitFor({state:'visible'});}
async function selectConversation(){await page.locator('.project-conversations > button').filter({hasText:'客户准入方案'}).click();await page.locator('.message.assistant').waitFor();}
async function openFile(folder,file){await page.getByRole('button',{name:'成果',exact:true}).first().click();const back=page.getByRole('button',{name:'返回目录列表'});if(await back.isVisible())await back.click();await page.locator('.folder-card').filter({hasText:folder}).click();await page.locator('.file-row').filter({hasText:file}).getByRole('button',{name:'阅读',exact:true}).click();await page.getByRole('button',{name:'会话',exact:true}).first().click();await page.locator('.preview').waitFor();}
async function projectMenu(name){const current=page.locator('.project-row[aria-current="true"]');await current.click({button:'right'});const menu=page.getByRole('menu');await menu.waitFor();await hitTarget(menu.getByRole('menuitem',{name,exact:true}),name);await menu.getByRole('menuitem',{name,exact:true}).click();await menu.waitFor({state:'hidden'});}
async function fonts(name){const values=await page.evaluate(()=>[...document.querySelectorAll('.welcome h1,.message.assistant .prose p,.composer textarea,.sidebar-main>.new,.settings-heading h1')].filter(el=>el.getBoundingClientRect().width>0).map(el=>({selector:el.className||el.tagName,text:el.textContent?.slice(0,40),fontFamily:getComputedStyle(el).fontFamily,fontSize:getComputedStyle(el).fontSize,lineHeight:getComputedStyle(el).lineHeight})));evidence.fonts.push({state:`${prefix()}-${name}`,values});await verify(name+' 中文正文与控件无衬线字体',()=>{for(const item of values)assert.ok(/sans-serif/i.test(item.fontFamily)&&!/(Georgia|Times New Roman|宋体|SimSun)/i.test(item.fontFamily),JSON.stringify(item));});}
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
 await call({type:'modelUpsert',model:{provider:'fixture',name:'本地布局验证',baseUrl:'http://127.0.0.1:9/v1',modelId:'layout-only',protocol:'openai-completions'},key:'layout-only-no-request'});
 const models=await call({type:'models'});const model=models.groups.flatMap(group=>group.models).find(item=>item.provider==='fixture');assert.ok(model);await call({type:'modelDefault',id:model.id});
 // Select the actually configured isolated entry through the UI; a fresh
 // app may already have selected its first credential-free catalog entry.
 await composerTrigger(page,'选择模型').click();
 await page.getByRole('listbox',{name:'选择模型'}).getByRole('option').filter({hasText:'本地布局验证'}).click();await page.keyboard.press('Escape');
 for(const [theme,label] of themes){
  evidence.theme=theme;
  await page.getByRole('button',{name:'设置',exact:true}).first().click();
  const settings=page.getByRole('dialog',{name:'设置'});await settings.waitFor();await settings.locator('.settings-nav button').filter({hasText:'通用'}).click();
  await settings.getByRole('radio',{name:new RegExp(label)}).click();await page.locator(`.app[data-theme="${theme}"]`).waitFor();assert.equal(await page.evaluate(()=>localStorage.getItem('slash:theme')),theme);await closeSettings();
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
   const cssPalette=await page.locator('.app').evaluate(el=>{const style=getComputedStyle(el);return{theme:el.getAttribute('data-theme'),titlebar:style.getPropertyValue('--theme-titlebar').trim(),native:style.getPropertyValue('--theme-window').trim(),topStrip:(()=>{const top=document.elementFromPoint(innerWidth/2,18);return{tag:top?.tagName,className:top?.className,background:top?getComputedStyle(top).backgroundColor:null}})(),background:style.backgroundColor,chrome:style.getPropertyValue('--window-chrome').trim(),before:getComputedStyle(el,'::before').backgroundColor};});
   evidence.titlebars.push({state:prefix(),titlebar,cssPalette});
   await verify('原生标题栏与CSS背景实际一致',()=>{
    const expected={reference:'#f5f4f1',graphite:'#151a20',sand:'#eee3d2'}[theme];
    if(!(theme==='reference'&&!titlebar))assert.equal(titlebar?.color,expected);
    const channels=expected.slice(1).match(/../g).map(value=>parseInt(value,16));const rgb=`rgb(${channels.join(', ')})`;
    assert.equal(cssPalette.background,rgb,'CSS .app exposed top strip differs from native titlebar background');assert.equal(cssPalette.topStrip.background,rgb,'Element at title strip point has a different background');
   });
   await collapseDetails();
   await verify('输入内容及 Shift+Enter 可编辑',async()=>{const input=page.getByLabel('描述你的任务');await input.fill('界面验证草稿');await input.press('Shift+Enter');await input.press('x');assert.equal(await input.inputValue(),'界面验证草稿\nx');await input.fill('');});
   await selectConversation();await page.locator('.run-plan-card').waitFor();await page.locator('.run-plan-card').scrollIntoViewIfNeeded();await layout('conversation-run',{composer:true,gutters:true});await fonts('conversation-run');
   await verify('会话Markdown表格实际渲染',async()=>{const table=page.locator('.message.assistant .prose table');await table.waitFor();assert.equal(await table.locator('tbody tr').count(),2);assert.equal(await table.locator('th').first().innerText(),'场景');});
   await openDetails();await layout('conversation-details',{composer:true,gutters:true});await collapseDetails();
   await detailsPersistence();await selectConversation();
   for(const label of ['选择模型','Agent 模式','运行权限模式']){
    await verify(label+' 弹层定位与选项可点击',async()=>{
     const trigger=composerTrigger(page,label);await hitTarget(trigger,label);await trigger.click();const list=composerPopup(page,label);await list.waitFor();const [a,b]=await Promise.all([trigger.boundingBox(),list.boundingBox()]);const viewport=await page.evaluate(()=>({width:innerWidth,height:innerHeight}));assert.ok(a&&b&&b.x>=0&&b.y>=0&&b.x+b.width<=viewport.width+1&&b.y+b.height<=viewport.height+1,`${label} bounds ${JSON.stringify({a,b,viewport})}`);assert.ok(b.y+b.height<=a.y+3||b.y>=a.y+a.height-3,`${label} overlaps trigger`);const palette=await list.evaluate(el=>{const popup=getComputedStyle(el),app=getComputedStyle(document.querySelector('.app'));return{popupBackground:popup.backgroundColor,popupColor:popup.color,values:['--theme-bg','--theme-text','--theme-raised'].map(key=>({key,popup:popup.getPropertyValue(key).trim(),app:app.getPropertyValue(key).trim()}))};});evidence.popups.push({state:prefix(),label,palette});await screenshot('popup-'+label);for(const value of palette.values)assert.equal(value.popup,value.app,`${label} portal ${value.key}`);const option=label==='选择模型'?list.getByRole('option').first():list.getByRole('radio').first();await hitTarget(option,label+' option');await option.click();await page.keyboard.press('Escape');await list.waitFor({state:'hidden'});await page.waitForFunction(label=>document.activeElement?.getAttribute('aria-label')===label,label==='Agent 模式'?'模式':label==='运行权限模式'?'权限':label);
    });await page.keyboard.press('Escape');
   }
   await verify('引用选择器真实文件、确认与Escape关闭',async()=>{
    const trigger=page.getByRole('button',{name:'＋ 引用资料',exact:true});await trigger.click();
    const picker=page.getByRole('dialog',{name:'选择引用资料'});await picker.waitFor();await hitTarget(picker.getByLabel('搜索引用资料'),'引用搜索');
    const file=picker.getByRole('option').filter({hasText:referenceFile});await hitTarget(file,'引用现场访谈');await file.click();await screenshot('reference-picker');await picker.getByRole('button',{name:'确认引用'}).click();await picker.waitFor({state:'hidden'});
    await page.getByRole('button',{name:`移除引用资料 ${referenceFile}`,exact:true}).waitFor();await layout('reference-attached',{composer:true,gutters:true});
    await trigger.click();await picker.waitFor();await page.keyboard.press('Escape');await picker.waitFor({state:'hidden'});assert.equal(await page.locator('.work.details-collapsed').count(),1);await hitTarget(trigger,'关闭引用后入口');
    await page.getByRole('button',{name:`移除引用资料 ${referenceFile}`,exact:true}).click();
   });
   await page.getByRole('button',{name:'资源',exact:true}).first().click();await page.locator('.page-heading h1').filter({hasText:'资源'}).waitFor();await layout('resources');
   await page.getByRole('button',{name:'成果',exact:true}).first().click();await page.locator('.page-heading h1').filter({hasText:'成果'}).waitFor();await layout('artifacts');
   await selectConversation();
   await openFile('产出材料',prdFile);await page.locator('.document-reader .markdown').waitFor();await collapseDetails();await layout('document-preview',{composer:true,gutters:true});
   await verify('文档Markdown表格实际渲染',async()=>{const table=page.locator('.document-reader .markdown table');await table.waitFor();assert.equal(await table.locator('tbody tr').count(),2);assert.equal(await table.locator('th').first().innerText(),'场景');});
   await verify('预览更多操作入口可恢复',async()=>{
    const preview=page.locator('.preview');const more=preview.locator('.preview-more > summary');await hitTarget(more,'更多操作');await more.click();
    const quality=preview.getByRole('button',{name:'质量检查',exact:true});await hitTarget(quality,'质量检查');await quality.click();
    const diff=preview.getByRole('button',{name:'查看差异',exact:true});if(!await diff.isVisible())await more.click();await hitTarget(diff,'查看差异');await screenshot('preview-more-actions');await page.keyboard.press('Escape');assert.equal(await diff.isVisible(),false,'更多操作Escape未关闭');await hitTarget(more,'更多操作恢复');
   });
   await verify('文档真实内容独立滚动',async()=>{const reader=await page.locator('.document-reader').evaluate(el=>({height:el.clientHeight,scroll:el.scrollHeight,overflow:getComputedStyle(el).overflowY}));assert.ok(reader.height>0&&reader.scroll>reader.height&&reader.overflow==='auto',JSON.stringify(reader));});
   await openDetails();await layout('document-preview-details',{composer:true,gutters:true});await collapseDetails();await page.getByRole('button',{name:'关闭预览',exact:true}).click();
   await openFile('原型',prototypeFile);
   await verify('原型真实交互与隔离',async()=>{const frame=page.frameLocator('.preview iframe');await frame.locator('#reason').fill('材料不完整');await frame.locator('#reject').click();await frame.getByText('已退回：材料不完整',{exact:true}).waitFor();assert.equal(await frame.locator('#message').innerText(),'已退回：材料不完整');assert.equal(await frame.locator('body').evaluate(()=>typeof window.pm),'undefined');});await layout('prototype-preview',{composer:true,gutters:true});await page.getByRole('button',{name:'关闭预览',exact:true}).click();
   await page.getByRole('button',{name:'设置',exact:true}).first().click();await settings.waitFor();
   for(const tab of ['通用','工作空间','模型','质量检查','连接','权限与审批','任务与回执','归档会话']){
    const button=settings.locator('.settings-nav button').filter({hasText:tab}).first();await hitTarget(button,'设置 '+tab);await button.click();await verify('设置 '+tab+' 无横溢',async()=>{const amount=await settings.locator('.settings-body').evaluate(el=>el.scrollWidth-el.clientWidth);assert.ok(amount<=1,`${tab}: ${amount}`);});if(['通用','模型','权限与审批'].includes(tab))await layout('settings-'+tab);
   }
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
 assert.deepEqual(evidence.pageErrors,[]);assert.deepEqual(evidence.networkRequests,[],'unexpected external renderer network requests');
 evidence.status=evidence.failures.length?'failed':'passed';
 await fs.writeFile(path.join(output,'result.json'),JSON.stringify(evidence,null,2));
 console.log(JSON.stringify({status:evidence.status,output,checks:evidence.checks.length,failures:evidence.failures}));
 if(evidence.failures.length&&!baseline)process.exitCode=1;
}catch(error){evidence.status='failed';evidence.fatal=String(error);if(page)await page.screenshot({path:path.join(output,'failure.png')}).catch(()=>{});await fs.writeFile(path.join(output,'result.json'),JSON.stringify(evidence,null,2));throw error;}
finally{if(app)await app.close();}


