import {_electron as electron} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {Store} from '../dist/main/store.js';
import {Service} from '../dist/main/service.js';

// Unified build owner prepares dist. This uses a fresh profile and real native
// Chromium drag file paths/preload/IPC/Files. Explorer calls are recorded to
// avoid spawning extra windows; Windows Explorer UI is not certified here.
const output=path.resolve('.test-data',`project-folder-shortcut-ui-${Date.now()}`),profile=path.join(output,'profile');await fs.mkdir(output,{recursive:true});
const store=new Store(profile),service=new Service(store,()=>'',()=>{}),aRoot=path.join(output,'项目甲'),bRoot=path.join(output,'项目乙');
await service.workspace(aRoot);const aId=service.listProjects().currentProjectId;await fs.mkdir(path.join(aRoot,'资源','自定义空目录'));
await service.workspace(bRoot);const bId=service.listProjects().currentProjectId,conversationId=service.conversation(undefined,'保留项目乙会话');service.save();store.close();
const source=path.join(output,'拖入原件.md');await fs.writeFile(source,'原文件保留');
const evidence={status:'running',output,checks:[],screenshots:[],pageErrors:[],limitations:['Native Chromium file drag transport and actual Electron IPC/local file copy are exercised. Explorer shell.openPath is intercepted to record resolved paths; actual Explorer windows and SMB two-machine behavior are not certified.']};
let app,page,cdp;const check=name=>{evidence.checks.push(name);console.log('PASS '+name);};
const call=async request=>{const value=await page.evaluate(request=>window.pm.request(request),request);assert.ok(value.ok,value.error);return value.data;};
const center=async locator=>{const box=await locator.boundingBox();assert.ok(box);return{x:box.x+box.width/2,y:box.y+box.height/2};};
const data={items:[],files:[source],dragOperationsMask:1};
const drag=async(type,locator)=>{await cdp.send('Input.dispatchDragEvent',{type,...await center(locator),data});};
const menu=()=>page.getByRole('region',{name:'项目甲资源导入目录',exact:true});
const waitFile=async file=>{const end=Date.now()+10000;while(Date.now()<end){try{await fs.stat(file);return;}catch{}await new Promise(resolve=>setTimeout(resolve,50));}throw Error('File not copied: '+file);};
const screenshot=async name=>{await page.screenshot({path:path.join(output,name+'.png')});evidence.screenshots.push(name+'.png');};
try{
 app=await electron.launch({args:['.'],cwd:process.cwd(),env:{...process.env,PM_SLASH_DATA_DIR:profile}});page=await app.firstWindow();page.setDefaultTimeout(15000);page.on('pageerror',error=>evidence.pageErrors.push(error.message));await page.locator('.brand').waitFor();await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(1280,900));
 await app.evaluate(({shell})=>{globalThis.__folderOpened=[];shell.openPath=async target=>{globalThis.__folderOpened.push(target);return '';};});
 await page.getByRole('button',{name:'保留项目乙会话',exact:true}).click();await page.getByLabel('描述你的任务').fill('乙项目未发送内容');
 // Expanding another project historically switches it. Return to B first,
 // then verify folder shortcuts operate on A without any further switching.
 await page.locator('.project-row').filter({has:page.getByText('项目甲',{exact:true})}).click();await page.locator('.project-row.chosen').filter({has:page.getByText('项目甲',{exact:true})}).waitFor();
 await page.locator('.project-row').filter({has:page.getByText('项目乙',{exact:true})}).click();await page.locator('.project-row.chosen').filter({has:page.getByText('项目乙',{exact:true})}).waitFor();
 await page.getByRole('button',{name:'保留项目乙会话',exact:true}).click();await page.getByLabel('描述你的任务').fill('乙项目未发送内容');
 const shortcuts=page.getByLabel('项目甲项目文件夹'),resource=shortcuts.getByRole('button',{name:/^资源/}),artifact=shortcuts.getByRole('button',{name:/^成果/});await shortcuts.waitFor();cdp=await page.context().newCDPSession(page);
 await resource.click();await artifact.click();const openDeadline=Date.now()+10000;while((await app.evaluate(()=>globalThis.__folderOpened.length))<2&&Date.now()<openDeadline)await new Promise(resolve=>setTimeout(resolve,30));const opened=await app.evaluate(()=>globalThis.__folderOpened);assert.deepEqual(opened.map(value=>path.normalize(value)),[path.join(aRoot,'资源'),path.join(aRoot,'成果')]);assert.equal((await call({type:'state'})).root,bRoot);check('其他项目资源/成果普通点击解析所属真实根目录并调用openPath，当前项目保持乙');
 await drag('dragEnter',resource);await drag('dragOver',resource);await menu().getByText('自定义空目录',{exact:true}).waitFor();assert.equal(await menu().getByText('拖入原件.md',{exact:true}).count(),0);check('真实文件拖过资源入口出现实际子目录，含空目录，文件不混入列表');await screenshot('其他项目资源目录悬浮');
 const destination=menu().locator('.project-folder-drop-option').filter({has:page.getByText('自定义空目录',{exact:true})});await drag('dragOver',destination);await drag('drop',destination);await waitFile(path.join(aRoot,'资源','自定义空目录','拖入原件.md'));assert.equal(await fs.readFile(source,'utf8'),'原文件保留');await assert.rejects(fs.stat(path.join(bRoot,'资源','自定义空目录','拖入原件.md')),/ENOENT/);await menu().waitFor({state:'hidden'});assert.equal((await call({type:'state'})).root,bRoot);assert.equal(await page.getByLabel('描述你的任务').inputValue(),'乙项目未发送内容');check('原生拖动按钮到悬浮子目录连续可达，松开通过真实preload/IPC复制到甲且保留乙草稿与原件');
 await page.getByText('正在导入…',{exact:true}).waitFor({state:'hidden'});await drag('dragEnter',resource);await drag('dragOver',resource);await menu().getByText('自定义空目录',{exact:true}).waitFor();await drag('dragOver',destination);await drag('drop',destination);await waitFile(path.join(aRoot,'资源','自定义空目录','拖入原件 (1).md'));await page.getByText('正在导入…',{exact:true}).waitFor({state:'hidden'});check('第二次拖入重名生成副本，不覆盖原件');
 await drag('dragEnter',resource);await drag('dragOver',resource);await menu().getByText('自定义空目录',{exact:true}).waitFor();await drag('dragOver',page.getByLabel('描述你的任务'));await menu().waitFor({state:'hidden'});check('拖离入口与悬浮区域关闭目录列表');await cdp.send('Input.dispatchDragEvent',{type:'dragCancel',x:500,y:500,data});
 await drag('dragEnter',artifact);await drag('dragOver',artifact);const outputs=page.getByRole('region',{name:'项目甲成果导入目录',exact:true});await outputs.getByText('PRD',{exact:true}).waitFor();await screenshot('成果目录悬浮');await page.keyboard.press('Escape');await outputs.waitFor({state:'hidden'});check('成果入口显示实际成果子目录，Escape取消关闭');
 const state=await call({type:'state'});assert.equal(state.root,bRoot);assert.ok(state.conversations.some(item=>item.id===conversationId));assert.deepEqual(evidence.pageErrors,[]);evidence.status='passed';
}catch(error){evidence.status='failed';evidence.error=String(error.stack||error);if(page)await screenshot('失败状态').catch(()=>{});throw error;}finally{if(app)await app.close();await fs.writeFile(path.join(output,'result.json'),JSON.stringify(evidence,null,2));console.log('Evidence: '+path.join(output,'result.json'));}
