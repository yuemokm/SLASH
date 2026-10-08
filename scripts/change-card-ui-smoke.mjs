import {_electron as electron} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {Store} from '../dist/main/store.js';
import {Service} from '../dist/main/service.js';

// Isolated hidden Electron only. Native shell calls are observed without opening Explorer.
const root=process.cwd(),output=path.resolve('.test-data',`change-card-ui-${Date.now()}`),profile=path.join(output,'profile');await fs.mkdir(output,{recursive:true});
const store=new Store(profile),service=new Service(store,()=>'',()=>{});await service.workspace(path.join(output,'定位测试项目'));
const cid=service.conversation(undefined,'成果卡片定位验证'),runId='change-card-run',started=new Date().toISOString();
service.state.runs=[{id:runId,conversationId:cid,status:'succeeded',phase:'completed',startedAt:started,updatedAt:started,attempt:1}];
service.state.conversations.find(item=>item.id===cid).messages.push({role:'assistant',text:'定位测试成果已生成。',time:started,runId});
const fixtureRoot=path.join(service.state.root,'定位成果');await fs.mkdir(fixtureRoot);const mount=await service.mount(fixtureRoot,true),realRoot=await fs.realpath(mount.path),content='<!doctype html><html><head><title>作战中心</title></head><body><h1>作战中心</h1></body></html>';
await fs.writeFile(path.join(mount.path,'已有成果.html'),content);
const draft=await service.files.draft(mount.id,'尚未创建/作战中心.html',content,runId),existing=await service.files.draft(mount.id,'已有成果.html',content+'\n',runId),saved=await service.files.draft(mount.id,'已保存.html',content,runId),deleted=await service.files.draft(mount.id,'已删除.html',content,runId);
service.state.changes=[draft,existing,saved,deleted];await service.apply(saved.id,'ui');await service.apply(deleted.id,'ui');await fs.unlink(path.join(mount.path,'已删除.html'));service.save();service.dispose();store.close();
const evidence={status:'running',output,checks:[],screenshots:[],geometry:[],pageErrors:[],limitations:['Native Explorer calls are spied in an isolated hidden Electron process; no real Explorer windows are opened.']};let app,page;
const check=name=>{evidence.checks.push(name);console.log('PASS '+name);};
const calls=()=>app.evaluate(()=>globalThis.__changeRevealCalls);
const card=name=>page.locator('.change').filter({has:page.getByRole('button',{name,exact:true})});
const shot=async name=>{await page.screenshot({path:path.join(output,name+'.png')});evidence.screenshots.push(name+'.png');};
try{
 app=await electron.launch({cwd:root,args:['.'],env:{...process.env,PM_SLASH_DATA_DIR:profile,PM_SLASH_TEST_HIDDEN:'1'}});page=await app.firstWindow();page.setDefaultTimeout(15000);page.on('pageerror',error=>evidence.pageErrors.push(error.message));await page.locator('.brand').waitFor();
 assert.equal(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().some(window=>window.isVisible())),false);
 await app.evaluate(({shell})=>{globalThis.__changeRevealCalls=[];shell.showItemInFolder=file=>globalThis.__changeRevealCalls.push({kind:'file',path:file});shell.openPath=async directory=>{globalThis.__changeRevealCalls.push({kind:'directory',path:directory});return '';};});
 await page.locator('.sidebar').getByRole('button',{name:'成果卡片定位验证',exact:true}).click();await card('作战中心.html').waitFor();
 assert.equal(await card('作战中心.html').getByText('草稿 · 尚未写入项目',{exact:true}).count(),1);assert.equal(await card('已保存.html').getByRole('button',{name:'保存到项目',exact:true}).count(),0);check('待保存草稿文案明确，已保存成果无重复保存按钮');
 await card('作战中心.html').getByRole('button',{name:'作战中心.html',exact:true}).click();await page.getByLabel('资料预览',{exact:true}).waitFor();assert.deepEqual(await calls(),[]);check('文件名普通点击沿用查看预览，不调用资源管理器');
 for(const width of [1440,1000]){
  await app.evaluate(({BrowserWindow},value)=>BrowserWindow.getAllWindows()[0].setSize(value,940),width);
  const geometry=await card('作战中心.html').evaluate(element=>{const rect=node=>{const value=node.getBoundingClientRect();return{x:value.x,y:value.y,right:value.right,bottom:value.bottom,width:value.width};};return{card:rect(element),info:rect(element.firstElementChild),name:rect(element.querySelector('.change-file-link')),state:rect(element.querySelector('.change-state')),actions:[...element.querySelectorAll(':scope > button')].map(rect),scrollWidth:element.scrollWidth,clientWidth:element.clientWidth};});evidence.geometry.push({width,...geometry});assert.ok(geometry.name.width>=65,JSON.stringify(geometry));assert.ok(geometry.state.right<=geometry.info.right+1&&geometry.name.right<=geometry.info.right+1,JSON.stringify(geometry));assert.ok(geometry.scrollWidth<=geometry.clientWidth+1,JSON.stringify(geometry));
  const rectangles=[geometry.name,geometry.state,...geometry.actions];for(let first=0;first<rectangles.length;first++)for(let second=first+1;second<rectangles.length;second++){const a=rectangles[first],b=rectangles[second];assert.ok(a.right<=b.x||b.right<=a.x||a.bottom<=b.y||b.bottom<=a.y,JSON.stringify(geometry));}await shot('卡片预览宽度-'+width);
 }check('宽窗口及1000像素窗口打开预览时，文件名、状态和按钮仍在卡片内可见');
 await page.getByRole('button',{name:'关闭预览',exact:true}).click();
 await card('已有成果.html').getByRole('button',{name:'已有成果.html',exact:true}).click({modifiers:['Control']});await page.getByRole('status').filter({hasText:'已在资源管理器中定位文件'}).waitFor();assert.deepEqual(await calls(),[{kind:'file',path:path.join(realRoot,'已有成果.html')}]);assert.equal(await page.getByLabel('资料预览',{exact:true}).count(),0);check('Ctrl左键定位已有文件且不同时打开预览');
 const filename=card('作战中心.html').getByRole('button',{name:'作战中心.html',exact:true});await filename.focus();await filename.press('Control+Enter');await page.getByRole('status').filter({hasText:'草稿尚未保存到项目'}).waitFor();assert.deepEqual((await calls()).slice(1),[{kind:'directory',path:realRoot}]);assert.equal(await page.getByLabel('资料预览',{exact:true}).count(),0);await assert.rejects(fs.stat(path.join(realRoot,'尚未创建')),{code:'ENOENT'});check('CtrlEnter仅一次定位请求，未落盘草稿打开已有父目录并提示，不建目录不保存');
 await card('已删除.html').getByRole('button',{name:'已删除.html',exact:true}).click({modifiers:['Control']});await page.getByRole('status').filter({hasText:'文件当前不存在'}).waitFor();assert.deepEqual((await calls()).at(-1),{kind:'directory',path:realRoot});check('已删除成果定位父目录并明确提示文件不存在');
 await card('作战中心.html').getByRole('button',{name:'保存到项目',exact:true}).click();await card('作战中心.html').getByText('已保存版本',{exact:true}).waitFor();assert.equal(await fs.readFile(path.join(realRoot,draft.path),'utf8'),content);assert.equal(await card('作战中心.html').getByRole('button',{name:'保存到项目',exact:true}).count(),0);check('显式保存到项目仍真正提交文件并切换已保存状态');
 const before=(await calls()).length;const result=await page.evaluate(value=>window.pm.request(value),{type:'mountAccess',id:mount.id,write:true,enabled:false});assert.ok(result.ok,result.error);const denied=await page.evaluate(value=>window.pm.request(value),{type:'changeReveal',id:draft.id});assert.equal(denied.ok,false);assert.match(denied.error,/PERMISSION_DENIED/);assert.equal((await calls()).length,before);check('撤销目录授权后IPC拒绝定位且无系统调用');
 assert.deepEqual(evidence.pageErrors,[]);evidence.status='passed';
}catch(error){evidence.status='failed';evidence.error=String(error.stack||error);if(page)await shot('失败状态').catch(()=>{});throw error;}finally{if(app)await app.close();await fs.writeFile(path.join(output,'result.json'),JSON.stringify(evidence,null,2));console.log('Evidence: '+path.join(output,'result.json'));}
