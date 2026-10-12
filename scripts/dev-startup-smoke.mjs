import {_electron as electron} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createServer} from 'node:http';

// A deliberately held module delays document.fonts.ready; capture the visible loading shell anyway.
process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY='1';

// Built application, isolated profiles and loopback only. No model requests or user processes.
const root=process.cwd(),output=path.join(root,'.test-data',`dev-startup-${Date.now()}`);
await fs.mkdir(output,{recursive:true});
const evidence={cases:[],errors:[],cloudRequests:0};
let app,page,mode='normal',releaseEntry,releaseNavigation,entryFailures=0;
const server=createServer(async(req,res)=>{
 try{
  if(mode==='navigation-failure'&&req.url==='/'){
   mode='normal';releaseNavigation=()=>req.socket.destroy();return;
  }
  const name=req.url==='/'?'index.html':decodeURIComponent(new URL(req.url,'http://localhost').pathname).slice(1);
  const file=path.resolve(root,'dist/renderer',name);
  if(!file.startsWith(path.join(root,'dist/renderer')+path.sep)){res.writeHead(403).end();return;}
  if(name.startsWith('assets/')&&name.endsWith('.js')){
   if(mode==='slow'){await new Promise(resolve=>{releaseEntry=resolve;});}
   if(mode==='entry-failure'&&entryFailures++===0){res.writeHead(404).end('Synthetic entry failure');return;}
  }
  const bytes=await fs.readFile(file);
  res.setHeader('Content-Type',name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':name.endsWith('.html')?'text/html':'application/octet-stream');
  res.end(bytes);
 }catch{res.writeHead(404).end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const url=`http://127.0.0.1:${server.address().port}/`;
const wait=async predicate=>{for(let i=0;i<300;i++){if(await predicate())return;await new Promise(resolve=>setTimeout(resolve,50));}assert.fail('Fixture timeout');};
async function launch(name,devUrl){
 const profile=path.join(output,name);await fs.mkdir(profile,{recursive:true});
 app=await electron.launch({cwd:root,args:['.'],env:{...process.env,PM_SLASH_DATA_DIR:profile,PM_SLASH_TEST_HIDDEN:'1',PM_SLASH_DEV_SERVER_URL:devUrl}});
 if(name==='navigation-failure'){
  await app.evaluate(({dialog})=>{globalThis.startupDialogs=[];dialog.showMessageBox=async(_win,options)=>{globalThis.startupDialogs.push({message:options.message,buttons:options.buttons});return{response:0,checkboxChecked:false};};});
  await wait(()=>Boolean(releaseNavigation));releaseNavigation();
 }
 page=await app.firstWindow();page.setDefaultTimeout(20000);return profile;
}
async function ready(name){
 await page.locator('.brand').waitFor();
 const response=await page.evaluate(()=>window.pm.request({type:'state'}));assert.equal(response.ok,true);
 await page.screenshot({path:path.join(output,`${name}.png`)});
 evidence.cases.push({name,status:'passed',url:page.url(),ipcOk:response.ok});
}
async function close(){if(app){await app.close();app=undefined;page=undefined;}}
try{
 await launch('production','');await ready('production-file-ui');assert.ok(page.url().startsWith('file:'));await close();
 mode='slow';await launch('slow',url);await wait(()=>Boolean(releaseEntry));
 await page.getByText('正在启动工作台，请稍候…',{exact:true}).waitFor();
 await page.screenshot({path:path.join(output,'slow-loading.png')});
 evidence.cases.push({name:'slow-entry-visible-loading',status:'passed'});releaseEntry();await ready('slow-entry-recovered');await close();
 mode='entry-failure';const entryProfile=await launch('entry-failure',url);
 await page.getByText('工作台加载失败',{exact:true}).waitFor();
 await page.screenshot({path:path.join(output,'entry-failure.png')});
 await page.getByRole('button',{name:'重新加载',exact:true}).click({noWaitAfter:true});await ready('entry-failure-retry');
 await wait(async()=>{try{return(await fs.readFile(path.join(entryProfile,'startup.log'),'utf8')).includes('Renderer entry failed');}catch{return false;}});await close();
 mode='navigation-failure';const failedProfile=await launch('navigation-failure',url);
 await ready('navigation-failure-retry');
 let dialogs=await app.evaluate(()=>globalThis.startupDialogs);assert.equal(dialogs.length,1);assert.deepEqual(dialogs[0].buttons,['重新加载','退出']);
 await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].webContents.forcefullyCrashRenderer());
 await wait(async()=>(await app.evaluate(()=>globalThis.startupDialogs)).length===2);
 // Chromium recreates its debugging target after a forced crash; the old Playwright Page remains crashed.
 await wait(async()=>app.evaluate(async({BrowserWindow})=>{
  const win=BrowserWindow.getAllWindows()[0];if(!win||win.webContents.isCrashed()||win.webContents.isLoading())return false;
  try{return await win.webContents.executeJavaScript('document.body.innerText.includes("新会话") && !!window.pm?.request');}catch{return false;}
 }));
 const recovered=await app.evaluate(async({BrowserWindow})=>{
  const win=BrowserWindow.getAllWindows()[0],state=await win.webContents.executeJavaScript('window.pm.request({type:"state"})');
  return{url:win.webContents.getURL(),ipcOk:state.ok,png:(await win.capturePage()).toPNG().toString('base64')};
 });
 await fs.writeFile(path.join(output,'renderer-crash-retry.png'),Buffer.from(recovered.png,'base64'));
 assert.equal(recovered.ipcOk,true);evidence.cases.push({name:'renderer-crash-retry',status:'passed',url:recovered.url,ipcOk:recovered.ipcOk});
 const log=await fs.readFile(path.join(failedProfile,'startup.log'),'utf8');assert.match(log,/页面加载失败/);assert.match(log,/界面进程退出/);
 evidence.cases.push({name:'safe-error-log-and-retry-dialogs',status:'passed',dialogCount:2});await close();
 evidence.status='passed';
}catch(error){evidence.status='failed';evidence.errors.push(error.stack||String(error));process.exitCode=1;if(page)await page.screenshot({path:path.join(output,'failure.png')}).catch(()=>{});}
finally{releaseEntry?.();releaseNavigation?.();await close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));evidence.spawnedAppsClosed=true;await fs.writeFile(path.join(output,'result.json'),JSON.stringify(evidence,null,2));console.log(JSON.stringify({status:evidence.status,cases:evidence.cases.length,output,errors:evidence.errors}));}
