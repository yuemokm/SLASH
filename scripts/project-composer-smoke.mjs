import {_electron as electron} from 'playwright';
import {createServer} from 'node:http';
import {randomUUID} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {Store} from '../dist/main/store.js';
import {Service} from '../dist/main/service.js';
import {composerTrigger,composerPopup,chooseComposerModel,chooseComposerWorkflow,chooseComposerPermission,ensureLegacyFixtureMounts} from './composer-smoke-helpers.mjs';

// Run after the owner builds/packages. Every mutation uses this isolated profile.
// The model fixture serves actual metadata and streamed requests to Pi. This is
// UI/protocol verification, not model quality, cloud publishing or an OS sandbox.
const root=process.cwd(),packaged=process.argv.includes('--packaged');
const executableFlag=process.argv.indexOf('--executable'),executablePath=executableFlag>=0?path.resolve(process.argv[executableFlag+1]||''):path.join(root,'release','win-unpacked','slash.exe');if(executableFlag>=0)assert.ok(process.argv[executableFlag+1]&&!process.argv[executableFlag+1].startsWith('--'),'--executable requires a path');
const output=path.join(root,'.test-data',`project-composer-${packaged?'packaged':'development'}-${Date.now()}`);
const profile=path.join(output,'profile');
await fs.mkdir(output,{recursive:true});
const roots={a:path.join(output,'项目 A'),b:path.join(output,'项目 B'),c:path.join(output,'项目 C')};
const seed=new Store(profile),service=new Service(seed,()=>'',()=>{}),fixtures={};
for(const [key,directory] of Object.entries(roots)){
 await service.workspace(directory);
await ensureLegacyFixtureMounts(service);
 const conversationId=service.conversation(undefined,`${key.toUpperCase()} 保留历史`);
 const reference=service.state.mounts.find(m=>m.name==='参考资料'),document=service.state.mounts.find(m=>m.name==='产出材料');
 await fs.writeFile(path.join(directory,'不要删除.txt'),`sentinel-${key}`);
 await fs.writeFile(path.join(reference.path,'会议证据.md'),'# 会议来源\n真实测试证据 PC-SOURCE-20261004。退回时原因必填。\n');
 await fs.writeFile(path.join(document.path,'预览验证.md'),'# 可阅读成果\n\n'+Array.from({length:30},(_,i)=>`## 规则 ${i+1}\n保留审批记录和退回原因。\n`).join('\n'));
 service.save();fixtures[key]={conversationId,reference,document};
}
await service.setDefaultProject({path:roots.a});service.save();seed.close();
const evidence={status:'running',packaged,executablePath:packaged?executablePath:undefined,output,profile,checks:[],screenshots:[],pageErrors:[],metadataRequests:[],modelRequests:[],runs:[],layouts:[],limitations:[
 'Native directory selection is replaced by the fixture directory; Windows picker interaction is outside this automation.',
 'Opening a folder reaches the real projectReveal IPC, but shell.openPath is intercepted; Explorer is not opened.',
 'Loopback metadata and streams exercise Pi serialization; they do not prove third-party services or model quality.',
 'Plan and resume reasoning inheritance are covered by backend unit tests, separately from this UI run.'
]};
const sockets=new Set(),effortSets={narrow:['low','high'],wide:['low','medium','high']};
const server=createServer(async(req,res)=>{
 try{
  const id=decodeURIComponent(req.url.split('/').pop());
  if(req.method==='GET'){
   evidence.metadataRequests.push(req.url);
   if(id==='unknown-model'){res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({id,object:'model',owned_by:'fixture'}));return;}
   const levels=effortSets[id]||[],supported=id!=='unsupported-model';
   const caps={effort:{supported, ...Object.fromEntries(['low','medium','high','xhigh','max'].map(level=>[level,{supported:levels.includes(level)}]))},thinking:{supported,types:{enabled:{supported},adaptive:{supported:false}}}};
   res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({id,capabilities:caps}));return;
  }
  let raw='';for await(const chunk of req)raw+=chunk;const data=JSON.parse(raw);
  const prompt=JSON.stringify(data.messages||[]),record={url:req.url,model:data.model,reasoningEffort:data.reasoning_effort,thinking:data.thinking,stream:data.stream,prompt};evidence.modelRequests.push(record);
  if(prompt.includes('PC-HOLD-RUN')){res.writeHead(200,{'content-type':'text/event-stream'});res.write(': hold real Pi request until cancel\n\n');return;}
  const metadata={id:'chatcmpl-'+randomUUID(),created:Math.floor(Date.now()/1000),model:data.model};
  const reply={role:'assistant',content:'本地协议验证已完成，来源与输入已保留。'};
  if(data.stream){res.writeHead(200,{'content-type':'text/event-stream'});res.write('data: '+JSON.stringify({...metadata,object:'chat.completion.chunk',choices:[{index:0,delta:reply,finish_reason:null}]})+'\n\n');res.write('data: '+JSON.stringify({...metadata,object:'chat.completion.chunk',choices:[{index:0,delta:{},finish_reason:'stop'}],usage:{prompt_tokens:12,completion_tokens:12,total_tokens:24}})+'\n\n');res.end('data: [DONE]\n\n');}
  else{res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({...metadata,object:'chat.completion',choices:[{index:0,message:reply,finish_reason:'stop'}]}));}
 }catch(error){res.writeHead(500);res.end(String(error));}
});
server.on('connection',socket=>{sockets.add(socket);socket.on('close',()=>sockets.delete(socket));});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const port=server.address().port;
let app,page,models={},projects={};
async function waitValue(read,expected){const deadline=Date.now()+5000;let actual;do{actual=await read();if(JSON.stringify(actual)===JSON.stringify(expected))return actual;await new Promise(resolve=>setTimeout(resolve,30));}while(Date.now()<deadline);assert.deepEqual(actual,expected);}
const check=name=>{evidence.checks.push(name);console.log('PASS '+name);};
const call=async request=>{const result=await page.evaluate(value=>window.pm.request(value),request);assert.ok(result.ok,result.error);return result.data;};
const waitState=async(predicate,arg,timeout=20000)=>{
 const deadline=Date.now()+timeout;while(Date.now()<deadline){const state=await call({type:'state'});if(predicate(state,arg))return state;await new Promise(resolve=>setTimeout(resolve,60));}assert.fail('State did not reach expected condition');
};
async function screenshot(name){const file=name+'.png';await page.screenshot({path:path.join(output,file)});evidence.screenshots.push(file);}
async function launch(){
 const common={cwd:root,env:{...process.env,PM_SLASH_DATA_DIR:profile}};
 app=await electron.launch(packaged?{...common,executablePath}:{...common,args:['.']});
 page=await app.firstWindow();page.setDefaultTimeout(12000);page.on('pageerror',error=>evidence.pageErrors.push(error.message));await page.locator('.brand').waitFor();
 assert.equal(path.resolve(await app.evaluate(({app})=>app.getPath('userData'))),path.resolve(profile));
 await app.evaluate(({shell})=>{globalThis.__projectRevealCalls=[];shell.openPath=async directory=>{globalThis.__projectRevealCalls.push(directory);return '';};});
}
const projectRow=name=>page.locator('.project-row').filter({hasText:name});
async function projectMenu(name,action){await projectRow(name).click({button:'right'});if(action==='重命名项目')await screenshot('project-context-menu');await page.getByRole('menu').getByRole('menuitem',{name:action,exact:true}).click();}
async function openProject(name,directory){await projectRow(name).click();await waitState(state=>state.root===directory);}
async function removeProject(name,{cancel=false}={}){
 await projectMenu(name,'删除项目');const dialog=page.getByRole('dialog',{name:'删除项目',exact:true});await dialog.waitFor();if(cancel)await screenshot('project-delete-confirm');
 await dialog.getByRole('button',{name:cancel?'取消':'从列表移除',exact:true}).click();await dialog.waitFor({state:'hidden'});
}
async function reopenProject(directory){
 await app.evaluate(({dialog},directory)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[directory]});},directory);
 await page.getByRole('button',{name:'选择项目文件夹',exact:true}).click();await waitState(state=>state.root===directory);
}
async function popupGeometry(label,name){
 const trigger=composerTrigger(page,label),popup=composerPopup(page,label);
 const [a,b]=await Promise.all([trigger.boundingBox(),popup.boundingBox()]);const viewport=await page.evaluate(()=>({width:innerWidth,height:innerHeight}));
 assert.ok(a&&b&&b.x>=0&&b.y>=0&&b.x+b.width<=viewport.width+1&&b.y+b.height<=viewport.height+1,JSON.stringify({name,a,b,viewport}));
 assert.ok(b.y+b.height<=a.y+4||b.y>=a.y+a.height-4,`${name}: popup overlaps anchor`);
 const palette=await popup.evaluate(el=>({color:getComputedStyle(el).color,bg:getComputedStyle(el).backgroundColor,theme:getComputedStyle(el).getPropertyValue('--theme-text')}));assert.ok(palette.theme.trim());evidence.layouts.push({name,a,b,viewport,palette});
}
async function composerLayout(name){
 const result=await page.evaluate(()=>{const selectors=['.composer','.composer-bottom','.conversation','.work','.preview'];return{viewport:{width:innerWidth,height:innerHeight},documentOverflow:document.documentElement.scrollWidth-document.documentElement.clientWidth,items:selectors.flatMap(selector=>[...document.querySelectorAll(selector)].filter(el=>el.getBoundingClientRect().width>0).map(el=>{const r=el.getBoundingClientRect();return{selector,x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom,overflow:el.scrollWidth-el.clientWidth};}))};});
 assert.ok(result.documentOverflow<=1,JSON.stringify(result));for(const item of result.items)assert.ok(item.overflow<=1&&item.right<=result.viewport.width+1&&item.bottom<=result.viewport.height+1,JSON.stringify(item));evidence.layouts.push({name,...result});
}
async function openModel(label){await composerTrigger(page,'选择模型').click();await page.getByRole('listbox',{name:'选择模型'}).getByRole('option',{name:new RegExp('^'+label.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'(?:\\s|$)')}).click();await composerPopup(page,'选择模型').waitFor({state:'hidden'});}
async function send(marker,expected,{effort,taskType='general'}={}){
 await page.getByLabel('描述你的任务').fill(marker+' 核对当前任务和来源。');await page.getByRole('button',{name:'发送',exact:true}).click();
 const started=await waitState(state=>state.runs.some(run=>run.input?.includes(marker)));const id=started.runs.find(run=>run.input?.includes(marker)).id;
 const finished=await waitState(state=>['succeeded','failed','cancelled'].includes(state.runs.find(run=>run.id===id)?.status),undefined,45000);const run=finished.runs.find(run=>run.id===id);
 assert.equal(run.status,'succeeded',run.error);assert.equal(run.modelEntryId,expected.id);assert.equal(run.modelRoute.taskType,taskType);if(effort){assert.equal(run.reasoning.requestedLevel,effort);assert.equal(run.reasoning.effectiveLevel,effort);}
 const requests=evidence.modelRequests.filter(request=>request.prompt.includes(marker));assert.ok(requests.length);assert.ok(requests.every(request=>request.model===expected.modelId));if(effort)assert.ok(requests.every(request=>request.reasoningEffort===effort),JSON.stringify(requests));evidence.runs.push(run);return run;
}

