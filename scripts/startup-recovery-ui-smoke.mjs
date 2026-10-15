import {_electron as electron} from 'playwright';
import path from 'node:path';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {Store} from '../dist/main/store.js';

const root=process.cwd(),output=path.join(root,'.test-data','startup-removal-'+Date.now());
await fs.mkdir(output,{recursive:true});
const evidence={output,status:'running',checks:[],screenshots:[],limitations:['隔离本机profile及故障注入；不代表所有硬件或长期稳定性。']};
let app,page;
const pass=name=>{evidence.checks.push(name);console.log('PASS '+name);};
async function until(predicate,message){const deadline=Date.now()+30000;while(!await predicate()){if(Date.now()>deadline)throw Error(message);await new Promise(resolve=>setTimeout(resolve,50));}}
async function launch(mode,hidden=false){
 const profile=path.join(output,mode+(hidden?'-hidden':''));await fs.mkdir(profile,{recursive:true});
 if(mode==='normal'){
  const store=new Store(profile);store.set('app-preferences',{startupAnimation:'glitch',qualityGateEnabled:false,visionAutoFallback:false,legacyMarker:'preserve-existing-data'});store.close();
 }
 const env={...process.env,PM_SLASH_DATA_DIR:profile,PM_SLASH_TEST_HIDDEN:hidden?'1':'',STARTUP_FIXTURE_MODE:mode};
 delete env.ELECTRON_RUN_AS_NODE;delete env.PM_SLASH_DEV_SERVER_URL;delete env.VITE_DEV_SERVER_URL;
 app=await electron.launch({cwd:root,args:['-r',path.join(root,'scripts/startup-recovery-fixture.cjs'),'.'],env,timeout:60000});
 app.process().stderr?.on('data',data=>console.log(String(data).trim()));
 if(mode==='load-failure')return profile;
 page=await app.firstWindow({timeout:60000});page.setDefaultTimeout(30000);return profile;
}
async function ready(){await page.locator('.brand').waitFor({state:'attached'});await page.waitForFunction(()=>!document.querySelector('#startup-status'));}
async function windows(){return await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().map(win=>({url:win.webContents.getURL(),visible:win.isVisible(),backgroundThrottling:win.webContents.getBackgroundThrottling()})));}
async function call(request){const result=await page.evaluate(value=>window.pm.request(value),request);assert(result.ok,result.error);return result.data;}
async function stop(){await app?.close();app=undefined;page=undefined;}
try{
 if(!process.argv.includes('--crash-and-hidden-only')){
 const profile=await launch('normal');
 await until(()=>app.evaluate(()=>globalThis.startupEvidence.stateRequested),'initial state was never requested');
 assert.equal((await windows()).length,1);assert.equal((await windows())[0].visible,true);
 assert.equal(await app.evaluate(()=>globalThis.startupHoldState),true);pass('普通启动在初始state被暂停时主窗已显示，且仅创建一个窗口');
 await app.evaluate(()=>globalThis.startupReleaseState());await ready();
 assert.equal((await windows())[0].backgroundThrottling,true);pass('主窗加载可用，后台节流使用Electron正常默认值');
 const preferences=await call({type:'appPreferences'});assert.equal(preferences.qualityGateEnabled,false);assert.equal(preferences.visionAutoFallback,false);
 await call({type:'appPreferences',patch:{visionAutoFallback:true}});
 for(const type of ['startupHandshake','startupReady','startupAnimationPreview','startupAnimationPreviewStop'])assert.equal((await page.evaluate(value=>window.pm.request(value),{type,generation:1,style:'light'})).ok,false);
 await page.getByRole('button',{name:'设置',exact:true}).first().click();const settings=page.getByRole('dialog',{name:'设置',exact:true});await settings.waitFor();
 assert.equal(await settings.getByText('启动动画',{exact:true}).count(),0);assert.equal(await settings.locator('[data-setting-id="startup-animation"]').count(),0);
 await settings.locator('.settings-nav button').filter({hasText:'通用'}).first().click();await settings.locator('[data-setting-id="appearance"]').waitFor();
 const file='01-general-settings.png';await page.screenshot({path:path.join(output,file)});evidence.screenshots.push(file);
 const search=settings.locator('input').first();await search.fill('启动动画');assert.equal(await settings.locator('.settings-search-results button').count(),0);
 pass('通用设置及搜索无动画入口，旧IPC拒绝；其他偏好仍可读写');await stop();
 const stored=new Store(profile);const value=stored.get('app-preferences',{});assert.equal(value.legacyMarker,'preserve-existing-data');assert.equal(value.startupAnimation,'glitch');assert.equal(value.qualityGateEnabled,false);assert.equal(value.visionAutoFallback,true);stored.close();pass('同一SQLite其余偏好和未知旧键保留，没有配置库清空/迁移');
 await launch('hidden',true);await ready();assert.equal((await windows()).length,1);assert.equal((await windows())[0].visible,false);assert.equal(await app.evaluate(()=>globalThis.startupEvidence.dialogs.length),0);pass('隐藏测试主窗可用且不弹窗');await stop();
 for(const mode of ['load-failure','state-failure']){
  await launch(mode);await until(()=>app.evaluate(()=>globalThis.startupEvidence.dialogs.length===1),'missing '+mode+' recovery dialog');
  const dialog=await app.evaluate(()=>globalThis.startupEvidence.dialogs[0]);assert.equal(dialog.visible,true);assert.equal(dialog.windowCount,1);assert.match(dialog.options.detail,/Synthetic/);
  await app.evaluate(()=>globalThis.startupReleaseDialog());page=await app.firstWindow();page.setDefaultTimeout(30000);await ready();assert.equal((await windows()).length,1);pass(mode+'：失败提示附着于可见主窗，重新加载后可用');await stop();
 }
 }
 await launch('crash');await ready();await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].webContents.forcefullyCrashRenderer());
 await until(()=>app.evaluate(()=>globalThis.startupEvidence.dialogs.length===1),'missing crash recovery dialog');assert.equal(await app.evaluate(()=>globalThis.startupEvidence.dialogs[0].visible),true);
 const reloaded=page.waitForEvent('domcontentloaded',{timeout:30000});await app.evaluate(()=>globalThis.startupReleaseDialog());await reloaded;
 // Playwright keeps its Page marked crashed after Electron recreates the
 // renderer. Inspect the actual replacement document through its webContents.
 await until(()=>app.evaluate(async({BrowserWindow})=>{try{return await BrowserWindow.getAllWindows()[0].webContents.executeJavaScript("window.pm.request({type:'state'}).then(receipt=>Boolean(document.querySelector('.brand')) && receipt.ok)");}catch{return false;}}),'replacement renderer did not restore workbench and IPC');
 pass('真实renderer强制崩溃后主窗提示并成功重新加载，替换页面与state IPC可用');await stop();
 const hiddenProfile=await launch('state-failure',true);await ready();await page.getByText('Synthetic initial state failure',{exact:true}).waitFor();assert.equal((await windows())[0].visible,false);assert.equal(await app.evaluate(()=>globalThis.startupEvidence.dialogs.length),0);
 await until(async()=>/Synthetic initial state failure/.test(await fs.readFile(path.join(hiddenProfile,'startup.log'),'utf8')),'hidden failure was not logged');pass('隐藏测试初始数据失败仍反馈及记录日志，不显示窗口或对话框');await stop();
 evidence.status='passed';
}catch(error){evidence.status='failed';evidence.error=String(error);throw error;}
finally{await stop();await fs.writeFile(path.join(output,'result.json'),JSON.stringify(evidence,null,2));console.log(JSON.stringify({status:evidence.status,output,checks:evidence.checks.length}));}
