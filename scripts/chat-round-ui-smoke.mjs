// Isolated Electron renderer fixture; no Service, user profile, or model traffic.
import { _electron as electron } from 'playwright';
import { createServer } from 'node:http';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

const root=process.cwd(),renderer=path.join(root,'dist/renderer'),output=path.join(root,'.test-data',`chat-round-ui-${Date.now()}`);
await fs.mkdir(output,{recursive:true});
const time='2026-10-09T01:00:00.000Z',later='2026-10-09T02:00:00.000Z';
const msg=(role,text,runId,timeValue=time)=>({role,text,runId,time:timeValue});
const run=(id,status='succeeded',extra={})=>({id,conversationId:'chat',startedAt:time,status,updatedAt:later,...extra});
const change=(id,runId,status,pathValue='原型/作战中心.html')=>({id,runId,status,mountId:'m',path:pathValue,before:'旧内容',content:'<html><body>合成预览</body></html>',createdAt:time});
const state={root:'E:\\synthetic-chat-ui',mounts:[],connections:[],models:[],model:{id:'',baseUrl:'',hasKey:false},pendingApprovals:[],
 conversations:[{id:'chat',title:'原型修改与资料核对',archived:false,messages:[msg('user','生成作战中心'),msg('assistant','已完成作战中心，保存的历史版本在本条回复下。','old'),msg('user','检查当前资料，只说明结果，不修改旧成果',undefined,later),msg('assistant','已读取项目资料，目前正在核对新的要求。','live',later)]}],
 runs:[run('live','running',{phase:'generating',modelEntryId:'fixture-model',runtimeStatus:{activity:'tool',updatedAt:later},inputs:[{id:'input-old',requestId:'request-old',text:'保留已确认规则',delivery:'steer',status:'queued',createdAt:later}]}),run('old'),run('orphan')],
 changes:[change('saved-old','old','applied'),change('new-draft','live','pending','原型/异动端SFA主要界面.html'),change('orphan-conflict','orphan','conflict','原型/遗留冲突.html')],
};
const server=createServer(async(req,res)=>{try{const file=path.resolve(renderer,decodeURIComponent(new URL(req.url,'http://localhost').pathname).replace(/^\/+/, '')||'index.html');if(!file.startsWith(renderer+path.sep)){res.writeHead(403).end();return;}res.writeHead(200,{'content-type':{'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.woff2':'font/woff2'}[path.extname(file)]||'application/octet-stream'});res.end(await fs.readFile(file));}catch{res.writeHead(404).end();}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const host=path.join(output,'host.cjs');
await fs.writeFile(host,`const {app,BrowserWindow}=require('electron');\napp.setPath('userData',${JSON.stringify(path.join(output,'profile'))});app.whenReady().then(()=>{const window=new BrowserWindow({show:false,width:1440,height:900,webPreferences:{contextIsolation:true,nodeIntegration:false}});window.loadURL('about:blank');});app.on('window-all-closed',()=>app.quit());`);
const result={status:'running',output,cloudExecuted:false,productionProfileAccessed:false,checks:[],pageErrors:[],limitations:['Synthetic bridge verifies compiled renderer interaction in Electron. Actual gateway, cloud model, filesystem writes and cancellation execution are not exercised.']};
let app,page;
const check=name=>{result.checks.push(name);console.log('PASS '+name);};
const live=()=>page.locator('.message.assistant').filter({has:page.locator('.reply-details[data-run-id="live"]')}).last();
const outputCard=id=>page.locator(`[data-change-id="${id}"]`);
const setState=async update=>page.evaluate(updateSource=>window.__updateFixture(updateSource),update);
try{
 app=await electron.launch({cwd:root,args:[host],env:{...process.env,ELECTRON_RUN_AS_NODE:undefined}});page=await app.firstWindow();page.setDefaultTimeout(12000);page.on('pageerror',error=>result.pageErrors.push(error.message));
 await page.addInitScript(state=>{
  window.__fixtureCalls=[];const subscribers=new Set();const broadcast=event=>subscribers.forEach(listener=>listener(event));
  window.__updateFixture=source=>{new Function('state',source)(state);broadcast({type:'state'});};
  window.pm={subscribe:listener=>{subscribers.add(listener);return()=>subscribers.delete(listener);},request:async request=>{
   window.__fixtureCalls.push(request);
   let data={state,windowTheme:null,projects:[],externalActions:[],files:[],mcpElicitations:[],
    productRecords:{workspaceId:'fixture',revision:1,requirements:[],artifacts:[],reviews:[],artifactLinks:[],designPackages:[]},decisionCenter:{items:[]},
    modelThinkingCapability:{levels:[],status:'unsupported',fingerprint:'fixture',source:'fixture'},
    runCheckpoint:{runId:request.runId,attempt:1,phase:'generating',updatedAt:state.runs.find(run=>run.id===request.runId)?.startedAt,assistantText:'',completedOperations:[],safeToResume:false},
   }[request.type];
   if(request.type==='runInputEnqueue'){const target=state.runs.find(run=>run.id===request.runId);target.inputs.push({...request,id:request.requestId,status:'queued',createdAt:new Date().toISOString()});data={};broadcast({type:'state'});}
   if(request.type==='runInputClearQueued'){state.runs.find(run=>run.id===request.runId).inputs.forEach(input=>{if(input.status==='queued')input.status='cancelled';});data={};}
   if(request.type==='cancel'){state.runs.find(run=>run.id===request.id).status='cancelled';data={};broadcast({type:'state'});}
   if(request.type==='approvalResolve'){const approval=state.pendingApprovals.find(value=>value.id===request.id);approval.status='approved';data={...approval,outcome:'resolved',message:'合成授权已处理'};}
   return data!==undefined?{ok:true,data:structuredClone(data)}:{ok:false,error:'Fixture forbids '+request.type};
  }};
 },state);
 await page.goto(`http://127.0.0.1:${server.address().port}`);await page.locator('.brand').waitFor();
 assert.equal(await page.locator('.composer-wrap .run-runtime-status').count(),0);
 assert.equal(await page.getByRole('button',{name:'发送',exact:true}).count(),0);assert.equal(await page.getByRole('button',{name:'停止任务',exact:true}).count(),1);
 assert.equal(await page.locator('.composer-bottom .send').count(),1);assert.equal(await outputCard('saved-old').count(),1);
 assert.equal(await live().locator('[data-change-id="saved-old"]').count(),0);assert.equal(await live().locator('[data-change-id="new-draft"]').count(),1);
 assert.equal(await page.locator('.reply-run-anchor [data-change-id="orphan-conflict"]').count(),1);
 const placement=await page.locator('.messages').evaluate(el=>[...el.children].map(child=>({text:child.textContent,change:child.querySelector('[data-change-id]')?.dataset.changeId})));
 assert.ok(placement.findIndex(item=>item.change==='saved-old')<placement.findIndex(item=>item.text.includes('检查当前资料')));
 await live().scrollIntoViewIfNeeded();await page.screenshot({path:path.join(output,'running-compact.png')});check('旧成果仅在所属回复，活动部分回复不重复；停止为唯一主按钮；遗留冲突保留');
 const input=page.getByRole('textbox',{name:'描述你的任务'}),initialHeight=(await input.boundingBox()).height;
 assert.ok(initialHeight>=70&&initialHeight<=80);assert.ok((await page.locator('.conversation-head').boundingBox()).height<=56);
 await input.fill(Array.from({length:8},(_,i)=>'第'+(i+1)+'行补充内容').join('\n'));assert.ok((await input.boundingBox()).height>initialHeight);assert.ok((await input.boundingBox()).height<=201);
 await page.getByRole('button',{name:'加入本轮补充',exact:true}).click();await input.waitFor();await page.waitForFunction(()=>window.__fixtureCalls.some(call=>call.type==='runInputEnqueue'));assert.equal(await input.inputValue(),'');check('输入默认适中并自动增长；文字补充入口沿用原enqueue');
 await live().getByRole('button',{name:'生成与执行',exact:true}).click();const details=live().getByRole('region',{name:'此回复的生成与执行'});await details.waitFor();
 await details.locator('.run-execution-details>summary').click();await details.locator('.run-runtime-status details>summary').click();assert.match(await details.innerText(),/本轮补充沿用.*fixture-model/);assert.match(await details.innerText(),/保留已确认规则/);
 await page.screenshot({path:path.join(output,'execution-expanded.png')});await details.getByRole('button',{name:'清除全部待发送补充'}).click();await page.waitForFunction(()=>window.__fixtureCalls.some(call=>call.type==='runInputClearQueued'));check('运行和补充记录在原生成与执行内，清除待发送补充仍可用');
 await live().getByRole('button',{name:'生成与执行',exact:true}).click();
 await setState("state.changes.push({ ...state.changes[0],id:'new-version',runId:'live',status:'pending' });");await outputCard('new-version').waitFor();assert.equal(await live().locator('[data-change-id="new-version"]').count(),1);assert.equal(await outputCard('saved-old').count(),1);check('同名成果的新修改仍展示，历史版本不删除');
 await outputCard('new-draft').getByRole('button',{name:'查看',exact:true}).click();await page.locator('.document-stage').waitFor();await page.setViewportSize({width:1100,height:800});await page.screenshot({path:path.join(output,'preview-narrow-chat.png')});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.equal(await page.locator('.conversation').evaluate(el=>el.scrollWidth>el.clientWidth),false);
 await page.setViewportSize({width:560,height:800});await page.locator('.preview-more>summary').click();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:path.join(output,'mobile-preview-expanded.png')});check('预览压缩会话与窄屏展开菜单均无横向溢出');
 if(!process.argv.includes('--layout-only')) {
 await page.setViewportSize({width:1440,height:900});await page.getByRole('button',{name:'关闭预览',exact:true}).click();
 await setState("state.runs[0].runtimeStatus={activity:'retry_wait',updatedAt:new Date().toISOString(),retry:{attempt:2,maxAttempts:3,delayMs:2000,status:'waiting'}};");await live().getByRole('button',{name:/模型重试/}).waitFor();check('自动重试可见，详细事实继续折叠');
 await setState("state.runs[0].status='waiting_user';state.runs[0].phase='waiting_approval';state.pendingApprovals=[{id:'approval',runId:'live',conversationId:'chat',status:'pending',capability:'process.exec',summary:'合成操作等待授权',createdAt:new Date().toISOString()}];");await page.getByRole('button',{name:'仅这次允许',exact:true}).waitFor();await page.getByRole('button',{name:'仅这次允许',exact:true}).click();await page.waitForFunction(()=>window.__fixtureCalls.some(call=>call.type==='approvalResolve'));check('授权保持独立可见和原审批入口');
 await page.getByRole('button',{name:'停止任务',exact:true}).click();await page.getByRole('button',{name:'发送',exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'停止任务',exact:true}).count(),0);check('停止后恢复发送按钮');
 await setState("state.runs[0].status='failed';state.runs[0].error='合成失败，原稿已保留';state.runs[0].resumable=true;");await live().getByRole('button',{name:/任务可继续/}).click();await live().getByRole('button',{name:'继续任务',exact:true}).waitFor();assert.match(await live().innerText(),/合成失败，原稿已保留/);check('失败原因与继续入口保留');
 }
 assert.deepEqual(result.pageErrors,[]);result.calls=await page.evaluate(()=>window.__fixtureCalls);result.status='passed';
}catch(error){result.status='failed';result.error=error.stack||String(error);result.calls=await page?.evaluate(()=>window.__fixtureCalls).catch(()=>[]);process.exitCode=1;await page?.screenshot({path:path.join(output,'failure.png')}).catch(()=>{});}
finally{await app?.close();result.isolatedAppClosed=true;await new Promise(resolve=>server.close(resolve));await fs.writeFile(path.join(output,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({status:result.status,output,checks:result.checks.length,error:result.error}));}
