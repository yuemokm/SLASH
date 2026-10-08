import {_electron as electron} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {Store} from '../dist/main/store.js';
import {Service} from '../dist/main/service.js';
import {ensureLegacyFixtureMounts} from './composer-smoke-helpers.mjs';

// The build owner prepares dist. All fixtures live under a fresh .test-data
// directory. No real profile, cloud model, build, package or external write.
const root=process.cwd(),packaged=process.argv.includes('--packaged');
const executableIndex=process.argv.indexOf('--executable');
if(executableIndex>=0&&(!process.argv[executableIndex+1]||process.argv[executableIndex+1].startsWith('--')))throw Error('--executable requires a file path');
const executablePath=executableIndex>=0?path.resolve(process.argv[executableIndex+1]):path.join(root,'release','win-unpacked','slash.exe');
const runtime=packaged?'packaged':'development',testDataRoot=path.resolve(root,'.test-data');
const output=path.join(testDataRoot,`business-rules-ui-${runtime}-${Date.now()}`);
const profile=path.join(output,'profile'),workspace=path.join(output,'synthetic-project');
for(const target of [output,profile,workspace]){const relative=path.relative(testDataRoot,path.resolve(target));assert.ok(relative&&!path.isAbsolute(relative)&&relative!=='..'&&!relative.startsWith('..'+path.sep),'Test files must remain under .test-data');}
await fs.mkdir(output,{recursive:true});
const evidence={status:'running',runtime,packaged,executable:packaged?executablePath:path.join(root,'node_modules','electron','dist','electron.exe'),actualExecutable:null,appVersion:null,output,profile,workspace,checks:[],pageErrors:[],screenshots:[],limitations:['Synthetic source and HTML/PRD fixtures verify UI, real read-only IPC, versions and authorization. They do not establish business correctness.','Fixture mutations use the Service APIs against the isolated SQLite product repository; production rule edits remain conversation initiated.']};
const sourceFile='审批字段规则.md',prdFile='审批备注PRD.md',htmlFile='审批备注.html';
let sourceContent='# 合成业务字段规则\n| 字段 | 是否必填 | 是否仅用于正式落库 | 创建时可见 | 变更时可改 |\n| 审批备注 | 否 | 是 | 是 | 否 |\n';
let sourceQuote=sourceContent.split('\n').slice(1,3).join('\n');
let prdQuote='审批备注仅用于正式落库；创建时可见、非必填、变更时不可改。';
const htmlQuote='<label>审批备注<input id="remark"></label><button id="preview">预览备注</button><p id="message">尚未预览</p>';
const htmlContent=`<!doctype html><html lang="zh"><meta charset="utf-8"><title>合成审批备注原型</title><style>body{font:15px system-ui;padding:20px}input,button{font:inherit;padding:6px}</style><body>\n${htmlQuote}\n<script>document.querySelector('#preview').onclick=()=>document.querySelector('#message').textContent=document.querySelector('#remark').value||'空备注可预览';</script></body></html>`;
const dims=['required','formal_only','create_visible','change_allowed'];
const interpretations=['候选：审批备注不必填。','候选：该字段仅用于正式落库，不代表必填。','候选：创建时可见。','候选：变更时不可改。'];
let activeIds=dims.map(dimension=>'remark-'+dimension);
let conversationId,bindingConversationId,requirementId,unrelatedId,sourceMount,prdMount,htmlMount,prd,html;
async function disposeFixture(store,service){service.dispose();await Promise.allSettled([...service.agentIndex.queues.values()]);store.close();}
function constraints(ids,supersedes){return dims.map((dimension,index)=>({id:ids[index],fieldKey:'审批备注',dimension,rawValue:['否','是','是','否'][index],interpretation:interpretations[index],stage:'正式落库',status:'candidate',...(supersedes?{supersedesId:supersedes[index]}:{}),sourceRefIds:['source-rules'],sourceEvidence:[{sourceRefId:'source-rules',locator:`字段规则 · 审批备注 · ${dimension}`,startLine:2,endLine:3,quote:sourceQuote}]}));}
function bindings(ids,target,quote,startLine,artifactId){return ids.map(constraintId=>({constraintId,mountId:target.id,path:target.id===prdMount.id?prdFile:htmlFile,...(artifactId?{artifactId}:{}),locator:'审批备注',startLine,endLine:startLine,quote}));}
{
 const store=new Store(profile),service=new Service(store,()=>'',()=>{});
 try{
  await service.workspace(workspace);await ensureLegacyFixtureMounts(service);service.setPermission('workspace_read','allow');service.setPermission('artifact_write','allow');
  sourceMount=service.state.mounts.find(mount=>mount.name==='参考资料');prdMount=service.state.mounts.find(mount=>mount.name==='产出材料');htmlMount=service.state.mounts.find(mount=>mount.name==='原型');
  conversationId=service.conversation(undefined,'业务规则落实专项验证');
  await fs.writeFile(path.join(sourceMount.path,sourceFile),sourceContent);await fs.writeFile(path.join(prdMount.path,prdFile),'# 合成 PRD\n'+prdQuote+'\n');await fs.writeFile(path.join(htmlMount.path,htmlFile),htmlContent);
  prd=await service.registerArtifact(conversationId,{mountId:prdMount.id,relativePath:prdFile,kind:'document',title:'合成审批备注 PRD'});
  html=await service.registerArtifact(conversationId,{mountId:htmlMount.id,relativePath:htmlFile,kind:'prototype',title:'合成审批备注原型'});
  const base={summary:'从合成资料逐维度整理，解释保持候选。',status:'draft',sources:[{id:'source-rules',mountId:sourceMount.id,relativePath:sourceFile}],assumptions:[],pendingQuestions:[],confirmedFacts:[]};
  requirementId=(await service.recordRequirement(conversationId,{...base,title:'审批备注四维规则'})).id;
  unrelatedId=(await service.recordRequirement(conversationId,{...base,title:'同来源但未绑定的无关需求'})).id;
  await service.recordBusinessConstraints(conversationId,{requirementId,constraints:constraints(activeIds)});
  // Omit artifactId for the PRD: path binding must still scope this requirement.
  await service.bindBusinessImplementation(conversationId,{requirementId,bindings:[...bindings(activeIds,prdMount,prdQuote,2),...bindings(activeIds,htmlMount,htmlQuote,2,html.id)]});
  bindingConversationId=service.conversation(undefined,'另一次规则绑定会话');
  await service.bindBusinessImplementation(bindingConversationId,{requirementId,bindings:[{...bindings(activeIds,prdMount,prdQuote,2)[0],path:'./'+prdFile}]});
  service.save();
 }finally{await disposeFixture(store,service);}
}
// Mutate only this fixture's product-record repository. Avoid saving Service
// state while Electron owns it, so UI permission and selection state survive.
async function updateFixture(fn){const store=new Store(profile),service=new Service(store,()=>'',()=>{});try{return await fn(service);}finally{await disposeFixture(store,service);}}
let app,page;
const check=name=>{evidence.checks.push(name);console.log('PASS '+name);};
const call=async request=>{const response=await page.evaluate(value=>window.pm.request(value),request);assert.ok(response.ok,response.error);return response.data;};
async function screenshot(name){const filename=name+'.png';await page.screenshot({path:path.join(output,filename)});evidence.screenshots.push(filename);}
async function screenshotDetail(locator,name){const filename=name+'.png';await locator.screenshot({path:path.join(output,filename)});evidence.screenshots.push(filename);}
async function waitValue(read,predicate,timeout=15000){const deadline=Date.now()+timeout;while(Date.now()<deadline){const value=await read();if(predicate(value))return value;await new Promise(resolve=>setTimeout(resolve,75));}assert.fail('Timed out waiting for business UI state');}
async function expandTrace(scope){const trace=scope.locator(`[data-record-id="${requirementId}"] .business-trace`);await trace.waitFor();if(!await trace.evaluate(el=>el.open))await trace.locator(':scope > summary').click();await trace.locator('.business-trace-field').waitFor();return trace;}
async function openResult(folder,file){await page.locator('.rail-item').filter({has:page.getByText('成果',{exact:true})}).click();const back=page.getByRole('button',{name:'返回目录列表',exact:true});if(await back.isVisible())await back.click();await page.locator('.folder-card').filter({hasText:folder}).click();await page.locator('.file-row').filter({hasText:file}).getByRole('button',{name:'阅读',exact:true}).click();const work=page.locator('.work-issues-project').getByLabel('待确认与检查问题',{exact:true});if(!await work.locator(':scope > details').evaluate(el=>el.open))await work.locator(':scope > details > summary').click();await work.locator(`[data-record-id="${requirementId}"]`).waitFor();return work;}
try{
 const common={cwd:root,env:{...process.env,PM_SLASH_DATA_DIR:profile}};app=await electron.launch(packaged?{...common,executablePath}:{...common,args:['.']});page=await app.firstWindow();page.setDefaultTimeout(15000);page.on('pageerror',error=>evidence.pageErrors.push(error.message));await page.locator('.brand').waitFor();assert.equal(path.resolve(await app.evaluate(({app})=>app.getPath('userData'))),path.resolve(profile));evidence.actualExecutable=await app.evaluate(({app})=>app.getPath('exe'));evidence.appVersion=await app.evaluate(({app})=>app.getVersion());
 await app.evaluate(({BrowserWindow})=>{const window=BrowserWindow.getAllWindows()[0];window.unmaximize();window.setSize(1366,900);});
 await page.locator('.sidebar').getByRole('button',{name:'业务规则落实专项验证',exact:true}).click();
 const conversationWork=page.locator('.conversation').getByLabel('待确认与检查问题',{exact:true});await conversationWork.locator(':scope > details > summary').click();
 const initialTrace=conversationWork.locator(`[data-record-id="${requirementId}"] .business-trace`);assert.equal(await initialTrace.evaluate(el=>el.open),false);assert.equal(await initialTrace.locator('blockquote').count(),0);check('规则默认折叠，未核对前不渲染缓存原文');
 let trace=await expandTrace(conversationWork);assert.equal(await trace.locator('.business-trace-dimension').count(),4);assert.equal(await trace.getByText('仅正式落库',{exact:true}).count(),1);assert.equal(await trace.getByText('正式阶段必需',{exact:true}).count(),0);assert.match(await trace.innerText(),/业务正确性始终需人工核对/);assert.equal(await trace.locator('[data-evidence-status="current"]').count(),12);check('四维独立、原文定位、PRD和HTML版本有效均仅标为证据状态');
 await trace.getByRole('button',{name:'回会话补充规则与位置',exact:true}).click();assert.match(await page.getByLabel('描述你的任务').inputValue(),/必填、仅正式落库、创建时可见、变更时可改/);assert.match(await page.getByLabel('描述你的任务').inputValue(),/版本匹配不能当作业务正确性通过/);check('回会话复用输入补充，保留候选及业务人工核对边界');
 await page.locator('.sidebar').getByRole('button',{name:'另一次规则绑定会话',exact:true}).click();const bindingWork=page.locator('.conversation').getByLabel('待确认与检查问题',{exact:true});await bindingWork.locator(':scope > details > summary').click();await bindingWork.locator(`[data-record-id="${requirementId}"]`).waitFor();assert.equal(await bindingWork.locator(`[data-record-id="${unrelatedId}"]`).count(),0);check('仅在新会话追加路径绑定的需求也可在该会话定位');
 await page.locator('.sidebar').getByRole('button',{name:'业务规则落实专项验证',exact:true}).click();
 let work=await openResult('产出材料',prdFile);assert.equal(await work.locator(`[data-record-id="${unrelatedId}"]`).count(),0);trace=await expandTrace(work);assert.equal(await trace.locator('[data-implementation-id]').count(),4);assert.equal(await trace.getByText(htmlFile,{exact:false}).count(),0);check('当前PRD支持无artifactId的明确路径绑定，同来源无关需求不混入');
 assert.equal(await trace.locator('[data-implementation-id]').filter({hasText:'./'+prdFile}).count(),1);check('含./的明确路径绑定与规范文件路径一致且旧绑定只入历史');
 await trace.getByRole('button',{name:'阅读来源',exact:true}).first().click();await page.locator('.document-reader').getByText('合成业务字段规则',{exact:false}).waitFor();check('阅读来源打开真实授权文件');
 work=await openResult('产出材料',prdFile);trace=await expandTrace(work);await screenshot('prd-current');await screenshotDetail(trace.locator('[data-dimension="formal_only"]'),'formal-only-dimension');
 prdQuote='审批备注仅用于正式落库；创建时可见、非必填、变更时不可改。新增核对说明。';await fs.writeFile(path.join(prdMount.path,prdFile),'# 合成 PRD\n'+prdQuote+'\n');
 await trace.getByRole('button',{name:'重新核对版本',exact:true}).click();await trace.locator('[data-implementation-id] [data-evidence-status="stale"]').first().waitFor();check('成果改版后原绑定显示版本已变化');
 await updateFixture(service=>service.bindBusinessImplementation(conversationId,{requirementId,bindings:bindings(activeIds,prdMount,prdQuote,2)}));await work.getByRole('button',{name:'刷新',exact:true}).click();await trace.getByText('记录已更新，请重新核对版本。',{exact:true}).waitFor();assert.equal(await trace.locator('blockquote').count(),0);await trace.getByRole('button',{name:'重新核对版本',exact:true}).click();await trace.locator('.business-trace-field').waitFor();assert.equal(await trace.locator('[data-implementation-id]').count(),4);assert.equal(await trace.locator('[data-evidence-status="stale"]').count(),0);assert.equal(await trace.locator('.business-trace-history').count(),4);check('重新绑定清除当前stale，旧绑定仅折叠版本历史，记录更新隐藏旧正文');
 sourceContent=sourceContent.replace('| 审批备注 | 否 | 是 | 是 | 否 |','| 审批备注 | 是 | 是 | 是 | 否 |');sourceQuote=sourceContent.split('\n').slice(1,3).join('\n');await fs.writeFile(path.join(sourceMount.path,sourceFile),sourceContent);await trace.getByRole('button',{name:'重新核对版本',exact:true}).click();await trace.locator('[data-evidence-status="stale"]').first().waitFor();
 const previousIds=activeIds;activeIds=dims.map(dimension=>'remark-v2-'+dimension);interpretations[0]='候选：审批备注必填。';
 await updateFixture(async service=>{await service.updateRequirementEvidence(conversationId,requirementId,{sources:[{id:'source-rules',mountId:sourceMount.id,relativePath:sourceFile}],assumptions:[],pendingQuestions:[],confirmedFacts:[]});const replacements=constraints(activeIds,previousIds);replacements[0].rawValue='是';await service.recordBusinessConstraints(conversationId,{requirementId,constraints:replacements});});
 await work.getByRole('button',{name:'刷新',exact:true}).click();await trace.getByRole('button',{name:'重新核对版本',exact:true}).click();await trace.locator('.business-trace-field').waitFor();assert.match(await trace.locator(':scope > summary').innerText(),/4 条候选规则/);assert.equal(await trace.locator('[data-evidence-status="stale"]').count(),0);assert.equal(await trace.locator('[data-implementation-id]').count(),0);assert.equal(await trace.getByText('已替代规则 4 条',{exact:true}).count(),1);check('来源修正后替代链仅核对4条当前候选，新候选明确待绑定且旧候选不永久stale');
 await updateFixture(service=>service.bindBusinessImplementation(conversationId,{requirementId,bindings:bindings(activeIds,prdMount,prdQuote,2)}));await work.getByRole('button',{name:'刷新',exact:true}).click();await trace.getByRole('button',{name:'重新核对版本',exact:true}).click();await trace.locator('[data-implementation-id]').first().waitFor();await screenshot('prd-rebound');
 await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(1050,800));assert.ok(await trace.evaluate(el=>el.scrollWidth-el.clientWidth)<=1);await screenshot('narrow-panel');check('窄面板四维纵向换行，无横向表格溢出');
 await call({type:'mountAccess',id:sourceMount.id,write:false,enabled:false});await waitValue(()=>trace.locator('blockquote').count(),count=>count===0);assert.equal(await trace.evaluate(el=>el.open),false);trace=await expandTrace(work);assert.equal(await trace.locator('blockquote').filter({hasText:'是否仅用于正式落库'}).count(),0);assert.equal(await trace.getByRole('button',{name:'阅读来源',exact:true}).count(),0);assert.match(await trace.innerText(),/来源不可访问/);await screenshot('source-revoked');await screenshotDetail(trace.locator('[data-dimension="required"]'),'revoked-source-detail');check('来源撤权即时清界面缓存，重新核对不显示原文、解释或阅读入口');
 await call({type:'permissionSet',capability:'workspace_read',decision:'deny'});await waitValue(()=>trace.locator('blockquote').count(),count=>count===0);if(!await trace.evaluate(el=>el.open))await trace.locator(':scope > summary').click();await trace.getByRole('alert').waitFor();assert.equal(await trace.locator('blockquote').count(),0);check('读取权限拒绝时保留失败信息并隐藏缓存正文');
 assert.deepEqual(evidence.pageErrors,[]);evidence.status='passed';
}catch(error){evidence.status='failed';evidence.error=String(error);if(page)await screenshot('failure').catch(()=>{});throw error;}
finally{await fs.writeFile(path.join(output,'result.json'),JSON.stringify(evidence,null,2));if(app)await app.close();console.log(JSON.stringify({status:evidence.status,output,checks:evidence.checks.length,error:evidence.error}));}