try{
 await launch();await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(1366,900));
 const initial=await call({type:'projects'});for(const [key,directory]of Object.entries(roots))projects[key]=initial.projects.find(project=>project.root===directory);assert.ok(projects.a&&projects.b&&projects.c);
 await projectMenu('项目 B','重命名项目');const rename=page.getByRole('dialog',{name:'重命名项目',exact:true});await rename.getByRole('textbox').fill('项目 B 已重命名');await rename.getByRole('button',{name:'保存名称',exact:true}).click();await projectRow('项目 B 已重命名').waitFor();
 await projectMenu('项目 B 已重命名','置顶项目');assert.equal((await call({type:'projects'})).projects.find(p=>p.id===projects.b.id).pinned,true);await projectMenu('项目 B 已重命名','取消置顶');assert.equal((await call({type:'projects'})).projects.find(p=>p.id===projects.b.id).pinned,false);
 await projectMenu('项目 B 已重命名','复制路径');await waitValue(()=>app.evaluate(({clipboard})=>clipboard.readText()),roots.b);await projectMenu('项目 B 已重命名','打开文件夹');await waitValue(()=>app.evaluate(()=>globalThis.__projectRevealCalls),[roots.b]);check('右键重命名/置顶/取消置顶/复制路径真实保存，打开目录IPC截获');
 await projectMenu('项目 B 已重命名','在此项目新建会话');await waitState(state=>state.root===roots.b&&state.conversations.some(c=>c.id!==fixtures.b.conversationId));const bConversationIds=(await call({type:'state'})).conversations.map(c=>c.id);
 await removeProject('项目 B 已重命名',{cancel:true});assert.ok((await call({type:'projects'})).projects.some(p=>p.id===projects.b.id));check('项目新会话和删除取消保留状态');
 const retainedDraft='删除另一个项目时，这段尚未发送的需求必须保留。';await page.getByLabel('描述你的任务').fill(retainedDraft);const retainedConversation=await page.locator('.sidebar button.chosen:not(.project-row)').getAttribute('title');
 await removeProject('项目 C');assert.equal((await call({type:'projects'})).projects.some(p=>p.id===projects.c.id),false);assert.equal((await call({type:'state'})).root,roots.b);assert.equal(await page.getByLabel('描述你的任务').inputValue(),retainedDraft);assert.equal(await page.locator('.sidebar button.chosen:not(.project-row)').getAttribute('title'),retainedConversation);check('删除其他项目保留当前草稿和已选会话');
 await removeProject('项目 B 已重命名');await waitState(state=>state.root===roots.a);assert.ok((await call({type:'state'})).conversations.some(c=>c.id===fixtures.a.conversationId));
 await reopenProject(roots.b);assert.equal((await call({type:'projects'})).projects.find(p=>p.id===projects.b.id).name,'项目 B 已重命名');assert.deepEqual((await call({type:'state'})).conversations.map(c=>c.id).sort(),bConversationIds.sort());
 await removeProject('项目 A');assert.equal((await call({type:'state'})).root,roots.b);assert.equal((await call({type:'projects'})).projects.some(p=>p.id===projects.a.id),false);
 await removeProject('项目 B 已重命名');const last=await call({type:'projects'});assert.ok(last.projects.length>=1&&last.currentProjectId&&last.defaultProjectId);assert.ok((await call({type:'state'})).root);check('删除非当前/当前/默认/最后项目正确回退，重新加入恢复分区历史');
 for(const [key,directory] of Object.entries(roots))assert.equal(await fs.readFile(path.join(directory,'不要删除.txt'),'utf8'),`sentinel-${key}`);
 await reopenProject(roots.a);assert.ok((await call({type:'state'})).conversations.some(c=>c.id===fixtures.a.conversationId));await reopenProject(roots.b);await projectMenu('项目 B 已重命名','置顶项目');check('删除仅移除登记，源文件与历史未删除');
 // Same local model service supplies four actual metadata contracts.
 for(const [id,name] of [['unknown-model','能力未知'],['unsupported-model','不支持思考'],['narrow','两档思考'],['wide','三档思考']]){
  await call({type:'modelUpsert',model:{provider:'loopback',name,baseUrl:`http://127.0.0.1:${port}/v1`,modelId:id,protocol:'openai-completions'},key:'isolated-fixture-key'});
  models[id]=(await call({type:'models'})).groups.flatMap(g=>g.models).find(m=>m.modelId===id);
  const capability=await call({type:'modelThinkingCapability',modelEntryId:models[id].id,refresh:true});evidence.layouts.push({model:id,capability});assert.equal(capability.status,id==='unknown-model'?'unknown':id==='unsupported-model'?'unsupported':'supported');if(effortSets[id])assert.deepEqual(capability.levels,effortSets[id]);
 }
 await call({type:'modelDefault',id:models.wide.id});await call({type:'appPreferences',patch:{modelRouting:{strategy:'task_type',taskTypes:{writing:models.wide.id,coding:models.narrow.id,general:models.wide.id}}}});
 assert.equal(await page.getByRole('combobox',{name:'产品工作流'}).count(),0);
 const input=page.getByLabel('描述你的任务'),original='保留我已写的需求：审批必须记录退回原因。';await input.fill(original);await chooseComposerWorkflow(page,'交互原型');assert.ok((await input.inputValue()).includes(original));await page.getByLabel('任务上下文',{exact:true}).waitFor();const withIntent=await input.inputValue();await page.getByRole('button',{name:'移除任务上下文',exact:true}).click();assert.equal(await input.inputValue(),withIntent);assert.equal(await page.getByLabel('任务上下文',{exact:true}).count(),0);check('+快捷动作与上下文移除保留用户输入');
 await composerTrigger(page,'添加').click();await composerPopup(page,'添加').getByRole('button',{name:'引用资料',exact:true}).click();const picker=page.getByRole('dialog',{name:'选择引用资料'});await picker.getByRole('option').filter({hasText:'会议证据.md'}).click();await picker.getByRole('button',{name:'确认引用',exact:true}).click();await picker.waitFor({state:'hidden'});check('+引用资料仍读取实际已授权文件');
 await chooseComposerPermission(page,'完全访问');await composerTrigger(page,'权限').click();const method=composerPopup(page,'权限');assert.equal(await method.getByRole('radiogroup',{name:'权限'}).getByRole('radio').filter({hasText:'完全访问'}).getAttribute('aria-checked'),'true');await popupGeometry('权限','权限自定义浮层');await screenshot('work-method');await page.keyboard.press('Escape');
 await chooseComposerWorkflow(page,'会议后整理');
 const metadataBeforeSelection=evidence.metadataRequests.length;
 for(const id of ['unknown-model','unsupported-model']){await openModel(models[id].name);await page.getByRole('button',{name:'思考强度',exact:true}).waitFor({state:'hidden'});assert.equal(await page.getByRole('slider').count(),0);await screenshot('model-'+id);await page.keyboard.press('Escape');}assert.equal(evidence.metadataRequests.length,metadataBeforeSelection);check('unknown/unsupported均无虚假思考滑杆，普通切换不请求metadata');
 await page.emulateMedia({reducedMotion:'reduce'});await openModel(models.narrow.name);await page.getByRole('button',{name:'思考强度',exact:true}).click();await composerPopup(page,'思考强度').getByRole('button',{name:'重新检测',exact:true}).click();const metadataDeadline=Date.now()+5000;while(evidence.metadataRequests.length===metadataBeforeSelection&&Date.now()<metadataDeadline)await new Promise(resolve=>setTimeout(resolve,30));assert.equal(evidence.metadataRequests.length,metadataBeforeSelection+1);await page.getByRole('button',{name:'思考强度',exact:true}).click();check('重新检测按钮明确触发一次metadata refresh');const range=page.getByRole('slider',{name:'思考强度'});assert.equal(await range.getAttribute('max'),'1');await range.focus();await range.press('Home');await range.press('End');assert.equal(await range.getAttribute('aria-valuetext'),'深入');assert.equal(await composerPopup(page,'思考强度').locator('.thinking-slider-track i').evaluate(el=>getComputedStyle(el).transitionDuration),'0s');await screenshot('thinking-two-levels-reduced-motion');await page.keyboard.press('Escape');
 const run=await send('PC-REAL-HIGH',models.narrow,{effort:'high',taskType:'writing'});assert.equal(run.permissionMode,'full_access');assert.ok(evidence.modelRequests.some(r=>r.prompt.includes('PC-SOURCE-20261004')));check('keyboard滑杆选择真实high，Pi发送reasoning_effort并绑定Run与真实来源');
 await openModel(models.narrow.name);await page.getByRole('button',{name:'思考强度',exact:true}).click();await page.getByRole('slider',{name:'思考强度'}).focus();await page.getByRole('slider',{name:'思考强度'}).press('Home');await page.keyboard.press('Escape');
 await openModel(models.wide.name);await page.getByRole('button',{name:'思考强度',exact:true}).click();await page.getByRole('slider',{name:'思考强度'}).waitFor();assert.equal(await page.getByRole('slider',{name:'思考强度'}).getAttribute('max'),'2');await composerPopup(page,'思考强度').getByText(/默认 ·/).waitFor();await page.getByRole('slider',{name:'思考强度'}).focus();await page.getByRole('slider',{name:'思考强度'}).press('Home');await page.getByRole('slider',{name:'思考强度'}).press('ArrowRight');assert.equal(await page.getByRole('slider',{name:'思考强度'}).getAttribute('aria-valuetext'),'适中');await page.keyboard.press('Escape');await send('PC-REAL-MEDIUM',models.wide,{effort:'medium'});check('换模型恢复默认并使用不同真实集合medium');
 await chooseComposerModel(page,'自动');await chooseComposerWorkflow(page,'交互原型');await send('PC-AUTO-CODING',models.narrow,{taskType:'coding'});await chooseComposerWorkflow(page,'写 / 改 PRD');await send('PC-AUTO-WRITING',models.wide,{taskType:'writing'});check('自动路由使用当前快捷动作对应模型分工');
 // Keep a real network session open to verify the server-side deletion guard.
 const state=await call({type:'state'}),activeConversation=state.conversations[0].id;const hold=await call({type:'send',id:activeConversation,text:'PC-HOLD-RUN',mode:'build',permissionMode:'standard',modelEntryId:models.wide.id});await waitState(s=>s.runs.find(r=>r.id===hold)?.status==='running');
 const rejected=await page.evaluate(id=>window.pm.request({type:'projectRemove',id}),projects.b.id);assert.equal(rejected.ok,false);await call({type:'cancel',id:hold});await waitState(s=>s.runs.find(r=>r.id===hold)?.status==='cancelled');check('真实运行中项目删除由后端拒绝，取消后保留项目');
 // Three themes; only two useful widths and one real preview-narrowed chat.
 const themes=[['reference','经典瓷白'],['graphite','石墨深色'],['sand','柔和米色']];
 for(const [theme,label] of themes){
  await page.getByRole('button',{name:'设置',exact:true}).first().click();const settings=page.getByRole('dialog',{name:'设置'});await settings.locator('.settings-nav button').filter({hasText:'通用'}).click();await settings.getByRole('radio',{name:new RegExp(label)}).click();await settings.getByRole('button',{name:'关闭设置'}).click();
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(1366,900));await composerLayout(theme+'-1366');await composerTrigger(page,'添加').click();await popupGeometry('添加',theme+'-添加');await screenshot(theme+'-1366-actions');await page.keyboard.press('Escape');
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(1100,760));await composerLayout(theme+'-1100');await openModel('自动');await composerTrigger(page,'选择模型').click();await popupGeometry('选择模型',theme+'-model-1100');await screenshot(theme+'-1100-model');await page.keyboard.press('Escape');
 }
 await projectMenu('项目 B 已重命名','打开成果');await page.locator('.folder-card').filter({hasText:'产出材料'}).click();await page.locator('.file-row').filter({hasText:'预览验证.md'}).getByRole('button',{name:'阅读',exact:true}).click();await page.locator('.document-reader .markdown').waitFor();await page.locator('.sidebar').getByRole('button',{name:'B 保留历史',exact:true}).click();await page.getByLabel('描述你的任务').waitFor();await page.locator('.document-reader .markdown').waitFor();await composerLayout('sand-1100-preview');await composerTrigger(page,'权限').click();await popupGeometry('权限','sand-1100-narrow-chat');await screenshot('sand-1100-preview-work-method');await page.keyboard.press('Escape');await page.getByRole('button',{name:'关闭预览',exact:true}).click();check('三主题/1366与1100/真实预览窄会话无横溢且浮层锚定');
 const metadataBeforeRestart=evidence.metadataRequests.length;const beforeRestart=await call({type:'projects'});await app.close();app=undefined;await launch();const persistedCapability=await call({type:'modelThinkingCapability',modelEntryId:models.wide.id});assert.equal(persistedCapability.status,'supported');assert.deepEqual(persistedCapability.levels,effortSets.wide);assert.equal(persistedCapability.source,'provider-model-metadata');assert.equal(evidence.metadataRequests.length,metadataBeforeRestart);check('重启读取已验证持久能力而不重新联网');const restored=await call({type:'projects'});assert.equal(restored.projects.find(p=>p.id===projects.b.id).name,'项目 B 已重命名');assert.equal(restored.projects.find(p=>p.id===projects.b.id).pinned,true);assert.equal(restored.projects.some(p=>p.id===projects.c.id),false);assert.equal(restored.currentProjectId,beforeRestart.currentProjectId);const restoredState=await call({type:'state'});assert.ok(restoredState.conversations.some(c=>c.id===fixtures.b.conversationId));for(const run of evidence.runs)assert.equal(restoredState.runs.find(r=>r.id===run.id)?.reasoning.effectiveLevel,run.reasoning.effectiveLevel);for(const [key,directory]of Object.entries(roots))assert.equal(await fs.readFile(path.join(directory,'不要删除.txt'),'utf8'),`sentinel-${key}`);check('项目名称/置顶/移除与分区历史、Run思考参数重启恢复');
 assert.deepEqual(evidence.pageErrors,[]);evidence.status='passed';
}catch(error){evidence.status='failed';evidence.error=String(error);if(page)await screenshot('failure').catch(()=>{});throw error;}
finally{await fs.writeFile(path.join(output,'result.json'),JSON.stringify(evidence,null,2));if(app)await app.close();for(const socket of sockets)socket.destroy();await new Promise(resolve=>server.close(resolve));console.log(JSON.stringify({status:evidence.status,output,checks:evidence.checks.length,error:evidence.error}));}


