import {_electron as electron} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {Document,Packer,Paragraph} from 'docx';
import {Store} from '../dist/main/store.js';
import {Service} from '../dist/main/service.js';
import {composerTrigger,composerPopup,projectResourceLocation} from './composer-smoke-helpers.mjs';

// Run only after the build owner builds dist. Real Electron, preload, authorized
// file listing and UI are exercised. Send is intercepted at desktop IPC, before
// Service/model execution; this script does not assert backend or cloud quality.
const root=process.cwd(),output=path.join(root,'.test-data',`template-picker-ui-${Date.now()}`);
const profile=path.join(output,'profile'),workspace=path.join(output,'template-primary'),secondWorkspace=path.join(output,'template-secondary');
assert.ok(path.relative(path.join(root,'.test-data'),profile).startsWith('template-picker-ui-'));
await fs.mkdir(output,{recursive:true});
const store=new Store(profile),service=new Service(store,()=>'',()=>{});
let historyId,historyRunId,resources,word,markdown,reference;
try{
 await service.workspace(secondWorkspace);await service.workspace(workspace);
 resources=projectResourceLocation(await service.projectTreeGet(),'参考资料');
 word={mountId:resources.mountId,path:path.join(resources.path,'合成模板A.docx')};
 markdown={mountId:resources.mountId,path:path.join(resources.path,'合成模板B.md')};
 reference={mountId:resources.mountId,path:path.join(resources.path,'合成业务资料.txt')};
 const wordBytes=await Packer.toBuffer(new Document({sections:[{children:[new Paragraph({text:'合成 PRD 模板 A',heading:'Heading1'}),new Paragraph({text:'需求范围',heading:'Heading2'}),new Paragraph('仅用于 UI 测试。')]}]}));
 await fs.writeFile(path.join(resources.directory,'合成模板A.docx'),wordBytes);
 await fs.writeFile(path.join(resources.directory,'合成模板B.md'),'# 合成模板 B\n\n## 用户场景\n\n## 验收标准\n');
 await fs.writeFile(path.join(resources.directory,'合成业务资料.txt'),'合成业务事实：提交时填写负责人。');
 historyId=service.conversation(undefined,'合成模板历史任务');historyRunId=randomUUID();
 const now=new Date().toISOString(),history=service.state.conversations.find(item=>item.id===historyId);
 history.messages.push({role:'user',text:'UI-HISTORY-TEMPLATE：整理合成需求',time:now},{role:'assistant',text:'合成历史失败记录，用于验证重新编辑入口。',time:now,runId:historyRunId});
 service.state.runs.unshift({id:historyRunId,conversationId:historyId,status:'failed',mode:'plan',phase:'failed',startedAt:now,finishedAt:now,input:'UI-HISTORY-TEMPLATE：整理合成需求',error:'UI_TEMPLATE_SYNTHETIC_HISTORY',workflow:{kind:'prd',sources:[reference],receipts:[],template:{...word,contentHash:createHash('sha256').update(wordBytes).digest('hex')}}});
 service.save();
}finally{service.dispose();await Promise.allSettled([...service.agentIndex.queues.values()]);store.close();}

