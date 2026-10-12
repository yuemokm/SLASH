import {_electron as electron} from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';

// Reuse persisted, synthetic navigation data; never access the user's profile.
const root=process.cwd(),source=path.resolve(process.argv[2]||'.test-data/test-cases-ui-1791480988730/profile');
assert(source.startsWith(path.join(root,'.test-data')+path.sep));
const output=path.join(root,'.test-data',`typography-layout-ui-${Date.now()}`),profile=path.join(output,'profile');
await fs.mkdir(output,{recursive:true});await fs.cp(source,profile,{recursive:true});
const db=new DatabaseSync(path.join(profile,'slash.sqlite'));
const state=JSON.parse(db.prepare("SELECT value FROM kv WHERE key='state'").get().value);
const id='typography-layout-fixture',now=new Date().toISOString();
state.conversations.unshift({id,title:'审批需求与验收条件',archived:false,messages:[{role:'user',time:now,text:'请整理客户准入审批的主要规则与验收条件。'},{role:'assistant',time:now,text:'## 客户准入审批\n\n提交申请前，请核对客户名称、统一社会信用代码与审批责任人。已有规则保留来源，新增结论需要确认。English text 123。\n\n- 必填项缺失时，提示具体字段。\n- 退回操作必须填写原因，原申请保留。\n- 状态改变后，同步更新列表和操作记录。\n\n| 项目 | 条件 | 处理结果 |\n|---|---|---|\n| 客户名称 | 非空 | 允许提交 |\n| 退回原因 | 必填 | 缺少时保留当前状态 |\n\n```json\n{"status":"pending","message":"等待人工核对"}\n```'}]});
db.prepare("UPDATE kv SET value=? WHERE key='state'").run(JSON.stringify(state));db.close();
const report={status:'running',source,output,checks:[],samples:[],screenshots:[],pageErrors:[],failedRequests:[],networkCalls:0,limitations:['Synthetic persisted data and real Electron IPC/file renderer. No model, embedding, publication, deployment, or user profile access. Screenshots saved at CSS scale; DPR recorded separately.']};
let app,page,cdp;
const check=name=>{report.checks.push(name);console.log('PASS '+name);};
async function sample(name,selector){
 const el=page.locator(selector).first();await el.waitFor({state:'visible'});
 await page.evaluate(()=>document.fonts.ready);
 const computed=await el.evaluate(el=>{const s=getComputedStyle(el),r=el.getBoundingClientRect();return{fontFamily:s.fontFamily,fontSize:s.fontSize,lineHeight:s.lineHeight,fontWeight:s.fontWeight,width:r.width,height:r.height,borderColor:s.borderColor,background:s.backgroundColor};});
 const {root:document}=await cdp.send('DOM.getDocument',{depth:-1,pierce:true});
 const {nodeId}=await cdp.send('DOM.querySelector',{nodeId:document.nodeId,selector});
 const {fonts}=await cdp.send('CSS.getPlatformFontsForNode',{nodeId});
 report.samples.push({name,selector,computed,fonts});return computed;
}
async function shot(name){
 const viewport=await page.evaluate(()=>({cssWidth:innerWidth,cssHeight:innerHeight,devicePixelRatio,scrollWidth:document.documentElement.scrollWidth,zoom:getComputedStyle(document.body).zoom,theme:document.querySelector('.app').dataset.theme}));
 assert.equal(viewport.scrollWidth,viewport.cssWidth,'App must not scroll horizontally');
 await page.screenshot({path:path.join(output,name+'.png'),scale:'css'});report.screenshots.push({name,...viewport});
}
try{
 app=await electron.launch({cwd:root,args:['.'],env:{...process.env,PM_SLASH_DATA_DIR:profile,PM_SLASH_DEV_SERVER_URL:'',PM_SLASH_TEST_HIDDEN:'1',ELECTRON_RUN_AS_NODE:undefined}});
 page=await app.firstWindow();page.setDefaultTimeout(15000);page.on('pageerror',error=>report.pageErrors.push(error.message));page.on('requestfailed',request=>report.failedRequests.push({url:request.url(),failure:request.failure()}));
 await page.locator('.brand').waitFor();assert(page.url().startsWith('file:'));
 assert.equal(path.resolve(await app.evaluate(({app})=>app.getPath('userData'))).toLowerCase(),profile.toLowerCase());
 await app.evaluate(()=>{globalThis.__layoutBlocked=0;globalThis.fetch=async()=>{globalThis.__layoutBlocked++;throw Error('TYPOGRAPHY_NO_NETWORK');};});
 await page.evaluate(()=>{localStorage.setItem('slash:theme','reference');localStorage.setItem('slash:details-open','false');localStorage.setItem('slash:project-sidebar-collapsed','false');});await page.reload();await page.locator('.brand').waitFor();
 report.nativeWindowBeforePlaywrightViewport=await page.evaluate(()=>({innerWidth,innerHeight,devicePixelRatio,zoom:getComputedStyle(document.body).zoom}));
 await page.setViewportSize({width:1440,height:900});
 await page.locator('.project-conversations>button').filter({hasText:'审批需求与验收条件'}).click();await page.locator('.message.assistant .prose p').first().waitFor();
 cdp=await page.context().newCDPSession(page);await cdp.send('DOM.enable');await cdp.send('CSS.enable');
 const body=await sample('assistant Chinese paragraph','.message.assistant .prose p');assert.equal(body.fontSize,'14px');assert.equal(body.lineHeight,'22px');
 assert(report.samples.at(-1).fonts.some(font=>font.isCustomFont&&font.familyName.includes('Noto Sans SC')),'Bundled Chinese font must actually render glyphs');
 const rail=page.locator('.sidebar-rail');assert.equal((await sample('rail label','.rail-label')).fontSize,'12px');assert.equal((await sample('project name','.project-name')).fontSize,'14px');
 assert.equal((await page.locator('.sidebar').boundingBox()).width,280);assert.equal((await page.locator('.sidebar-rail').boundingBox()).width,60);const headerHeight=(await page.locator('.conversation-head').boundingBox()).height;assert(headerHeight>=44&&headerHeight<=52);
 assert.equal((await page.locator('.composer textarea').boundingBox()).height,72);
 assert((await page.locator('.message.assistant').boundingBox()).width<=760);
 await sample('monospace code','.message.assistant pre');assert.match(report.samples.at(-1).computed.fontFamily,/Consolas|Cascadia/);
 await shot('chat-reference-1440');check('real file renderer uses bundled Noto for Chinese; 14px UI/14px body/12px caption and compact header/72px composer');
 await rail.getByRole('button',{name:'测试用例',exact:true}).click();await page.getByRole('region',{name:'项目测试用例'}).getByRole('button',{name:'阅读用例',exact:true}).waitFor();
 assert.equal((await sample('test case page title','.test-cases-page h1')).fontSize,'20px');assert.equal(await page.locator('.test-cases-page .eyebrow').count(),0);assert.equal(await page.getByLabel('功能所属项目').count(),1);await shot('test-cases-reference-1440');
 await page.getByRole('region',{name:'项目测试用例'}).locator('.file-row').filter({hasText:'已保存.testcases.json'}).getByRole('button',{name:'阅读用例',exact:true}).click();await page.getByLabel('手工测试用例预览',{exact:true}).waitFor();await page.setViewportSize({width:1100,height:800});await shot('test-cases-preview-1100');
 assert.equal(await rail.getByRole('button',{name:'知识库',exact:true}).count(),0);await rail.getByRole('button',{name:'资源',exact:true}).click();await page.getByRole('button',{name:'资料集合 →',exact:true}).click();const knowledge=page.getByRole('region',{name:'资料集合'});await knowledge.getByRole('heading',{name:'资料集合',exact:true}).waitFor();await page.getByRole('navigation',{name:'集合列表'}).getByRole('button').filter({hasText:'审批知识库'}).click();assert.equal(await knowledge.locator('.eyebrow').count(),0);await sample('collection list divider','.knowledge-list');await shot('knowledge-reference-1100');check('test cases and resource collections retain one project selector, readable lists, actual themed separators and narrow preview');
 await page.setViewportSize({width:1440,height:900});
 for(const name of ['资源','成果']){await rail.getByRole('button',{name,exact:true}).click();await page.getByRole('region',{name:name==='资源'?'项目资源浏览':'项目成果浏览'}).waitFor();await shot(name==='资源'?'resources-reference-1440':'outputs-reference-1440');}
 await page.locator('.project-conversations>button').filter({hasText:'审批需求与验收条件'}).click();
 const settings=page.getByRole('dialog',{name:'设置',exact:true});
 for(const [theme,label] of [['reference','经典瓷白'],['graphite','石墨深色'],['sand','柔和米色']]){
  await rail.getByRole('button',{name:'设置',exact:true}).click();await settings.waitFor();await settings.getByRole('button',{name:'通用',exact:true}).click();await settings.getByRole('radio',{name:new RegExp(label)}).click();await page.waitForFunction(theme=>document.querySelector('.app').dataset.theme===theme,theme);await sample(theme+' settings title','.settings-top h1');assert.equal(report.samples.at(-1).computed.fontSize,'20px');await shot('settings-'+theme+'-1440');
  await settings.getByRole('button',{name:'模型',exact:true}).click();await shot('settings-models-'+theme+'-1440');await page.getByRole('button',{name:'关闭设置',exact:true}).click();await shot('chat-'+theme+'-1440');
  assert.equal(await rail.getByRole('button',{name:'知识库',exact:true}).count(),0);await rail.getByRole('button',{name:'资源',exact:true}).click();await page.getByRole('button',{name:'资料集合 →',exact:true}).click();await knowledge.waitFor();await page.getByRole('navigation',{name:'集合列表'}).getByRole('button').filter({hasText:'审批知识库'}).click();await shot('knowledge-'+theme+'-1440');await page.locator('.project-conversations>button').filter({hasText:'审批需求与验收条件'}).click();
 }
 await page.setViewportSize({width:1100,height:800});await rail.getByRole('button',{name:'设置',exact:true}).click();await settings.waitFor();await shot('settings-models-sand-1100');await page.getByRole('button',{name:'关闭设置',exact:true}).click();
 await rail.getByRole('button',{name:'收起项目侧栏',exact:true}).click();assert.equal((await page.locator('.sidebar').boundingBox()).width,60);await rail.getByRole('button',{name:'展开项目侧栏',exact:true}).click();assert.equal((await page.locator('.sidebar').boundingBox()).width,280);check('all three themes preserve chat, resource collections, settings hierarchy; model settings narrow and rail collapse remain usable');
 report.networkCalls=await app.evaluate(()=>globalThis.__layoutBlocked);assert.equal(report.networkCalls,0);assert.deepEqual(report.pageErrors,[]);assert(!report.failedRequests.some(request=>request.url.includes('Noto')));report.status='passed';
}catch(error){report.status='failed';report.error=error.stack||String(error);process.exitCode=1;await page?.screenshot({path:path.join(output,'failure.png'),scale:'css'}).catch(()=>{});}
finally{await app?.close();report.isolatedAppClosed=true;await fs.writeFile(path.join(output,'result.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({status:report.status,output,checks:report.checks.length,error:report.error}));}
