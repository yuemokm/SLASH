import {_electron as electron} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import ExcelJS from 'exceljs';
import {Store} from '../dist/main/store.js';
import {Service} from '../dist/main/service.js';
import {testCaseSourceId} from '../dist/main/test-cases.js';

// Run after the owner's unified build: node scripts/test-cases-ui-smoke.mjs.
// The fixed local runtime seeds a genuine Service draft. Electron then opens
// that persisted draft and uses actual preload/IPC/export code. No cloud model.
const root=process.cwd(),output=path.resolve('.test-data',`test-cases-ui-${Date.now()}`),profile=path.join(output,'profile'),workspace=path.join(output,'project');
await fs.mkdir(output,{recursive:true});
const report={status:'running',output,profile,workspace,cloudCalls:0,checks:[],screenshots:[],pageErrors:[],exportReceipts:[],limitations:['Fixed local generation response; verifies product UI/IPC/export rather than cloud model quality or actual business execution.']};
const stage=async name=>{report.stage=name;await fs.writeFile(path.join(output,'result.json'),JSON.stringify(report,null,2));console.log('STAGE '+name);};
let app,page,service,store,change,invalid,outputMount,sourceMount,conversationId;
const check=name=>{report.checks.push(name);console.log('PASS '+name);};
const shot=async name=>{const filename=name+'.png';await page.screenshot({path:path.join(output,filename)});report.screenshots.push(filename);};
const wait=async fn=>{const until=Date.now()+15000;while(Date.now()<until){if(await fn())return;await new Promise(resolve=>setTimeout(resolve,40));}throw Error('TEST_CASE_UI_FIXTURE_TIMEOUT');};
const hash=value=>createHash('sha256').update(value).digest('hex');
try{
 await stage('creating-service-fixture');
 store=new Store(profile);
 service=new Service(store,()=> 'local-ui-fixture-key',()=>{},async options=>({messages:[{role:'assistant',stopReason:'stop'}],abort:async()=>{},dispose:()=>{},prompt:async()=>{
  const receipt=service.state.runs.find(run=>run.id===options.runId).sourceReads[0];
  const input={mountId:outputMount.id,path:'审批.testcases.json',title:'审批手工测试用例',scope:'退回审批',pendingQuestions:['后台鉴权尚待确认'],cases:[{id:'TC-001',module:'审批',title:'退回原因必填',priority:'P1',type:'exception',preconditions:['主管已登录'],testData:['退回原因为空'],steps:[{action:'清空原因并点击退回',expected:'阻止退回并提示填写原因'}],sourceIds:[testCaseSourceId(receipt)],requirementRefs:[],pendingQuestions:['仅依据PRD候选规则，业务仍待核对']}]};
  await options.log('draft_test_cases',input,()=>options.draftTestCases(input));options.delta('已生成供人工审阅的测试用例，尚未执行。');
 }}));
 await service.workspace(workspace);service.setPermission('workspace_read','allow');service.setPermission('artifact_write','allow');
 sourceMount=service.state.mounts.find(m=>m.name==='资源');outputMount=service.state.mounts.find(m=>m.name==='成果');assert(sourceMount&&outputMount);
 const source={mountId:sourceMount.id,path:'参考资料/审批规则.md',locator:'第3行：退回规则'};await fs.writeFile(path.join(sourceMount.path,source.path),'# 审批规则\n\n退回必须填写原因。');
 conversationId=service.conversation(undefined,'人工测试用例桌面验证');const runId=await service.send(conversationId,'按引用PRD生成手工测试用例','build','standard',undefined,undefined,undefined,'writing',undefined,{kind:'test_cases',sources:[source]});
 await wait(async()=>Boolean(service.state.runs.find(run=>run.id===runId)?.finishedAt));const run=service.state.runs.find(run=>run.id===runId);assert.equal(run.status,'succeeded',run.error);
 change=service.state.changes.find(c=>c.runId===runId);assert(change);assert.equal(change.status,'pending');await assert.rejects(fs.stat(path.join(outputMount.path,change.path)),{code:'ENOENT'});
 // Deliberately malformed fixture tests the reader's error boundary, never a valid generated artifact.
 invalid={...change,id:randomUUID(),path:'无效.testcases.json',content:'{"bad JSON":'};service.state.changes.unshift(invalid);service.save();
 // Navigation fixtures are genuine persisted project data. Saved history must not duplicate rows.
 await fs.writeFile(path.join(outputMount.path,'已保存.testcases.json'),change.content);
 service.state.changes.push({...change,id:randomUUID(),status:'applied',path:'已保存.testcases.json'},{...change,id:randomUUID(),status:'applied',path:'已保存.testcases.json'},{...change,id:randomUUID(),status:'conflict',path:'冲突.testcases.json'});service.save();
 await service.knowledgeCreate({title:'审批知识库',sources:[{mountId:sourceMount.id,path:source.path,displayName:'审批规则'}]});
 service.renameProject(service.listProjects().currentProjectId,'审批项目');
 await service.workspace(path.join(output,'empty-project'));service.renameProject(service.listProjects().currentProjectId,'空白项目');await service.workspace(workspace);
 service.dispose();await Promise.allSettled([...service.agentIndex.queues.values()]);service=undefined;store.close();store=undefined;await stage('launching-isolated-electron');
 app=await electron.launch({cwd:root,args:['.'],env:{...process.env,PM_SLASH_DATA_DIR:profile,PM_SLASH_TEST_HIDDEN:'1',PM_SLASH_DEV_SERVER_URL:''}});
 page=await app.firstWindow();page.setDefaultTimeout(15000);page.on('pageerror',error=>report.pageErrors.push(error.message));await page.locator('.brand').waitFor();assert(page.url().startsWith('file:'));await stage('electron-renderer-ready');
 assert.equal(path.resolve(await app.evaluate(({app})=>app.getPath('userData'))).toLowerCase(),profile.toLowerCase());
 await app.evaluate(({dialog,shell,BrowserWindow},directory)=>{
  globalThis.__testCaseUi={dialogs:[],reveals:[],blocked:0};const fetch=globalThis.fetch.bind(globalThis);
  globalThis.fetch=async(input,init)=>{const url=new URL(input instanceof Request?input.url:String(input));if(['localhost','127.0.0.1','[::1]'].includes(url.hostname))return fetch(input,init);globalThis.__testCaseUi.blocked++;throw Error('TEST_CASE_UI_NO_CLOUD');};
  dialog.showSaveDialog=async(_window,options)=>{globalThis.__testCaseUi.dialogs.push(options.defaultPath);return {canceled:false,filePath:directory+(options.defaultPath.endsWith('.xlsx')?'/桌面用例.xlsx':'/桌面用例.md')};};
  shell.showItemInFolder=filename=>{globalThis.__testCaseUi.reveals.push(filename);};
  const window=BrowserWindow.getAllWindows()[0];window.unmaximize();window.setSize(1440,1000);
 },outputMount.path);
 await stage('feature-navigation');
 const rail=page.locator('.sidebar-rail'),cases=page.getByRole('region',{name:'项目测试用例',exact:true});
 for(const name of ['测试用例','资源']){const nav=rail.getByRole('button',{name,exact:true});assert.equal(await nav.count(),1);assert.equal(await nav.locator('.rail-label').innerText(),name);const iconBox=await nav.locator('.rail-icon').boundingBox(),labelBox=await nav.locator('.rail-label').boundingBox();assert(labelBox.y>iconBox.y);}
 assert.equal(await rail.getByRole('button',{name:'知识库',exact:true}).count(),0);
 await rail.getByRole('button',{name:'测试用例',exact:true}).click();await cases.getByRole('button',{name:'阅读用例',exact:true}).waitFor();assert.equal(await cases.locator('.file-row').count(),4);assert.match(await page.getByLabel('功能所属项目').innerText(),/当前项目 · 审批项目/);assert.match(await cases.innerText(),/文件冲突.*尚未保存/s);await shot('navigation-test-cases');check('rail icons above explicit labels; current-project saved/pending/conflict list without duplicate applied history');
 await cases.locator('.file-row').filter({hasText:'已保存.testcases.json'}).getByRole('button',{name:'阅读用例',exact:true}).click();await page.getByLabel('手工测试用例预览',{exact:true}).waitFor();assert.match(await page.getByLabel('手工测试用例预览').innerText(),/全部未执行/);check('saved test case opens existing readable preview');
 await cases.locator('.file-row').filter({hasText:'冲突.testcases.json'}).getByRole('button',{name:'查看草稿',exact:true}).click();assert.match(await page.getByLabel('资料预览',{exact:true}).innerText(),/文件冲突，未提交/);check('conflict draft remains accessible through existing draft preview');
 const beforeRuns=(await page.evaluate(()=>window.pm.request({type:'state'}))).data.runs.length;
 await cases.getByRole('button',{name:'创建测试用例',exact:true}).click();await page.getByRole('dialog',{name:'选择引用资料',exact:true}).waitFor();assert.match(await page.locator('.composer textarea').inputValue(),/测试用例/);assert.equal((await page.evaluate(()=>window.pm.request({type:'state'}))).data.runs.length,beforeRuns);await page.getByRole('button',{name:'关闭引用资料选择器',exact:true}).click();await shot('navigation-create-in-conversation');check('create enters source picker and editable conversation prompt without generating or calling model');
 await rail.getByRole('button',{name:'资源',exact:true}).click();await page.getByRole('button',{name:'资料集合 →',exact:true}).click();const knowledge=page.getByRole('region',{name:'资料集合',exact:true});await knowledge.getByRole('button').filter({hasText:'审批知识库'}).click();assert.match(await knowledge.innerText(),/资料清单/);for(const name of ['配置向量服务','构建本机索引','查找依据','导出待发布版本'])assert.equal(await knowledge.getByRole('button',{name,exact:true}).count(),0);assert.equal(await page.getByText('提示词已加入输入区；可直接编辑，或移除任务上下文。',{exact:true}).count(),0);await shot('navigation-collections');check('resource collection page preserves saved sources, clears stale chat notice and removes vector/cloud actions');
 const switchTo=async name=>{await page.getByRole('button',{name:'切换功能项目',exact:true}).click();await page.getByRole('option').filter({hasText:name}).click();await wait(async()=>(await page.getByLabel('功能所属项目').innerText()).includes('当前项目 · '+name));};
 await switchTo('空白项目');await knowledge.waitFor();assert.equal(await knowledge.getByRole('button').filter({hasText:'审批知识库'}).count(),0);assert.match(await knowledge.innerText(),/选择或新建一个资料集合/);await shot('navigation-empty-knowledge');check('knowledge project switch stays on page and clears other-project collection selection');
 await rail.getByRole('button',{name:'测试用例',exact:true}).click();await cases.getByText(/当前项目还没有测试用例/).waitFor();assert.equal(await cases.locator('.file-row').count(),0);await shot('navigation-empty-test-cases');await switchTo('审批项目');await cases.getByRole('button',{name:'阅读用例',exact:true}).waitFor();assert.equal(await cases.locator('.file-row').count(),4);check('test case project switch provides clear empty state and restores the chosen project records');
 await rail.getByRole('button',{name:'收起项目侧栏',exact:true}).click();for(const name of ['测试用例','资源'])assert.equal(await rail.getByRole('button',{name,exact:true}).isVisible(),true);await shot('navigation-collapsed-sidebar');await rail.getByRole('button',{name:'展开项目侧栏',exact:true}).click();
 await rail.getByRole('button',{name:'资源',exact:true}).click();await page.getByRole('button',{name:'资料集合 →',exact:true}).click();await knowledge.waitFor();assert.equal(await rail.getByRole('button',{name:'资源',exact:true}).getAttribute('class'),'rail-item active');assert.equal(await page.getByRole('region',{name:'资料集合',exact:true}).count(),1);check('collapsed sidebar retains resource entry and its collection shortcut opens the same collection page');
 await page.locator('.sidebar').getByRole('button',{name:'人工测试用例桌面验证',exact:true}).click();
 const card=name=>page.locator('.change').filter({has:page.getByRole('button',{name,exact:true})});
 await card('审批.testcases.json').getByRole('button',{name:'审批.testcases.json',exact:true}).click();
 const preview=page.getByLabel('手工测试用例预览',{exact:true});await preview.waitFor();assert.match(await preview.innerText(),/全部未执行/);assert.match(await preview.innerText(),/后台鉴权尚待确认/);
 assert.equal(await preview.locator('tbody tr').count(),1);assert.match(await preview.locator('tbody tr').innerText(),/清空原因并点击退回.*阻止退回/s);
 await preview.getByText('来源版本（1）',{exact:true}).click();assert.match(await preview.innerText(),/审批规则\.md/);assert.match(await preview.innerText(),/第3行：退回规则/);assert.match(await preview.innerText(),/[a-f0-9]{64}/);
 await preview.getByRole('button',{name:'定位来源文件',exact:true}).click();await wait(async()=>(await app.evaluate(()=>globalThis.__testCaseUi.reveals)).length===1);await shot('pending-readable-source-and-status');check('pending preview has readable steps, expected results, unexecuted state and locatable exact source version');
 const more=page.getByLabel('资料预览',{exact:true}).locator('.preview-more');const exportViaMenu=async label=>{if(!await more.evaluate(element=>element.open))await more.locator(':scope > summary').click();await more.getByRole('button',{name:label,exact:true}).click();};
 await stage('exporting-pending-draft');await exportViaMenu('导出 Excel');await wait(async()=>fs.stat(path.join(outputMount.path,'桌面用例.xlsx')).then(()=>true,()=>false));
 const book=new ExcelJS.Workbook();await book.xlsx.readFile(path.join(outputMount.path,'桌面用例.xlsx'));assert.equal(book.worksheets[0].rowCount,2);assert.equal(book.worksheets[0].getCell('I2').value,'1. 阻止退回并提示填写原因');assert.equal(book.worksheets[0].getCell('M2').value,'未执行');
 await exportViaMenu('导出 Markdown');await wait(async()=>fs.stat(path.join(outputMount.path,'桌面用例.md')).then(()=>true,()=>false));assert.match(await fs.readFile(path.join(outputMount.path,'桌面用例.md'),'utf8'),/阻止退回并提示填写原因/);
 await assert.rejects(fs.stat(path.join(outputMount.path,change.path)),{code:'ENOENT'});await shot('pending-export-success');check('real Excel and Markdown IPC exports use changeId plus preview hash while canonical draft remains unsaved');
 await card('无效.testcases.json').getByRole('button',{name:'无效.testcases.json',exact:true}).click();await page.getByRole('alert').filter({hasText:'TEST_CASE_INVALID'}).waitFor();assert.match(await page.getByRole('alert').filter({hasText:'TEST_CASE_INVALID'}).innerText(),/不能保存或导出/);
 const rejected=await page.evaluate(id=>window.pm.request({type:'apply',id,source:'ui'}),invalid.id);assert.equal(rejected.ok,false);assert.match(rejected.error,/TEST_CASE_INVALID/);await assert.rejects(fs.stat(path.join(outputMount.path,invalid.path)),{code:'ENOENT'});
 const priorMarkdown=await fs.readFile(path.join(outputMount.path,'桌面用例.md'),'utf8'),badExport=await page.evaluate(input=>window.pm.request(input),{type:'export',mountId:invalid.mountId,path:invalid.path,changeId:invalid.id,expectedContentHash:hash(invalid.content),format:'test_cases_markdown'});assert.equal(badExport.ok,false);assert.match(badExport.error,/TEST_CASE_INVALID/);assert.equal(await fs.readFile(path.join(outputMount.path,'桌面用例.md'),'utf8'),priorMarkdown);
 await shot('invalid-json-explicit-error');check('malformed manual case file shows a clear preview error; save/export IPC reject it without changing existing output');
 report.cloudCalls=await app.evaluate(()=>globalThis.__testCaseUi.blocked);assert.equal(report.cloudCalls,0);assert.deepEqual(report.pageErrors,[]);
 // Read stored receipts after the spawned app releases its SQLite writer.
 await app.close();app=undefined;report.spawnedAppClosed=true;store=new Store(profile);report.exportReceipts=store.operationsForRun('manual-test-case-export').filter(item=>item.state==='succeeded').map(item=>JSON.parse(item.result));store.close();store=undefined;
 assert.equal(report.exportReceipts.length,2);for(const receipt of report.exportReceipts){assert.equal(receipt.input.changeId,change.id);assert.equal(receipt.input.expectedContentHash,hash(change.content));assert.equal(receipt.sourceHash,hash(change.content));}
 report.status='passed';
}catch(error){report.status='failed';report.error=String(error.stack||error);process.exitCode=1;if(page)await shot('failure').catch(()=>{});}
finally{
 if(service){service.dispose();await Promise.allSettled([...service.agentIndex.queues.values()]);}if(store)store.close();if(app){await app.close();report.spawnedAppClosed=true;}
 await fs.writeFile(path.join(output,'result.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({status:report.status,checks:report.checks.length,output,error:report.error}));
}