const switchesOnly=process.argv.includes('--switches-only');
const evidence={status:'running',scenario:switchesOnly?'switches-and-history':'full',output,checks:[],screenshots:[],sends:[],pageErrors:[],limitations:['Real isolated Electron UI and authorized synthetic files; send IPC returns synthetic success/failure without calling Service.send or any model.','History is a seeded synthetic failed run. Plan assertions cover outgoing mode/workflow and absence of send-side mutations only; backend read-only behavior is verified separately.']};
let app,page;
const check=text=>{evidence.checks.push(text);console.log('PASS '+text);};
const chip=()=>page.getByLabel('已选择的 PRD 模板',{exact:true});
const picker=()=>page.getByRole('dialog',{name:'选择引用资料',exact:true});
const input=()=>page.getByLabel('描述你的任务',{exact:true});
const call=async request=>{const response=await page.evaluate(value=>window.pm.request(value),request);assert.ok(response.ok,response.error);return response.data;};
const fixture=()=>app.evaluate(()=>structuredClone(globalThis.__templatePickerFixture));
async function waitValue(read,predicate,timeout=12000){const end=Date.now()+timeout;while(Date.now()<end){const value=await read();if(predicate(value))return value;await new Promise(resolve=>setTimeout(resolve,50));}assert.fail('Timed out waiting for template UI fixture');}
async function screenshot(name){await page.screenshot({path:path.join(output,name+'.png')});evidence.screenshots.push(name+'.png');}
async function openPicker(){await composerTrigger(page,'添加').click();await composerPopup(page,'添加').getByRole('button',{name:'引用资料',exact:true}).click();await picker().waitFor();await picker().getByRole('checkbox',{name:'引用资料 合成业务资料.txt',exact:true}).waitFor();}
async function chooseTemplate(name){await picker().getByRole('button',{name:`用作 PRD 模板 ${name}`,exact:true}).click();}
async function confirm(){await picker().getByRole('button',{name:'确认引用',exact:true}).click();await picker().waitFor({state:'hidden'});}
async function pickTemplate(name='合成模板A.docx'){await openPicker();await chooseTemplate(name);await confirm();await chip().waitFor();}
async function normalReferencePresent(){await page.getByRole('button',{name:`移除引用资料 ${reference.path}`,exact:true}).waitFor();}
async function setMode(mode){await composerTrigger(page,'模式').click();await composerPopup(page,'模式').getByRole('radio').filter({hasText:mode==='plan'?'Plan':'Build'}).click();}
async function sendAndRecord({fail=false}={}){await app.evaluate((_,value)=>{globalThis.__templatePickerFixture.failSend=value;},fail);const before=(await fixture()).sends.length;await page.getByRole('button',{name:'发送',exact:true}).click();const value=await waitValue(fixture,state=>state.sends.length===before+1);if(!fail)await chip().waitFor({state:'hidden'});return value.sends.at(-1);}
async function assertPickerBounds(){const bounds=await picker().evaluate(element=>{const box=element.getBoundingClientRect();return{left:box.left,right:box.right,top:box.top,bottom:box.bottom,width:innerWidth,height:innerHeight,overflow:element.scrollWidth>element.clientWidth+1,nestedButtons:element.querySelectorAll('button button').length};});assert.ok(bounds.left>=0&&bounds.right<=bounds.width+1&&bounds.top>=0&&bounds.bottom<=bounds.height+1,JSON.stringify(bounds));assert.equal(bounds.overflow,false);assert.equal(bounds.nestedButtons,0);}
try{
 app=await electron.launch({cwd:root,args:['.'],env:{...process.env,PM_SLASH_DATA_DIR:profile,PM_SLASH_TEST_HIDDEN:'1',PM_SLASH_DEV_SERVER_URL:''}});page=await app.firstWindow();page.setDefaultTimeout(15000);page.on('pageerror',error=>evidence.pageErrors.push(error.message));await page.locator('.brand').waitFor();evidence.pageUrl=page.url();assert.ok(page.url().startsWith('file:'));
 const rendererHtml=await fs.readFile(path.join(root,'dist','renderer','index.html'),'utf8'),rendererAsset=rendererHtml.match(/src="\.\/([^\"]+\.js)"/)?.[1];assert.ok(rendererAsset);evidence.rendererHash=createHash('sha256').update(await fs.readFile(path.join(root,'dist','renderer',rendererAsset))).digest('hex');
 assert.equal(path.resolve(await app.evaluate(({app})=>app.getPath('userData'))).toLowerCase(),profile.toLowerCase());
 await app.evaluate(({ipcMain},hiddenHistory)=>{
  const original=ipcMain._invokeHandlers.get('pm:request');if(!original)throw Error('IPC fixture hook unavailable');
  globalThis.__templatePickerFixture={sends:[],failSend:false,showHistory:false,hiddenHistory};
  ipcMain.removeHandler('pm:request');ipcMain.handle('pm:request',async(event,request)=>{
   const fixture=globalThis.__templatePickerFixture;
   if(request.type==='send'){fixture.sends.push(JSON.parse(JSON.stringify(request)));if(fixture.failSend){await new Promise(resolve=>setTimeout(resolve,250));return{ok:false,error:'UI_TEMPLATE_FIXTURE_SEND_FAILED'};}return{ok:true,data:'synthetic-send-only'};}
   const response=await original(event,request);
   if(request.type==='state'&&response.ok&&!fixture.showHistory)return{...response,data:{...response.data,conversations:response.data.conversations.filter(item=>item.id!==fixture.hiddenHistory),runs:response.data.runs.filter(item=>item.conversationId!==fixture.hiddenHistory)}};
   return response;
  });
 },historyId);
 await page.reload();await page.locator('.brand').waitFor();await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(1366,900));
 await call({type:'modelUpsert',model:{provider:'loopback',name:'合成UI模型（发送已拦截）',baseUrl:'http://127.0.0.1:9/v1',modelId:'synthetic-template-ui',protocol:'openai-completions'},key:'synthetic-isolated-key-not-real'});const models=await call({type:'models'}),model=models.groups.flatMap(group=>group.models).find(item=>item.modelId==='synthetic-template-ui');assert.ok(model);await call({type:'modelDefault',id:model.id});
 if(!switchesOnly){
 assert.equal((await call({type:'state'})).conversations.length,0);
 await pickTemplate();await input().fill('UI-FRESH-ERROR：按模板整理合成需求');const failed=await sendAndRecord({fail:true});
 await page.getByRole('alert').filter({hasText:'UI_TEMPLATE_FIXTURE_SEND_FAILED'}).waitFor();await chip().waitFor();assert.equal(await input().inputValue(),'UI-FRESH-ERROR：按模板整理合成需求');assert.equal(failed.workflow.kind,'prd');assert.deepEqual(failed.workflow.template,word);assert.ok(failed.id);assert.equal((await call({type:'state'})).conversations.length,1);await screenshot('fresh-conversation-failed-send');check('无会话首次发送真实创建会话；合成发送失败后模板与输入保留');

 await openPicker();await picker().getByRole('checkbox',{name:'引用资料 合成业务资料.txt',exact:true}).check();await assertPickerBounds();await screenshot('picker-normal');await chooseTemplate('合成模板B.md');await confirm();await normalReferencePresent();assert.match(await chip().innerText(),/合成模板B.md/);
 await openPicker();await picker().getByRole('button',{name:'取消 PRD 模板 合成模板B.md',exact:true}).click();await confirm();assert.equal(await chip().count(),0);await normalReferencePresent();
 await openPicker();await picker().getByRole('checkbox',{name:'引用资料 合成模板A.docx',exact:true}).check();await chooseTemplate('合成模板A.docx');assert.equal(await picker().getByRole('checkbox',{name:'引用资料 合成模板A.docx',exact:true}).isChecked(),false);await confirm();await page.getByRole('button',{name:'移除 PRD 模板',exact:true}).click();assert.equal(await chip().count(),0);await normalReferencePresent();check('模板 A 替换 B、选择器取消模板、输入区清除均保留普通参考资料；同文件不会兼任模板与普通引用');

 await pickTemplate();await openPicker();await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(1000,700));await assertPickerBounds();await screenshot('picker-narrow');await picker().getByRole('button',{name:'关闭引用资料选择器',exact:true}).click();await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(1366,900));check('1366×900 与生产最小宽度 1000×700 下选择器无越界、横向溢出或嵌套按钮');

 const conflicting='/prototype UI-COMMAND-CONFLICT 保留原输入';await input().fill(conflicting);await page.getByText('当前命令与 PRD 模板冲突。',{exact:true}).waitFor();const beforeConflict=(await fixture()).sends.length;await page.getByRole('button',{name:'发送',exact:true}).click();assert.equal((await fixture()).sends.length,beforeConflict);assert.equal(await input().inputValue(),conflicting);await chip().waitFor();await screenshot('explicit-command-conflict');await page.getByRole('button',{name:'改用 PRD',exact:true}).click();assert.equal(await input().inputValue(),'/prd UI-COMMAND-CONFLICT 保留原输入');check('显式非 PRD 命令阻止发送且输入不变；仅主动点击改用 PRD 才修改命令');
 const researchConflict='/research UI-RESEARCH-CONFLICT';await input().fill(researchConflict);await page.getByText('当前命令与 PRD 模板冲突。',{exact:true}).waitFor();await page.getByRole('button',{name:'移除模板',exact:true}).click();await chip().waitFor({state:'hidden'});assert.equal(await input().inputValue(),researchConflict);await normalReferencePresent();await pickTemplate();assert.equal(await input().inputValue(),researchConflict);check('/research 冲突可主动移除模板，引用资料与输入保留；重新选模板也不偷改命令');
 await setMode('build');await input().fill('UI-NATURAL-TEMPLATE：按模板整理审批需求');const natural=await sendAndRecord();assert.equal(natural.workflow.kind,'prd');assert.equal(natural.taskType,'writing');assert.deepEqual(natural.workflow.template,word);assert.deepEqual(natural.workflow.sources,[reference]);await chip().waitFor({state:'hidden'});assert.equal(await input().inputValue(),'');assert.equal(await page.getByRole('button',{name:`移除引用资料 ${reference.path}`,exact:true}).count(),0);check('自然语言实际发送独立 PRD template 与业务 sources；合成成功后清除本次选择');

 await pickTemplate('合成模板B.md');await input().fill('');const templateOnly=await sendAndRecord();assert.equal(templateOnly.workflow.kind,'prd');assert.deepEqual(templateOnly.workflow.template,markdown);assert.deepEqual(templateOnly.workflow.sources,[]);assert.ok(templateOnly.text.length>0);check('仅选模板可发送，模板不重复放入普通来源');
 await pickTemplate();await input().fill('/plan UI-PLAN-TEMPLATE：先核对结构');const beforePlan=await call({type:'state'}),plan=await sendAndRecord();const afterPlan=await call({type:'state'});assert.equal(plan.mode,'plan');assert.equal(plan.workflow.kind,'prd');assert.deepEqual(plan.workflow.template,word);assert.equal(afterPlan.changes.length,beforePlan.changes.length);assert.equal(afterPlan.runs.length,beforePlan.runs.length);check('/plan 保持 Plan 并携带模板；发送替身没有执行、生成真实 Run 或修改成果');
 }

 await pickTemplate();await page.locator('.sidebar .new').click();await chip().waitFor({state:'hidden'});check('新会话清除模板选择');
 await app.evaluate(()=>{globalThis.__templatePickerFixture.showHistory=true;});await page.reload();await page.locator('.brand').waitFor();await page.locator('.sidebar').getByRole('button',{name:'合成模板历史任务',exact:true}).click();const details=page.locator(`.reply-details[data-run-id="${historyRunId}"]`);await details.getByRole('button',{name:'生成与执行',exact:true}).click();await details.getByRole('button',{name:'调整资料与任务后重试',exact:true}).click();await chip().waitFor();assert.match(await chip().innerText(),/合成模板A.docx/);await normalReferencePresent();assert.match(await input().inputValue(),/UI-HISTORY-TEMPLATE/);check('合成历史任务重新编辑恢复模板与原业务来源');
 await page.locator('.sidebar .new').click();await chip().waitFor({state:'hidden'});await pickTemplate();await page.locator('.sidebar').getByRole('button',{name:'合成模板历史任务',exact:true}).click();await chip().waitFor({state:'hidden'});check('切换已有会话清除模板选择');
 await pickTemplate();await page.locator('.project-row').filter({hasText:'template-secondary'}).click();await chip().waitFor({state:'hidden'});await waitValue(()=>call({type:'state'}),value=>path.resolve(value.root)===path.resolve(secondWorkspace));check('切换真实隔离项目清除模板选择');
 evidence.sends=(await fixture()).sends;assert.deepEqual(evidence.pageErrors,[]);evidence.status='passed';
}catch(error){evidence.status='failed';evidence.error=error.stack||String(error);if(page){await screenshot('failure').catch(()=>{});evidence.domDiagnostic=await page.evaluate(()=>({url:location.href,alerts:[...document.querySelectorAll('[role="alert"],.alert')].map(node=>({tag:node.tagName,className:node.className,text:node.textContent,display:getComputedStyle(node).display})),header:[...document.querySelectorAll('header button')].map(node=>({label:node.getAttribute('aria-label'),title:node.title,text:node.textContent}))})).catch(()=>null);}if(app)evidence.sends=(await fixture().catch(()=>({sends:[]}))).sends;process.exitCode=1;}
finally{if(app){await app.close();evidence.spawnedAppClosed=true;}await fs.writeFile(path.join(output,'result.json'),JSON.stringify(evidence,null,2));console.log(JSON.stringify({status:evidence.status,output,checks:evidence.checks.length,error:evidence.error}));}
