import {composerTrigger,composerPopup,chooseComposerModel,chooseComposerWorkflow,chooseComposerPermission,ensureLegacyFixtureMounts} from './composer-smoke-helpers.mjs';
import {_electron as electron} from 'playwright';
import {createServer} from 'node:http';
import {randomUUID} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {Store} from '../dist/main/store.js';
import {Service} from '../dist/main/service.js';

// Build/package separately before running. Every mutation uses a fresh profile.
// Loopback responses exercise the actual Pi runtime; no cloud credentials,
// publishing, or production MCP/SMB integration are required or claimed.
const root=process.cwd(),packaged=process.argv.includes('--packaged');
const output=path.join(root,'.test-data',`settings-review-${packaged?'packaged':'development'}-${Date.now()}`);
const profile=path.join(output,'profile'),workspace=path.join(output,'设置回归项目');
const extraDirectory=path.join(output,'补充资料');
await fs.mkdir(extraDirectory,{recursive:true});
const store=new Store(profile),service=new Service(store,()=>'',()=>{});
await service.workspace(workspace);
await ensureLegacyFixtureMounts(service);
const conversationId=service.conversation(undefined,'设置路由验证');
const archivedId=service.conversation(undefined,'设置回归归档');service.conversation(archivedId,undefined,true);
const historyRunId=randomUUID(),now=new Date().toISOString();
service.state.runs.push({id:historyRunId,conversationId,status:'succeeded',mode:'build',permissionMode:'standard',startedAt:now,finishedAt:now,updatedAt:now,attempt:1,input:'既有任务记录',phase:'completed'});
store.set('app-preferences',{qualityGateEnabled:true,forceQualityCheckBeforeDelivery:false,maxParallelTasks:5,maxParallelConcurrency:3,subAgentMaxDepth:2,subAgentMaxTasks:7,shareLockTtlMs:420000,modelRouting:{strategy:'cost_aware',taskTypes:{writing:'shared-fixture-model',research:'saved-unavailable-model'}},subAgentTools:['read_file','search_files'],parallelReadOnlyLimit:3});
service.save();store.close();
const evidence={status:'running',packaged,output,profile,checks:[],screenshots:[],pageErrors:[],modelRequests:[],runs:[],limitations:['Deterministic loopback model validates real Pi routing and persistence, not model quality.','Native add-directory picker returns a fixture directory; actual Windows picker interaction is outside this automated check.','Manual MCP configuration is saved disabled; external MCP, publishing and SMB production connectivity are not exercised.']};
const sockets=new Set();
const server=createServer(async(req,res)=>{
 try{
  let body='';for await(const chunk of req)body+=chunk;
  const data=JSON.parse(body),provider=req.url.startsWith('/b/')?'fixture-b':'fixture-a';
  evidence.modelRequests.push({provider,url:req.url,model:data.model,stream:data.stream,prompt:JSON.stringify(data.messages??[])});
  const metadata={id:'chatcmpl-'+randomUUID(),created:Math.floor(Date.now()/1000),model:data.model};
  const reply={role:'assistant',content:`已完成 ${provider} 本地设置回归；这是路由验证输出。`};
  if(data.stream){
   res.writeHead(200,{'content-type':'text/event-stream'});
   res.write('data: '+JSON.stringify({...metadata,object:'chat.completion.chunk',choices:[{index:0,delta:reply,finish_reason:null}]})+'\n\n');
   res.write('data: '+JSON.stringify({...metadata,object:'chat.completion.chunk',choices:[{index:0,delta:{},finish_reason:'stop'}],usage:{prompt_tokens:10,completion_tokens:10,total_tokens:20}})+'\n\n');res.end('data: [DONE]\n\n');
  }else{res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({...metadata,object:'chat.completion',choices:[{index:0,message:reply,finish_reason:'stop'}]}));}
 }catch(error){res.writeHead(500);res.end(String(error));}
});
server.on('connection',socket=>{sockets.add(socket);socket.on('close',()=>sockets.delete(socket));});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const port=server.address().port;
let app,page,settings,modelA,modelB,addedMountId,connectionId,expectedPreferences;
const call=async request=>{const response=await page.evaluate(value=>window.pm.request(value),request);assert.ok(response.ok,response.error);return response.data;};
const visibleSetting=(label,options)=>settings.getByLabel(label,options).filter({visible:true});
const check=name=>{evidence.checks.push(name);console.log('PASS '+name);};
const screenshot=async name=>{const file=name+'.png';await page.screenshot({path:path.join(output,file)});evidence.screenshots.push(file);};
async function launch(){
 const common={cwd:root,env:{...process.env,PM_SLASH_DATA_DIR:profile}};
 app=await electron.launch(packaged?{...common,executablePath:path.join(root,'release','win-unpacked','slash.exe')}:{...common,args:['.']});
 page=await app.firstWindow();page.setDefaultTimeout(10000);page.on('pageerror',error=>evidence.pageErrors.push(error.message));await page.locator('.brand').waitFor();
 settings=page.getByRole('dialog',{name:'设置'});
}
async function openSettings(){await page.getByRole('button',{name:'设置',exact:true}).first().click();await settings.waitFor();await settings.locator('.settings-section:not([hidden]) .settings-heading h1').waitFor();}
async function closeSettings(){await settings.getByRole('button',{name:'关闭设置'}).click();await settings.waitFor({state:'hidden'});}
async function tab(label){await settings.locator('.settings-nav button').filter({hasText:label}).first().click();await settings.locator('.settings-section:not([hidden]) .settings-heading h1').filter({hasText:label}).waitFor();}
async function advanced(){const details=settings.locator('.settings-section:not([hidden]) .settings-advanced');assert.equal(await details.count(),1);if(await details.getAttribute('open')===null)await details.locator(':scope > summary').click();return details;}
async function waitPreferences(predicate,arg){const deadline=Date.now()+10000;while(Date.now()<deadline){if(predicate(await call({type:'appPreferences'}),arg))return;await new Promise(resolve=>setTimeout(resolve,50));}assert.fail('Saved preferences did not reach the requested values');}
async function layout(name){
 const geometry=await settings.evaluate(el=>{const r=el.getBoundingClientRect(),body=el.querySelector('.settings-body');return{left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height,viewport:{width:innerWidth,height:innerHeight},overflow:body.scrollWidth-body.clientWidth,documentOverflow:document.documentElement.scrollWidth-document.documentElement.clientWidth};});
 assert.ok(geometry.left>=0&&geometry.top>=0&&geometry.right<=geometry.viewport.width+1&&geometry.bottom<=geometry.viewport.height+1,JSON.stringify(geometry));assert.ok(geometry.overflow<=1&&geometry.documentOverflow<=1,JSON.stringify(geometry));
 const navButtons=settings.locator('.settings-nav button');assert.equal(await navButtons.count(),8);assert.equal(await navButtons.filter({hasText:'任务与回执'}).count(),0);check(name+' 八分类无横溢');
}
async function themeColors(theme){
 await page.waitForFunction(()=>{
  const expected=(el,key)=>{const probe=document.createElement('i');probe.style.color=getComputedStyle(el).getPropertyValue(key);el.append(probe);const color=getComputedStyle(probe).color;probe.remove();return color;};
  return [...document.querySelectorAll('.theme-option')].every(el=>getComputedStyle(el).backgroundColor===expected(el,el.classList.contains('selected')?'--theme-card':'--theme-surface')&&getComputedStyle(el).color===expected(el,'--theme-text')&&getComputedStyle(el.querySelector('small')).color===expected(el,'--theme-muted'));
 });
 const colors=await settings.locator('.theme-option').evaluateAll(items=>items.map(el=>({label:el.querySelector('b').textContent,background:getComputedStyle(el).backgroundColor,text:getComputedStyle(el.querySelector('b')).color,description:getComputedStyle(el.querySelector('small')).color})));
 const luminance=rgb=>{const values=rgb.match(/[\d.]+/g).slice(0,3).map(value=>Number(value)/255).map(value=>value<=.04045?value/12.92:((value+.055)/1.055)**2.4);return .2126*values[0]+.7152*values[1]+.0722*values[2];};
 for(const item of colors){for(const field of ['text','description']){const a=luminance(item[field]),b=luminance(item.background),contrast=(Math.max(a,b)+.05)/(Math.min(a,b)+.05);assert.ok(contrast>=4.5,`${theme} ${item.label} ${field} contrast ${contrast}`);item[field+'Contrast']=contrast;}}
 (evidence.themeColors??=[]).push({theme,colors});check(theme+' 主题卡最终颜色匹配且文字对比度≥4.5');
}
async function chooseModel(label){await chooseComposerModel(page,label);}
async function sendRoute(marker,expected,{workflow='prd',command='',taskType='writing'}={}){
 if(workflow)await chooseComposerWorkflow(page,workflow==='prototype'?'交互原型':'写 / 改 PRD');
 await page.getByLabel('描述你的任务').fill(`${command?command+' ':''}${marker} 为设置回归整理一份简短说明。`);await page.getByRole('button',{name:'发送',exact:true}).click();
 await page.waitForFunction(marker=>window.pm.request({type:'state'}).then(result=>result.data.runs.some(run=>run.input?.includes(marker))),marker);
 const run=(await call({type:'state'})).runs.find(item=>item.input?.includes(marker));
 await page.waitForFunction(id=>window.pm.request({type:'state'}).then(result=>['succeeded','failed','cancelled'].includes(result.data.runs.find(run=>run.id===id)?.status)),run.id,{timeout:45000});
 const finished=(await call({type:'state'})).runs.find(item=>item.id===run.id);assert.equal(finished.status,'succeeded',finished.error);assert.equal(finished.modelEntryId,expected.id);assert.equal(finished.modelRoute.entryId,expected.id);assert.equal(finished.modelRoute.provider,expected.provider);assert.equal(finished.modelRoute.modelId,'shared-fixture-model');assert.equal(finished.modelRoute.taskType,taskType);
 const requests=evidence.modelRequests.filter(item=>item.prompt.includes(marker));assert.ok(requests.length);assert.ok(requests.every(item=>item.provider===expected.provider&&item.model==='shared-fixture-model'),JSON.stringify(requests));evidence.runs.push(finished);check(marker+' 真实Pi路由 '+expected.provider);
}

