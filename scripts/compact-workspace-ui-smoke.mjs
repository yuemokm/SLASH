import {_electron as electron} from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';

// Use copied synthetic data and actual Electron IPC, never the user's profile.
const root=process.cwd(),phase=process.argv[2]||'after';
assert(['before','after'].includes(phase));
const source=path.join(root,'.test-data/test-cases-ui-1791480988730/profile');
const output=await fs.mkdtemp(path.join(root,'.test-data',`compact-workspace-${phase}-`));
const profile=path.join(output,'profile');await fs.cp(source,profile,{recursive:true});
const db=new DatabaseSync(path.join(profile,'slash.sqlite'));
const state=JSON.parse(db.prepare("SELECT value FROM kv WHERE key='state'").get().value);
const time=new Date().toISOString(),title='审批需求与验收条件';
state.conversations.unshift({id:'compact-workspace-fixture',title,archived:false,messages:[{role:'user',time,text:'请整理客户准入审批的主要规则与验收条件。'},{role:'assistant',time,text:'## 客户准入审批\n\n提交申请前，请核对客户名称、统一社会信用代码与审批责任人。已有规则保留来源，新增结论需要确认。English text 123。\n\n- 必填项缺失时，提示具体字段。\n- 退回操作必须填写原因，原申请保留。\n\n| 项目 | 条件 | 处理结果 |\n|---|---|---|\n| 客户名称 | 非空 | 允许提交 |\n| 退回原因 | 必填 | 缺少时保留当前状态 |'}]});
db.prepare("UPDATE kv SET value=? WHERE key='state'").run(JSON.stringify(state));db.close();
const report={status:'running',phase,output,checks:[],screenshots:[],metrics:[],pageErrors:[],networkCalls:0,limitations:['Synthetic persisted project data, actual Electron IPC and compiled file renderer. No user profile or cloud business calls. CSS viewport measurements record DPR and zoom separately.']};
let app,page;
const check=name=>{report.checks.push(name);console.log('PASS '+name);};
async function capture(name,selector){
 const target=page.locator(selector).filter({visible:true}).first();await target.waitFor();
 await page.evaluate(()=>document.fonts.ready);
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 const metric=await target.evaluate((el,selector)=>{
  const app=document.querySelector('.app'),r=el.getBoundingClientRect(),s=getComputedStyle(el);
  return{viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio,scrollWidth:document.documentElement.scrollWidth,bodyZoom:getComputedStyle(document.body).zoom},tokens:Object.fromEntries(['--font-ui','--font-body','--font-caption','--font-title','--line-body'].map(key=>[key,getComputedStyle(app).getPropertyValue(key).trim()])),first:{selector,y:r?.y,height:r?.height,font:s?.fontSize},uiFonts:{navigation:getComputedStyle(document.querySelector('.project-row')).fontSize,button:getComputedStyle(document.querySelector('main button')).fontSize}};
 },selector);
 assert.equal(metric.viewport.scrollWidth,metric.viewport.width);
 metric.name=name;report.metrics.push(metric);
 await page.screenshot({path:path.join(output,name+'.png'),scale:'css',animations:'disabled'});report.screenshots.push(name+'.png');
}
try{
 const env={...process.env,PM_SLASH_DATA_DIR:profile,PM_SLASH_DEV_SERVER_URL:'',PM_SLASH_TEST_HIDDEN:'1'};delete env.ELECTRON_RUN_AS_NODE;
 app=await electron.launch({cwd:root,args:['.'],env,timeout:30000});page=await app.firstWindow();page.setDefaultTimeout(15000);
 page.on('pageerror',error=>report.pageErrors.push(error.message));await page.locator('.brand').waitFor();assert(page.url().startsWith('file:'));
 assert.equal(path.resolve(await app.evaluate(({app})=>app.getPath('userData'))).toLowerCase(),profile.toLowerCase());
 await app.evaluate(()=>{globalThis.__compactBlocked=0;globalThis.fetch=async()=>{globalThis.__compactBlocked++;throw Error('COMPACT_NO_NETWORK');};});
 await page.evaluate(()=>{localStorage.setItem('slash:theme','reference');localStorage.setItem('slash:details-open','false');localStorage.setItem('slash:project-sidebar-collapsed','false');});await page.reload();await page.locator('.brand').waitFor();
 report.nativeWindow=await page.evaluate(()=>({width:innerWidth,height:innerHeight,dpr:devicePixelRatio}));report.zoomFactor=await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].webContents.getZoomFactor());assert.equal(report.zoomFactor,1);
 const rail=page.locator('.sidebar-rail');
 for(const size of [{width:1366,height:768},{width:1920,height:1080}]){
  await page.setViewportSize(size);
  for(const name of ['资源','成果','测试用例','设计体系']){
   await rail.getByRole('button',{name,exact:true}).click();
   const selector=name==='设计体系'?'.design-library-card':name==='测试用例'?'.test-cases-page .file-row':'.project-resource-browser .folder-card';
   await page.locator(selector).first().waitFor();await capture(`${name}-${size.width}`,selector);
   if(name==='设计体系'){
    assert.equal(await page.locator('.design-library-card').count(),152);
    assert(await page.locator('.design-preview img').count()>140);
    await page.getByLabel('搜索设计参考').fill('Airbnb');assert.equal(await page.locator('.design-library-card').count(),1);await page.getByLabel('搜索设计参考').fill('');
   }
  }
  await page.locator('.project-conversations>button').filter({hasText:title}).click();await page.locator('.message.assistant').waitFor();await capture(`会话-${size.width}`,'.message.assistant .prose');
  const pending='保留这段未发送的审批补充';await page.getByLabel('描述你的任务').fill(pending);
  await rail.getByRole('button',{name:'设计体系',exact:true}).click();await page.getByLabel('搜索设计参考').fill('Airbnb');if(await page.getByRole('button',{name:'取消应用',exact:true}).count())await page.getByRole('button',{name:'取消应用',exact:true}).click();await page.getByRole('button',{name:'应用',exact:true}).click();
  assert.equal(await page.getByLabel('描述你的任务').inputValue(),pending);await page.getByLabel('待应用的设计体系').getByText('Airbnb',{exact:true}).waitFor();
  await capture(`会话-反馈-${size.width}`,'.notice');
  const toast=await page.locator('.notice').boundingBox(),composer=await page.locator('.composer').boundingBox();assert(toast.y+toast.height<=composer.y,'Feedback must not cover the composer or its controls');
  await rail.getByRole('button',{name:'设计体系',exact:true}).click();await capture(`设计体系-反馈-${size.width}`,'.design-library-card');
  await page.getByRole('button',{name:'返回会话',exact:true}).click();await rail.getByRole('button',{name:'设置',exact:true}).click();const settings=page.getByRole('dialog',{name:'设置',exact:true});await settings.waitFor();await settings.getByRole('button',{name:'通用',exact:true}).click();await capture(`设置-${size.width}`,'.settings-heading h1');await page.getByRole('button',{name:'关闭设置',exact:true}).click();
  check(`${size.width}: resource/output/test cases/design/chat/settings and reference preserves draft`);
 }
 if(phase==='after'){
  const by=name=>report.metrics.find(item=>item.name===name);
  for(const width of [1366,1920]){
   assert.equal(by(`会话-${width}`).first.font,'14px');assert.equal(by(`设置-${width}`).first.font,'20px');
   assert(by(`设计体系-${width}`).first.y<260);assert(by(`资源-${width}`).first.y<330);assert(by(`测试用例-${width}`).first.y<340);
   assert.equal(by(`设计体系-${width}`).tokens['--font-ui'],'14px');
  }
  await rail.getByRole('button',{name:'测试用例',exact:true}).click();await page.locator('.test-cases-page .file-row').first().waitFor();await page.setViewportSize({width:680,height:800});await capture('测试用例-窄屏','.test-cases-page .file-row');
  await page.setViewportSize({width:1366,height:768});await rail.getByRole('button',{name:'成果',exact:true}).click();await page.locator('.project-resource-browser .folder-card').first().waitFor();await page.setViewportSize({width:680,height:800});await capture('成果-窄屏','.project-resource-browser .folder-card');
  check('compact font hierarchy, earlier list starts, narrow layout and unchanged zoom');
 }
 report.networkCalls=await app.evaluate(()=>globalThis.__compactBlocked);assert.equal(report.networkCalls,0);assert.deepEqual(report.pageErrors,[]);report.status='passed';
}catch(error){report.status='failed';report.error=String(error.stack||error);process.exitCode=1;await page?.screenshot({path:path.join(output,'failure.png'),scale:'css'}).catch(()=>{});}
finally{await app?.close();await fs.writeFile(path.join(output,'result.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({status:report.status,output,checks:report.checks.length,error:report.error}));}
