import {_electron as electron} from 'playwright';
import {createServer} from 'node:http';
import {randomUUID,createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {Store} from '../dist/main/store.js';
import {Service} from '../dist/main/service.js';
import {composerTrigger,composerPopup,chooseComposerPermission,ensureLegacyFixtureMounts} from './composer-smoke-helpers.mjs';

// Owner builds first. All files, IPC mutations and HTTP requests use this fresh
// profile and a loopback Pi fixture. No cloud model or user workspace is used.
const root=process.cwd(),packaged=process.argv.includes('--packaged');
const executableIndex=process.argv.indexOf('--executable');
const executablePath=executableIndex>=0?path.resolve(process.argv[executableIndex+1]):path.join(root,'release','win-unpacked','slash.exe');
const output=path.join(root,'.test-data',`workspace-ui-${packaged?'packaged':'development'}-${Date.now()}`);
const profile=path.join(output,'profile'),workspace=path.join(output,'当前项目'),alternate=path.join(output,'另一个项目');
await fs.mkdir(output,{recursive:true});
const store=new Store(profile),service=new Service(store,()=>'',()=>{});
async function assertEmptyNewProject(directory){
 const files=[];
 async function walk(relative=''){for(const item of await fs.readdir(path.join(directory,relative),{withFileTypes:true})){const name=path.join(relative,item.name);if(item.isDirectory())await walk(name);else files.push(name.replace(/\\/g,'/'));}}
 await walk();assert.deepEqual(files.sort(),['AGENTS.md'],'新项目只自动生成AGENTS.md，不写示例或单数agent.md');
 assert.deepEqual((await fs.readdir(path.join(directory,'资源'))).sort(),['skills','参考资料','模板'].sort());
 for(const name of ['PRD','蓝图','会议纪要','调研报告'])assert.deepEqual(await fs.readdir(path.join(directory,'资源','模板',name)),[]);
 assert.equal((await fs.readFile(path.join(directory,'AGENTS.md'),'utf8')).match(/slash:resource-index:start/g)?.length,1);
}
async function assertUnifiedProjectRules(directory){
 const content=await fs.readFile(path.join(directory,'AGENTS.md'),'utf8');
 assert.match(content,/UI-WORKSPACE-RULE/,'人工规则应与自动索引保存在同一AGENTS.md');
 assert.equal(content.match(/slash:resource-index:start/g)?.length,1);
 assert.equal(content.match(/slash:resource-index:end/g)?.length,1);
 await assert.rejects(fs.access(path.join(directory,'agent.md')),error=>error.code==='ENOENT');
 return content;
}
await service.workspace(alternate);
await assertEmptyNewProject(alternate);
await fs.writeFile(path.join(alternate,'资源','参考资料','其他项目不可见.md'),'other project only');
await service.workspace(workspace);await assertEmptyNewProject(workspace);await ensureLegacyFixtureMounts(service);
const conversationId=service.conversation(undefined,'本轮界面验证');
service.state.conversations.find(item=>item.id===conversationId).messages.push({role:'assistant',time:'2026-10-04T01:00:00Z',text:'# 历史回复\n\n无生成耗时的历史数据。'});
await fs.writeFile(path.join(workspace,'资源','参考资料','资料来源.md'),'# 来源\n\nUI-REAL-SOURCE，退回原因必填。');
await fs.writeFile(path.join(workspace,'资源','skills','SKILL.md'),'# 自建 skill\n\nUI-USER-SKILL，由测试用户主动添加。');
await fs.writeFile(path.join(workspace,'资源','模板','PRD','真实PRD模板.md'),'# 模板\n\n业务规则与验收条件。');
await fs.mkdir(path.join(workspace,'资源','旧分类'),{recursive:true});
await fs.writeFile(path.join(workspace,'资源','旧分类','保留旧资料.md'),'Do not hide or remove');
await fs.writeFile(path.join(workspace,'产出材料','旧成果.md'),'# 旧成果仍可阅读');
for(const name of ['原型','PRD','流程图','调研报告','会议纪要','其他'])await fs.writeFile(path.join(workspace,'成果',name,`${name}成果.md`),`# ${name}\n真实目录成果。`);
await fs.appendFile(path.join(workspace,'AGENTS.md'),'\n# 项目规则\n\nUI-WORKSPACE-RULE：缺失依据必须明确标记。\n');
await assertUnifiedProjectRules(workspace);
service.save();store.close();
const evidence={status:'running',output,profile,packaged,checks:[],screenshots:[],requests:[],pageErrors:[],runs:[],limitations:[
 'Loopback HTTP streams exercise the real Pi runtime and persisted timing, not cloud model quality.',
 'Import uses the real target-aware IPC and filesystem; native drag transport is not simulated.',
 'The historical reply is an explicitly seeded compatibility fixture with no fabricated timing.'
]};
const reply='# 完整 Markdown\n\n**加粗**与[链接](https://example.com)。\n\n```ts\nconst verified = true;\n```\n\n结束。';
const sockets=new Set();
const server=createServer(async(req,res)=>{
 try{
  if(req.method==='GET'){res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({id:'ui-local-model'}));return;}
  let raw='';for await(const chunk of req)raw+=chunk;const data=JSON.parse(raw);evidence.requests.push(data);
  const held=JSON.stringify(data.messages.findLast(message=>message.role==='user')).includes('UI-HOLD-CANCEL');
  const limited=JSON.stringify(data.messages.findLast(message=>message.role==='user')).includes('UI-OUTPUT-LIMIT');
  const base={id:'chatcmpl-'+randomUUID(),object:'chat.completion.chunk',created:Math.floor(Date.now()/1000),model:data.model};
  res.writeHead(200,{'content-type':'text/event-stream'});
  const chunk=(content,finish=null)=>res.write('data: '+JSON.stringify({...base,choices:[{index:0,delta:content?{role:'assistant',content}:{},finish_reason:finish}]})+'\n\n');
  chunk(held?'# 尚未完成\n\n取消后保留的真实流式正文。':reply.slice(0,30));
  if(held)return;
  setTimeout(()=>{if(res.destroyed)return;chunk(reply.slice(30));chunk('', limited?'length':'stop');res.end('data: [DONE]\n\n');},350);
 }catch(error){res.writeHead(500);res.end(String(error));}
});
server.on('connection',socket=>{sockets.add(socket);socket.on('close',()=>sockets.delete(socket));});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const port=server.address().port;
let app,page;
const check=name=>{evidence.checks.push(name);console.log('PASS '+name);};
check('新项目资源三类和四类模板空目录，仅自动生成AGENTS.md，无示例或单数agent.md');
const normalizeClipboard=text=>text.replace(/\r\n/g,'\n');
const call=async request=>{const result=await page.evaluate(value=>window.pm.request(value),request);assert.ok(result.ok,result.error);return result.data;};
async function readyProjectTree(){const result=await page.evaluate(()=>window.pm.request({type:'projectTreeGet'}));if(!result.ok&&result.error?.startsWith('VERSION_CONFLICT'))return undefined;assert.ok(result.ok,result.error);return result.data;}
async function waitValue(read,predicate,timeout=20000){const deadline=Date.now()+timeout;while(Date.now()<deadline){const value=await read();if(predicate(value))return value;await new Promise(resolve=>setTimeout(resolve,60));}assert.fail('Timed out waiting for the expected state/value');}
async function screenshot(name){const file=name+'.png';await page.screenshot({path:path.join(output,file)});evidence.screenshots.push(file);}
async function openView(name){
 await page.locator('.rail-item').filter({has:page.getByText(name,{exact:true})}).click();
 const tabs=page.getByRole('tablist',{name:name==='资源'?'资源分类':'成果分类',exact:true});
 await tabs.waitFor();
 // The tablist's first button is rendered before the files/projectTreeGet IPC
 // completes. Wait for real project metadata and its last required tab; the
 // exact tab-array assertions below still catch missing or extra categories.
 await page.locator('.project-index-status[aria-label="资料索引同步状态"]').waitFor();
 await tabs.getByRole('tab',{name:name==='资源'?'参考资料':'其他',exact:true}).waitFor();
}
async function settingsTab(name){await page.locator('.settings-nav').getByRole('button',{name,exact:true}).click();}
async function settingsOpen(){await page.getByRole('button',{name:'设置',exact:true}).click();await page.getByRole('dialog',{name:'设置',exact:true}).waitFor();}
async function settingsClose(){await page.getByRole('button',{name:'关闭设置',exact:true}).click();}
async function send(text,mode='build'){
 const previousRunIds=new Set((await call({type:'state'})).runs.map(run=>run.id));
 await composerTrigger(page,'模式').click();await composerPopup(page,'模式').getByRole('radio').filter({hasText:mode==='plan'?'Plan':'Build'}).click();
 await page.getByLabel('描述你的任务').fill(text);await page.getByRole('button',{name:'发送',exact:true}).click();
 const started=await waitValue(()=>call({type:'state'}),state=>state.runs.some(run=>!previousRunIds.has(run.id)));
 return started.runs.find(run=>!previousRunIds.has(run.id)).id;
}
try{
 const common={cwd:root,env:{...process.env,PM_SLASH_DATA_DIR:profile}};
 app=await electron.launch(packaged?{...common,executablePath}:{...common,args:['.']});page=await app.firstWindow();page.setDefaultTimeout(12000);page.on('pageerror',error=>evidence.pageErrors.push(error.message));await page.locator('.brand').waitFor();
 assert.equal(path.resolve(await app.evaluate(({app})=>app.getPath('userData'))),path.resolve(profile));
 await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(1366,900));
 await page.locator('.sidebar').getByRole('button',{name:'本轮界面验证',exact:true}).click();
 const historical=page.locator('.message.assistant').filter({hasText:'历史回复'}).locator('.message-footer');assert.match(await historical.innerText(),/记录时间/);assert.doesNotMatch(await historical.innerText(),/耗时|生成完成/);check('历史回复不伪造生成完成时点或耗时');
 for(const label of ['模式','权限']){await composerTrigger(page,label).click();const popup=composerPopup(page,label);await popup.waitFor();assert.equal(await popup.getByRole('radiogroup',{name:label,exact:true}).count(),1);assert.equal(await popup.getByRole('radiogroup',{name:label==='模式'?'权限':'模式',exact:true}).count(),0);await screenshot(label+'独立浮层');await page.keyboard.press('Escape');await popup.waitFor({state:'hidden'});}
 await chooseComposerPermission(page,'自动接受');await composerTrigger(page,'权限').click();assert.equal(await composerPopup(page,'权限').getByRole('radio').filter({hasText:'自动接受'}).getAttribute('aria-checked'),'true');await page.keyboard.press('Escape');await composerPopup(page,'权限').waitFor({state:'hidden'});await chooseComposerPermission(page,'完全访问');assert.equal(await page.getByRole('combobox',{name:'产品工作流'}).count(),0);check('Build/Plan和三种权限独立，内部权限语义保留');
 await openView('资源');assert.deepEqual(await page.getByRole('tablist',{name:'资源分类',exact:true}).getByRole('tab').allTextContents(),['项目目录','skills','模板','参考资料']);
 assert.equal(await page.locator('.file-row').filter({hasText:'其他项目不可见.md'}).count(),0);await page.locator('.folder-card').filter({hasText:'旧分类'}).waitFor();await page.locator('.file-row').filter({hasText:'保留旧资料.md'}).waitFor();await screenshot('资源项目目录');
 await page.getByRole('tablist',{name:'资源分类',exact:true}).getByRole('tab',{name:'skills',exact:true}).click();await page.locator('.file-row').filter({hasText:'SKILL.md'}).waitFor();assert.equal(await page.locator('.file-row').count(),1);await screenshot('skills自建文件分类');
 const defaultImportFile=path.join(output,'默认导入参考资料.md');await fs.writeFile(defaultImportFile,'# 用户资料\nUI-DEFAULT-REFERENCE');await call({type:'importFiles',files:[defaultImportFile],category:'resource'});const referenceFilePath=path.join(workspace,'资源','参考资料','默认导入参考资料.md');await fs.stat(referenceFilePath);await page.getByRole('tablist',{name:'资源分类',exact:true}).getByRole('tab',{name:'参考资料',exact:true}).click();await page.getByRole('button',{name:'刷新',exact:true}).click();const referenceRow=page.locator('.file-row').filter({hasText:'默认导入参考资料.md'});await referenceRow.waitFor();await page.getByText('参考只读 · 可导入新文件；转换或脚本请先创建处理副本，保留原件。',{exact:true}).waitFor();assert.match(await referenceRow.innerText(),/参考只读/);
 const digest=bytes=>createHash('sha256').update(bytes).digest('hex'),sourceBefore=digest(await fs.readFile(referenceFilePath));
 await referenceRow.getByRole('button',{name:'阅读',exact:true}).click();await page.locator('.preview-head').getByText('参考只读',{exact:true}).waitFor();await page.locator('.preview-more>summary').click();assert.equal(await page.locator('.preview').getByRole('button',{name:'导出 Word',exact:true}).isDisabled(),true);await page.locator('.preview').getByRole('button',{name:'创建处理副本',exact:true}).waitFor();await page.keyboard.press('Escape');await page.getByRole('button',{name:'关闭预览',exact:true}).click();
 const beforeCopyKeys=new Set((await call({type:'files'})).map(file=>file.mountId+'::'+file.path));await referenceRow.click({button:'right'});const fileMenu=page.getByRole('menu');await fileMenu.getByText('参考只读 · 原件保留',{exact:true}).waitFor();assert.equal(await fileMenu.getByRole('menuitem',{name:/重命名|删除/}).count(),0);await screenshot('参考只读与处理副本菜单');await fileMenu.getByRole('menuitem',{name:'创建处理副本',exact:true}).click();await waitValue(()=>page.getByLabel('描述你的任务').inputValue(),value=>value.includes('copyId='));
 const newCopyFiles=(await call({type:'files'})).filter(file=>!beforeCopyKeys.has(file.mountId+'::'+file.path));assert.equal(newCopyFiles.length,1);const processingFile=newCopyFiles[0];assert.match(processingFile.path,/默认导入参考资料_处理副本_[^\\/]+\.md$/);assert.equal((await call({type:'fileProtection',mountId:processingFile.mountId,path:processingFile.path})).writable,true);const copyMount=(await call({type:'state'})).mounts.find(mount=>mount.id===processingFile.mountId);assert.equal(digest(await fs.readFile(path.join(copyMount.path,processingFile.path))),sourceBefore);assert.equal(digest(await fs.readFile(referenceFilePath)),sourceBefore);assert.match(await page.getByLabel('描述你的任务').inputValue(),/转换或脚本仅处理这个副本/);await screenshot('处理副本加入会话');await page.getByRole('button',{name:'关闭预览',exact:true}).click();await openView('资源');
 const unsupportedSource=path.join(output,'待处理数据.bin'),unsupportedBytes=Buffer.from([0,1,2,255,10,20]);await fs.writeFile(unsupportedSource,unsupportedBytes);await call({type:'importFiles',files:[unsupportedSource],category:'resource'});await page.getByRole('tablist',{name:'资源分类',exact:true}).getByRole('tab',{name:'参考资料',exact:true}).click();await page.getByRole('button',{name:'刷新',exact:true}).click();const unsupportedRow=page.locator('.file-row').filter({hasText:'待处理数据.bin'});await unsupportedRow.waitFor();const beforeUnsupportedKeys=new Set((await call({type:'files'})).map(file=>file.mountId+'::'+file.path));await unsupportedRow.click({button:'right'});await page.getByRole('menu').getByRole('menuitem',{name:'创建处理副本',exact:true}).click();await page.getByText('副本已加入会话，预览暂不可用；可在会话中请求处理，原件保留。',{exact:true}).waitFor();assert.equal(await page.locator('.preview').count(),0);const unsupportedCopies=(await call({type:'files'})).filter(file=>!beforeUnsupportedKeys.has(file.mountId+'::'+file.path));assert.equal(unsupportedCopies.length,1);const unsupportedCopy=unsupportedCopies[0];assert.match(unsupportedCopy.path,/待处理数据_处理副本_[^\\/]+\.bin$/);assert.equal((await call({type:'fileProtection',mountId:unsupportedCopy.mountId,path:unsupportedCopy.path})).writable,true);const unsupportedMount=(await call({type:'state'})).mounts.find(mount=>mount.id===unsupportedCopy.mountId);assert.deepEqual(await fs.readFile(path.join(unsupportedMount.path,unsupportedCopy.path)),unsupportedBytes);assert.deepEqual(await fs.readFile(path.join(workspace,'资源','参考资料','待处理数据.bin')),unsupportedBytes);assert.ok((await page.getByLabel('描述你的任务').inputValue()).includes(unsupportedCopy.path));await page.getByRole('button',{name:`移除引用资料 ${unsupportedCopy.path}`,exact:true}).waitFor();await screenshot('不支持预览副本仍加入会话');await openView('资源');check('skills仅为文件分类；参考可导入且只读，支持和不支持预览格式的后缀副本均加入会话，原件hash不变');
 await page.getByRole('tab',{name:'模板',exact:true}).click();assert.deepEqual(await page.getByRole('tablist',{name:'模板子目录',exact:true}).getByRole('tab').allTextContents(),['全部','PRD','蓝图','会议纪要','调研报告']);await page.getByRole('tablist',{name:'模板子目录',exact:true}).getByRole('tab',{name:'PRD',exact:true}).click();await page.locator('.file-row').filter({hasText:'真实PRD模板.md'}).getByRole('button',{name:'阅读',exact:true}).click();await page.locator('.document-reader').waitFor();await screenshot('模板真实子目录和预览');await page.getByRole('button',{name:'关闭预览',exact:true}).click();check('资源全树/真实模板子目录/旧目录/当前项目隔离可浏览与预览');
 let tree=await call({type:'projectTreeGet'});const resource=tree.appliedNodes.find(node=>node.role==='resource'),outputNode=tree.appliedNodes.find(node=>node.role==='output');
 const importFile=path.join(output,'导入到模板.md');await fs.writeFile(importFile,'# 导入\nUI-IMPORTED-SOURCE');await call({type:'importFiles',files:[importFile],category:'resource',target:{mountId:resource.mountId,path:'模板/PRD'}});await page.getByRole('button',{name:'刷新',exact:true}).click();await page.locator('.file-row').filter({hasText:'导入到模板.md'}).waitFor();assert.match(await fs.readFile(path.join(workspace,'资源','模板','PRD','导入到模板.md'),'utf8'),/UI-IMPORTED/);assert.match(await assertUnifiedProjectRules(workspace),/导入到模板/);check('当前子目录目标导入同步AGENTS.md，人工规则与managed索引同文件保留');
 await openView('成果');assert.deepEqual(await page.getByRole('tablist',{name:'成果分类',exact:true}).getByRole('tab').allTextContents(),['全部成果','原型','PRD','流程图','调研报告','会议纪要','其他']);await page.locator('.folder-card').filter({hasText:'产出材料'}).waitFor();await page.locator('.file-row').filter({hasText:'旧成果.md'}).waitFor();for(const name of ['原型','PRD','流程图','调研报告','会议纪要','其他']){await page.getByRole('tablist',{name:'成果分类',exact:true}).getByRole('tab',{name,exact:true}).click();await page.locator('.file-row').filter({hasText:`${name}成果.md`}).waitFor();assert.equal(await page.locator('.file-row').count(),1);}await screenshot('成果真实文件夹分类');check('六类成果按真实角色目录显示，旧成果挂载保持可见');
 await settingsOpen();await settingsTab('工作空间');const structure=page.locator('[data-setting-id="project-structure"]');await structure.getByLabel('在资源/参考资料添加子文件夹', {exact:true}).click();await structure.getByLabel('资源/参考资料/新文件夹文件夹名称',{exact:true}).fill('新建资料类别');await structure.getByRole('button',{name:'应用结构',exact:true}).click();await waitValue(()=>call({type:'projectTreeGet'}),value=>value.appliedNodes.some(node=>JSON.stringify(node).includes('新建资料类别')));await fs.stat(path.join(workspace,'资源','参考资料','新建资料类别'));await screenshot('设置真实目录结构');
 await structure.getByLabel('资源/模板/PRD文件夹名称',{exact:true}).fill('需求文档');await structure.getByLabel('成果文件夹名称',{exact:true}).fill('项目交付');await structure.getByRole('button',{name:'应用结构',exact:true}).click();await waitValue(()=>call({type:'projectTreeGet'}),value=>value.appliedNodes.some(node=>node.name==='项目交付'));await fs.stat(path.join(workspace,'成果','PRD','PRD成果.md'));await fs.stat(path.join(workspace,'资源','模板','PRD','导入到模板.md'));
 await settingsTab('系统提示词');const prompt=page.getByLabel('系统提示词内容',{exact:true});await prompt.fill('UI-SYSTEM-PROMPT：回复使用中文，保留事实与假设的区别。');await settingsTab('通用');await settingsTab('系统提示词');assert.match(await prompt.inputValue(),/UI-SYSTEM-PROMPT/);await page.getByRole('button',{name:'保存提示词',exact:true}).click();await waitValue(()=>call({type:'systemPromptGet'}),value=>value.content.includes('UI-SYSTEM-PROMPT'));await screenshot('系统提示词保存');await settingsClose();check('目录结构实际应用；系统提示词切tab保留草稿并实际保存');
 await openView('资源');await page.locator('.folder-card').filter({hasText:'模板/PRD'}).waitFor();await page.locator('.file-row').filter({hasText:'导入到模板.md'}).waitFor();assert.equal(await page.locator('.file-row').filter({hasText:'PRD成果.md'}).count(),0);await openView('成果');await page.locator('.file-row').filter({hasText:'PRD成果.md'}).waitFor();await screenshot('结构改名保留旧资源与成果');check('结构子目录与成果根改名后文件仍可访问，旧成果role保留');
 await page.locator('.sidebar').getByRole('button',{name:'本轮界面验证',exact:true}).click();
 await call({type:'modelUpsert',model:{provider:'loopback',name:'本地真实Pi验证',baseUrl:`http://127.0.0.1:${port}/v1`,modelId:'ui-local-model',protocol:'openai-completions'},key:'isolated-ui-key'});const models=await call({type:'models'});const model=models.groups.flatMap(group=>group.models).find(model=>model.modelId==='ui-local-model');await call({type:'modelDefault',id:model.id});
 const runId=await send('/prototype UI-COMPLETE');const finished=await waitValue(()=>call({type:'state'}),state=>['succeeded','failed','cancelled'].includes(state.runs.find(run=>run.id===runId)?.status),45000);const run=finished.runs.find(run=>run.id===runId);assert.equal(run.status,'succeeded',run.error);assert.equal(run.modelRoute.taskType,'coding');assert.ok(run.generationStartedAt&&run.generationFinishedAt&&run.generationDurationMs>=0);assert.ok(run.agentIndexReceipt?.contentHash);const completed=finished.conversations.find(item=>item.id===conversationId).messages.find(message=>message.runId===runId&&message.role==='assistant');assert.equal(completed.text,reply);assert.ok(completed.completedAt);assert.equal(completed.generationDurationMs,run.generationDurationMs);const completeFooter=page.locator('.message.assistant').filter({hasText:'完整 Markdown'}).locator('.message-footer');await completeFooter.getByRole('button',{name:'复制完整回复'}).click();await completeFooter.getByText('已复制',{exact:true}).waitFor();assert.equal(normalizeClipboard(await waitValue(()=>app.evaluate(({clipboard})=>clipboard.readText()),text=>normalizeClipboard(text)===reply)),reply);assert.match(await completeFooter.innerText(),/生成完成.*耗时/);await screenshot('回复复制真实完成耗时');evidence.runs.push(run);check('真实Pi回复保存完成时点/耗时，复制完整Markdown，/prototype模型分类保留');
 const limitId=await send('UI-OUTPUT-LIMIT');const limitState=await waitValue(()=>call({type:'state'}),state=>['interrupted','failed','succeeded'].includes(state.runs.find(run=>run.id===limitId)?.status),45000);const limitedRun=limitState.runs.find(run=>run.id===limitId);assert.equal(limitedRun.status,'interrupted');assert.equal(limitedRun.interruptionReason,'model_output_limit');assert.equal(limitedRun.resumable,true);await page.getByRole('button',{name:'继续生成',exact:true}).waitFor();await page.locator('.message-footer').filter({hasText:'达到输出上限 · 部分回复'}).waitFor();await screenshot('模型输出上限保留回复可继续生成');
 const holdId=await send('UI-HOLD-CANCEL');await page.locator('.message.assistant').filter({hasText:'尚未完成'}).waitFor();const streamingFooter=page.locator('.message.assistant').filter({hasText:'尚未完成'}).locator('.message-footer');assert.match(await streamingFooter.innerText(),/正在生成/);assert.equal(await streamingFooter.locator('time').count(),0);assert.doesNotMatch(await streamingFooter.innerText(),/耗时|生成完成/);await screenshot('流式回复不伪造耗时');await page.getByRole('button',{name:'停止任务',exact:true}).click();await waitValue(()=>call({type:'state'}),state=>state.runs.find(run=>run.id===holdId)?.status==='cancelled',30000);await page.locator('.message-footer').filter({hasText:'已取消 · 部分回复'}).waitFor();check('模型上限可继续生成，生成中无假耗时，真实取消partial明确标识');
 const planId=await send('UI-PLAN-RULES','plan');const planState=await waitValue(()=>call({type:'state'}),state=>['awaiting_plan','failed'].includes(state.runs.find(run=>run.id===planId)?.status),45000);const plan=planState.runs.find(run=>run.id===planId);assert.equal(plan.status,'awaiting_plan',plan.error);assert.ok(plan.agentIndexReceipt?.contentHash);assert.equal(plan.agentIndexReceipt.path,'AGENTS.md');const requestText=JSON.stringify(evidence.requests.at(-1));assert.match(requestText,/UI-PLAN-RULES/);assert.match(requestText,/UI-SYSTEM-PROMPT/);assert.match(requestText,/UI-WORKSPACE-RULE/);assert.match(requestText,/导入到模板\.md/);await assertUnifiedProjectRules(workspace);check('Plan实际读取系统规范与同一AGENTS.md中的人工规则、managed索引');
 await settingsOpen();await settingsTab('系统提示词');await page.getByRole('button',{name:'恢复默认',exact:true}).click();await waitValue(()=>call({type:'systemPromptGet'}),value=>value.isDefault);await settingsClose();check('恢复默认真实保存');
 await app.close();app=await electron.launch(packaged?{...common,executablePath}:{...common,args:['.']});page=await app.firstWindow();page.setDefaultTimeout(12000);page.on('pageerror',error=>evidence.pageErrors.push(error.message));await page.locator('.brand').waitFor();const restoredTree=await waitValue(readyProjectTree,value=>value?.root===workspace);assert.equal(restoredTree.mountRoles[outputNode.mountId],'output');assert.ok(restoredTree.appliedNodes.some(node=>node.name==='项目交付'));assert.equal((await call({type:'systemPromptGet'})).isDefault,true);await openView('成果');await page.locator('.file-row').filter({hasText:'PRD成果.md'}).waitFor();check('重启后结构/旧成果role/默认提示词实际恢复');
 await assertUnifiedProjectRules(workspace);
 assert.deepEqual(evidence.pageErrors,[]);evidence.status='passed';
}catch(error){evidence.status='failed';evidence.error=String(error);if(page)await screenshot('failure').catch(()=>{});throw error;}
finally{await fs.writeFile(path.join(output,'result.json'),JSON.stringify(evidence,null,2));if(app)await app.close();for(const socket of sockets)socket.destroy();await new Promise(resolve=>server.close(resolve));console.log(JSON.stringify({status:evidence.status,output,checks:evidence.checks.length,error:evidence.error}));}