try{
 await launch();
 await call({type:'modelUpsert',model:{provider:'fixture-a',name:'默认供应商 A',baseUrl:`http://127.0.0.1:${port}/a/v1`,modelId:'shared-fixture-model',protocol:'openai-completions'},key:'fixture-a-key'});
 modelA=(await call({type:'models'})).groups.flatMap(group=>group.models).find(item=>item.provider==='fixture-a');await call({type:'modelDefault',id:modelA.id});
 // Opening sections, advanced details and legacy-only strategies must not migrate preferences.
 await openSettings();const untouched=await call({type:'appPreferences'});
 evidence.preferencesBefore=untouched;
 const tabs=['通用','系统提示词','工作空间','模型','质量检查','连接','权限与审批','归档会话'];
 for(const [width,height] of [[1366,900],[1100,760]]){
  await app.evaluate(({BrowserWindow},size)=>{const window=BrowserWindow.getAllWindows()[0];window.unmaximize();window.setSize(...size);},[width,height]);
  for(const label of tabs){await tab(label);await layout(`${width}x${height} ${label}`);}
  await screenshot(`settings-${width}x${height}-archive`);
 }
 await tab('通用');assert.equal(await settings.getByText('界面',{exact:true}).count(),0);assert.equal(await settings.getByRole('button',{name:/打开模型|管理目录|管理权限|查看任务/}).count(),0);assert.equal(await settings.getByRole('switch').count(),0);assert.equal(await settings.locator('.settings-section:not([hidden]) .settings-group').count(),1);
 for(const [theme,label] of [['reference','经典瓷白'],['graphite','石墨深色'],['sand','柔和米色']]){await settings.getByRole('radio',{name:new RegExp(label)}).click();await page.locator(`.app[data-theme="${theme}"]`).waitFor();await themeColors(theme);await screenshot('settings-theme-'+theme);}
 assert.equal(await page.evaluate(()=>localStorage.getItem('slash:theme')),'sand');
 await tab('模型');assert.equal(await settings.locator('.settings-section:not([hidden]) .settings-advanced').getAttribute('open'),null);await advanced();assert.equal(await visibleSetting('模型选择方式').inputValue(),'cost_aware');assert.deepEqual(await visibleSetting('模型选择方式').locator('option').evaluateAll(items=>items.map(item=>item.value).filter(value=>['cost_aware','fallback'].includes(value))),['cost_aware']);assert.equal(await visibleSetting('PRD / 文档模型').inputValue(),modelA.id);
 await tab('权限与审批');assert.equal(await settings.locator('.settings-section:not([hidden]) .settings-advanced').getAttribute('open'),null);await advanced();assert.equal(await visibleSetting('单次任务数上限').inputValue(),'5');assert.equal(await visibleSetting('辅助任务最多拆分层级').count(),0);assert.equal(await visibleSetting('共享锁有效期').count(),0);assert.equal(await visibleSetting('参考资料目录权限').count(),0);
 await tab('工作空间');assert.equal(await settings.locator('.settings-section:not([hidden]) .settings-advanced').getAttribute('open'),null);await advanced();assert.equal(await visibleSetting('共享锁有效期').inputValue(),'420000');assert.equal(await visibleSetting('模型选择方式').count(),0);
 await tab('质量检查');assert.equal(await settings.getByRole('switch').count(),1);const quality=settings.getByRole('switch',{name:'在线文档发布前强制质量检查',exact:true});assert.equal(await quality.getAttribute('aria-checked'),'false');assert.deepEqual(await call({type:'appPreferences'}),untouched);assert.ok((await call({type:'state'})).runs.some(item=>item.id===historyRunId));check('移组只查看保留全部旧设置与mixed质量字段，任务后台记录保留');
 // Both unsupported historical strategies remain visible only for their saved value.
 await call({type:'appPreferences',patch:{modelRouting:{...untouched.modelRouting,strategy:'fallback'}}});await closeSettings();await openSettings();await tab('模型');await advanced();assert.equal(await visibleSetting('模型选择方式').inputValue(),'fallback');assert.deepEqual(await visibleSetting('模型选择方式').locator('option').evaluateAll(items=>items.map(item=>item.value).filter(value=>['cost_aware','fallback'].includes(value))),['fallback']);const oldFallback=await call({type:'appPreferences'});await tab('通用');assert.deepEqual(await call({type:'appPreferences'}),oldFallback);check('旧成本与回退策略保留且不能新增另一种旧策略');
 // Concrete setting search must select the right section and expand the actual control.
 for(const [query,label,control,target] of [['共享锁','工作空间','共享锁有效期','share-lock'],['模型分工','模型','模型选择方式','model-routing'],['目录权限','工作空间','参考资料目录权限','directory-access']]){
  const search=visibleSetting('搜索设置');await search.fill(query);const result=settings.locator('#settings-search-results').getByRole('button').filter({hasText:query});await result.first().click();await settings.locator('.settings-section:not([hidden]) .settings-heading h1').filter({hasText:label}).waitFor();await visibleSetting(control).waitFor();assert.ok(await visibleSetting(control).isVisible());await page.waitForFunction(target=>document.activeElement?.getAttribute('data-setting-id')===target,target);if(target!=='directory-access')assert.notEqual(await settings.locator(`[data-setting-id="${target}"]`).getAttribute('open'),null);assert.equal(await search.inputValue(),'');
 }
 await visibleSetting('搜索设置').fill('SETTINGS-NO-SUCH-CONTROL');await settings.getByText(/没有找到|未找到/).waitFor();await screenshot('settings-search-empty');await visibleSetting('搜索设置').fill('');check('搜索定位共享锁/模型分工/目录权限并恢复无结果状态');
 await tab('质量检查');await quality.click();await waitPreferences(value=>value.qualityGateEnabled===true&&value.forceQualityCheckBeforeDelivery===true);await quality.click();await waitPreferences(value=>value.qualityGateEnabled===false&&value.forceQualityCheckBeforeDelivery===false);await quality.click();await waitPreferences(value=>value.qualityGateEnabled===true&&value.forceQualityCheckBeforeDelivery===true);check('一个质量开关实际同步两个legacy字段');
 await tab('权限与审批');await advanced();await visibleSetting('单次任务数上限').fill('6');await visibleSetting('同时运行上限').click();await waitPreferences(value=>value.maxParallelTasks===6);await settings.getByRole('switch',{name:'读取网页',exact:true}).click();await waitPreferences(value=>value.subAgentTools.includes('read_web_page'));check('移组后的辅助任务数量和工具实际保存');
 await tab('工作空间');const permission=visibleSetting('参考资料目录权限');assert.equal(await settings.getByRole('switch',{name:/启用.*资料/}).count(),0);
 for(const value of ['deny','read','read_write']){await permission.selectOption(value);await page.waitForFunction(value=>window.pm.request({type:'state'}).then(result=>{const mount=result.data.mounts.find(item=>item.name==='参考资料');return mount.enabled===(value!=='deny')&&mount.write===(value==='read_write');}),value);}
 await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(1366,900));await settings.locator('.settings-body').evaluate(el=>{el.scrollTop=0;});await screenshot('settings-workspace-directory-permissions');
 await advanced();await visibleSetting('共享锁有效期').selectOption('900000');await waitPreferences(value=>value.shareLockTtlMs===900000);
 await app.evaluate(({dialog},directory)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[directory]});},extraDirectory);await settings.getByRole('button',{name:'添加参考目录',exact:true}).click();await page.waitForFunction(directory=>window.pm.request({type:'state'}).then(result=>result.data.mounts.some(item=>item.path===directory)),extraDirectory);const added=(await call({type:'state'})).mounts.find(item=>item.path===extraDirectory);addedMountId=added.id;await visibleSetting('补充资料目录权限').selectOption('read');check('目录权限唯一select实际保存并从添加入口登记目录');
 // Actual model form create/edit, preserving credentials when only the name changes.
 await tab('模型');await settings.getByRole('button',{name:'添加模型',exact:true}).click();const modelForm=settings.locator('.subdialog');await modelForm.waitFor();await modelForm.getByLabel('供应商名称',{exact:true}).fill('fixture-b');await modelForm.getByLabel('显示名称',{exact:true}).fill('写作供应商 B');const modelAdvanced=modelForm.locator('details.advanced');if(await modelAdvanced.getAttribute('open')===null)await modelAdvanced.locator('summary').click();await modelForm.getByLabel('API 地址',{exact:true}).fill(`http://127.0.0.1:${port}/b/v1`);await modelForm.getByLabel('模型 ID',{exact:true}).fill('shared-fixture-model');await modelForm.locator('input[type="password"]').fill('fixture-b-key');await modelForm.getByRole('button',{name:'保存模型'}).click();await modelForm.waitFor({state:'hidden'});
 modelB=(await call({type:'models'})).groups.flatMap(group=>group.models).find(item=>item.provider==='fixture-b');assert.ok(modelB.hasKey);await settings.locator('.model-row').filter({hasText:'写作供应商 B'}).getByRole('button',{name:'编辑',exact:true}).click();await modelForm.getByLabel('显示名称',{exact:true}).fill('写作供应商 B 已编辑');await modelForm.getByRole('button',{name:'保存模型'}).click();await modelForm.waitFor({state:'hidden'});modelB=(await call({type:'models'})).groups.flatMap(group=>group.models).find(item=>item.id===modelB.id);assert.equal(modelB.name,'写作供应商 B 已编辑');assert.ok(modelB.hasKey);
 await advanced();await visibleSetting('模型选择方式').selectOption('task_type');await visibleSetting('PRD / 文档模型').selectOption(modelB.id);await waitPreferences((value,id)=>value.modelRouting.taskTypes.writing===id,modelB.id);await visibleSetting('原型 / 代码模型').selectOption(modelA.id);await waitPreferences((value,id)=>value.modelRouting.taskTypes.coding===id,modelA.id);await visibleSetting('评审模型').selectOption(modelB.id);await waitPreferences((value,id)=>value.modelRouting.taskTypes.review===id,modelB.id);assert.equal((await call({type:'state'})).defaultModelId,modelA.id);check('同modelId双供应商配置实际保存精确entryId');await settings.locator('[data-setting-id=model-routing]').scrollIntoViewIfNeeded();await screenshot('settings-model-routing-saved');
 await tab('连接');const manual=settings.locator('[data-setting-id=manual-tools]');assert.equal(await manual.getAttribute('open'),null);await settings.getByRole('button',{name:'添加连接',exact:true}).click();const connectionForm=page.locator('.connection-form-modal');await connectionForm.waitFor();await connectionForm.getByLabel('名称',{exact:true}).fill('设置回归停用MCP');await connectionForm.getByLabel(/^连接方式/).selectOption('http');await connectionForm.getByLabel('服务地址',{exact:true}).fill('http://127.0.0.1:9/mcp');await connectionForm.getByLabel('保存后启用',{exact:true}).uncheck();await connectionForm.getByRole('button',{name:'保存连接'}).click();await connectionForm.waitFor({state:'hidden'});let connection=(await call({type:'state'})).connections.find(item=>item.name==='设置回归停用MCP');assert.ok(connection);connectionId=connection.id;assert.equal(connection.enabled,false);await settings.locator('.connection-line').filter({hasText:connection.name}).getByRole('button',{name:'编辑',exact:true}).click();await connectionForm.getByLabel('名称',{exact:true}).fill('设置回归已编辑MCP');await connectionForm.getByRole('button',{name:'保存连接'}).click();await connectionForm.waitFor({state:'hidden'});connection=(await call({type:'state'})).connections.find(item=>item.id===connectionId);assert.equal(connection.name,'设置回归已编辑MCP');assert.equal(connection.enabled,false);check('MCP手动调用默认折叠且连接UI新增编辑实际保存');
 await tab('归档会话');const archived=settings.locator('.task').filter({hasText:'设置回归归档'});await archived.getByRole('button',{name:/打开|查看/,exact:false}).click();await settings.waitFor({state:'hidden'});assert.ok((await call({type:'state'})).conversations.some(item=>item.id===archivedId));check('归档会话打开保留已有记录');
 // Reopening settings and modelDefault refresh must leave automatic composer empty.
 await chooseModel('自动');await openSettings();await tab('模型');await settings.locator('.model-row').filter({hasText:modelB.name}).getByRole('button',{name:'设为默认',exact:true}).click();await page.waitForFunction(id=>window.pm.request({type:'state'}).then(result=>result.data.defaultModelId===id),modelB.id);await settings.locator('.model-row').filter({hasText:modelA.name}).getByRole('button',{name:'设为默认',exact:true}).click();await page.waitForFunction(id=>window.pm.request({type:'state'}).then(result=>result.data.defaultModelId===id),modelA.id);await closeSettings();assert.match(await composerTrigger(page,'选择模型').innerText(),/自动/);
 await sendRoute('SETTINGS-AUTO-WRITING',modelB);await sendRoute('SETTINGS-AUTO-PROTOTYPE',modelA,{workflow:'prototype',taskType:'coding'});await sendRoute('SETTINGS-AUTO-REVIEW',modelB,{workflow:null,command:'/review',taskType:'review'});
 assert.match(await composerTrigger(page,'选择模型').innerText(),/自动/);
 await openSettings();await tab('模型');await advanced();await visibleSetting('模型选择方式').selectOption('fixed');await waitPreferences(value=>value.modelRouting.strategy==='fixed');await closeSettings();assert.match(await composerTrigger(page,'选择模型').innerText(),/自动/);await sendRoute('SETTINGS-FIXED-DEFAULT',modelA);
 await chooseModel(modelB.name);await sendRoute('SETTINGS-EXPLICIT-OVERRIDE',modelB);await chooseModel('自动');
 expectedPreferences=await call({type:'appPreferences'});await screenshot('settings-composer-routing');await app.close();app=undefined;
 evidence.preferencesSaved=expectedPreferences;evidence.modelEntries=[modelA,modelB];
 await launch();assert.deepEqual(await call({type:'appPreferences'}),expectedPreferences);const restored=await call({type:'state'});assert.ok(restored.mounts.some(item=>item.id===addedMountId&&item.enabled&&item.write===false));assert.ok(restored.connections.some(item=>item.id===connectionId&&item.name==='设置回归已编辑MCP'&&!item.enabled));assert.ok(restored.conversations.some(item=>item.id===archivedId));for(const run of evidence.runs)assert.equal(restored.runs.find(item=>item.id===run.id)?.modelRoute.entryId,run.modelRoute.entryId);assert.match(await composerTrigger(page,'选择模型').innerText(),/自动/);check('设置/目录/连接/归档/真实路由重启恢复，composer仍自动');
 await page.locator('.app[data-theme="sand"]').waitFor();await sendRoute('SETTINGS-RESTART-DEFAULT',modelA);assert.deepEqual(await call({type:'appPreferences'}),expectedPreferences);
 evidence.preferencesRestored=await call({type:'appPreferences'});evidence.restoredMounts=restored.mounts.map(({id,name,enabled,write})=>({id,name,enabled,write}));evidence.restoredConnection=restored.connections.find(item=>item.id===connectionId);
 await openSettings();await tab('质量检查');assert.equal(await settings.getByRole('switch',{name:'在线文档发布前强制质量检查',exact:true}).getAttribute('aria-checked'),'true');await tab('归档会话');page.once('dialog',dialog=>dialog.accept());await settings.locator('.task').filter({hasText:'设置回归归档'}).getByRole('button',{name:'删除',exact:true}).click();await page.waitForFunction(id=>window.pm.request({type:'state'}).then(result=>!result.data.conversations.some(item=>item.id===id)),archivedId);check('归档删除实际同步持久状态');await screenshot('settings-restart-verified');
 assert.deepEqual(evidence.pageErrors,[]);evidence.status='passed';
}catch(error){evidence.status='failed';evidence.error=String(error);if(page)await screenshot('failure').catch(()=>{});throw error;}
finally{await fs.writeFile(path.join(output,'result.json'),JSON.stringify(evidence,null,2));if(app)await app.close();for(const socket of sockets)socket.destroy();await new Promise(resolve=>server.close(resolve));console.log(JSON.stringify({status:evidence.status,output,checks:evidence.checks.length,error:evidence.error}));}

