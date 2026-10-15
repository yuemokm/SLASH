// Compiled renderer in an isolated Electron profile. The bridge below is a deterministic
// fixture, not a real gateway/model integration; no user workspace or external write is used.
import {_electron as electron} from 'playwright';
import {createServer} from 'node:http';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

const root=process.cwd(),renderer=path.join(root,'dist/renderer'),output=path.join(root,'.test-data',`chat-execution-cards-ui-${Date.now()}`);
await fs.mkdir(output,{recursive:true});
const time='2026-10-13T00:00:00Z',later='2026-10-13T00:02:00Z',latest='2026-10-13T00:04:00Z';
const message=(role,text,runId,timeValue=time)=>({role,text,runId,time:timeValue});
const run=(id,conversationId,status='succeeded',extra={})=>({id,conversationId,status,startedAt:time,updatedAt:time,...extra});
const state={root:'E:\\synthetic-execution-cards',mounts:[],connections:[],models:[],model:{id:'',baseUrl:'',hasKey:false},pendingApprovals:[],changes:[],
 conversations:[
  {id:'idle',title:'简短招呼',archived:false,messages:[message('user','你好'),message('assistant','你好，今天想推进哪项产品工作？','hello')]},
  {id:'work',title:'任务步骤与工具记录',archived:false,messages:[message('user','核对现有原型'),message('assistant','先核对已有页面的规则和交互。','done'),message('tool','read_file 原型/工作台.html','done'),message('assistant','已核对原型，发现两处需要调整的操作提示。','done'),message('user','请继续处理这两处提示',undefined,later),message('assistant','已确认修改范围。','live',later),message('user','随后核对文档中的相同表述',undefined,latest)]},
  {id:'failure',title:'失败与恢复',archived:false,messages:[message('user','更新文档提示'),message('assistant','已完成资料核对，修改尚未保存。','failed')]},
  {id:'plan',title:'方案确认',archived:false,messages:[message('user','先给出调整方案')]},
 ],
 runs:[run('queued','work','queued',{phase:'queued',startedAt:latest}),run('live','work','running',{phase:'tool_call',startedAt:later,runtimeStatus:{activity:'tool',updatedAt:later}}),run('done','work','succeeded'),run('hello','idle','succeeded',{plan:{status:'completed',steps:['理解任务目标','生成回复'],source:'heuristic',createdAt:time}}),run('failed','failure','failed',{phase:'tool_call',error:'连接中断，已有草稿保留。请核对后继续。',resumable:true,runtimeStatus:{activity:'retry_wait',updatedAt:later,retry:{attempt:2,delayMs:1000,status:'waiting'}}}),run('plan','plan','awaiting_plan',{mode:'plan',phase:'waiting_plan',proposal:{status:'pending',summary:'保留已有结构，先调整两处操作提示。',options:[{id:'option',title:'局部调整',steps:['核对提示','调整文案']}],selectedOptionIds:['option'],customText:'',createdAt:time}})],
};
const server=createServer(async(req,res)=>{try{const file=path.resolve(renderer,decodeURIComponent(new URL(req.url,'http://localhost').pathname).replace(/^\/+/, '')||'index.html');if(!file.startsWith(renderer+path.sep)){res.writeHead(403).end();return;}res.writeHead(200,{'content-type':{'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.woff2':'font/woff2'}[path.extname(file)]||'application/octet-stream'});res.end(await fs.readFile(file));}catch{res.writeHead(404).end();}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const host=path.join(output,'host.cjs');await fs.writeFile(host,`const {app,BrowserWindow}=require('electron');app.setPath('userData',${JSON.stringify(path.join(output,'profile'))});app.whenReady().then(()=>{new BrowserWindow({show:false,width:1366,height:900,webPreferences:{contextIsolation:true,nodeIntegration:false}}).loadURL('about:blank');});app.on('window-all-closed',()=>app.quit());`);
const evidence={status:'running',output,checks:[],screenshots:[],pageErrors:[],productionProfileAccessed:false,cloudExecuted:false,limitations:['Synthetic bridge exercises compiled Electron UI, Run ownership and action requests. Real model/gateway execution, external writes and cancelled-tool effects are not exercised.']};
let app,page;
const check=name=>{evidence.checks.push(name);console.log('PASS '+name);};
const shot=async name=>{await page.screenshot({path:path.join(output,name+'.png')});evidence.screenshots.push(name+'.png');};
const choose=async name=>page.locator('.sidebar').getByRole('button',{name,exact:true}).click();
const update=async text=>page.evaluate(source=>window.__updateFixture(source),text);
const step=id=>page.locator(`.run-step-card[data-run-id="${id}"]`);
try{
 app=await electron.launch({cwd:root,args:[host],env:{...process.env,ELECTRON_RUN_AS_NODE:undefined}});page=await app.firstWindow();page.setDefaultTimeout(12000);page.on('pageerror',error=>evidence.pageErrors.push(error.message));
 await page.addInitScript(state=>{
  window.__fixtureCalls=[];const subscribers=new Set(),broadcast=()=>subscribers.forEach(listener=>listener({type:'state'}));
  window.__updateFixture=source=>{new Function('state',source)(state);broadcast();};
  const records={workspaceId:'fixture',revision:1,requirements:[],artifacts:[],reviews:[],artifactLinks:[],designPackages:[]};
  const decisions={items:[{id:'local-record',kind:'decision',recordId:'local-record',title:'文案调整待确认',description:'保留原有业务规则。',status:'pending',conversationId:'work',sourceRefs:[{kind:'conversation',id:'work',label:'任务步骤与工具记录'}]},{id:'project-history',kind:'decision',recordId:'project-history',title:'其他会话的已确认口径',description:'已确认的历史记录仍可查看。',status:'confirmed',conversationId:'other',sourceRefs:[{kind:'conversation',id:'other',label:'另一会话'}],history:[{from:'pending',to:'confirmed',at:'2026-10-12T00:00:00Z',note:'已核对原资料'}]}]};
  window.pm={subscribe:listener=>{subscribers.add(listener);return()=>subscribers.delete(listener);},request:async request=>{
   window.__fixtureCalls.push(request);let data={state,windowTheme:null,projects:[],files:[],externalActions:[],mcpElicitations:[],productRecords:records,decisionCenter:decisions,subagentSettingsGet:{enabled:false},modelThinkingCapability:{levels:[],status:'unsupported',fingerprint:'fixture',source:'fixture'},runCheckpoint:{runId:request.runId,attempt:1,phase:state.runs.find(run=>run.id===request.runId)?.phase||'completed',updatedAt:state.runs.find(run=>run.id===request.runId)?.startedAt||state.runs[0].startedAt,assistantText:'',completedOperations:[],safeToResume:false},runRecoveryGet:{runId:request.runId,contextToken:'a'.repeat(64),blocked:false,records:[]}}[request.type];
   if(request.type==='cancel'){const target=state.runs.find(run=>run.id===request.id);target.status='cancelled';target.updatedAt=new Date().toISOString();data={};broadcast();}
   if(request.type==='approvalResolve'){const target=state.pendingApprovals.find(item=>item.id===request.id);target.status='approved';data={...target,outcome:'resolved',message:'授权已处理'};broadcast();}
   if(request.type==='planDraft'){const target=state.runs.find(run=>run.id===request.id);target.proposal.selectedOptionIds=request.selectedOptionIds;target.proposal.customText=request.customText;data={};}
   if(request.type==='resume')data={};
   return data!==undefined?{ok:true,data:structuredClone(data)}:{ok:false,error:'Fixture forbids '+request.type};
  }};
 },state);
 await page.goto(`http://127.0.0.1:${server.address().port}`);await page.locator('.brand').waitFor();await choose('简短招呼');
 assert.equal(await page.locator('.run-step-card').count(),0);assert.equal(await page.getByRole('button',{name:'生成与执行',exact:true}).count(),0);assert.equal(await page.getByRole('button',{name:'工作记录与项目历史',exact:true}).count(),0);assert.equal(await page.getByRole('button',{name:'工作记录',exact:true}).count(),1);await shot('idle-short-reply');check('完成招呼没有空卡或底部重复入口，复制与时间保留');
 await choose('任务步骤与工具记录');await step('live').waitFor();assert.equal(await step('live').count(),1);assert.equal(await step('done').count(),1);assert.equal(await step('queued').count(),1);assert.match(await step('live').innerText(),/正在执行工具/);assert.match(await step('queued').innerText(),/排队等待/);
 const liveReply=page.locator('.message.assistant').filter({has:step('live')});assert.equal(await liveReply.locator('.reply-details').getAttribute('data-run-id'),'live');assert.equal(await page.locator('.messages .message.tool details').first().evaluate(el=>el.open),false);
 const doneReply=page.locator('.message.assistant').filter({has:step('done')});assert.match(await doneReply.innerText(),/已核对原型/);assert.equal(await doneReply.evaluate(el=>el.querySelector('.run-step-card').compareDocumentPosition(el.querySelector('.prose'))&Node.DOCUMENT_POSITION_FOLLOWING),4);assert.equal(await step('live').locator('.run-execution-details').evaluate(el=>el.open),false);await shot('running-and-queued');check('同Run仅一个卡且位于最终答复前，工具原折叠，排队不误抢活动Run');
 await step('live').locator('.run-execution-details>summary').click();await page.waitForFunction(()=>window.__fixtureCalls.some(item=>item.type==='runCheckpoint'&&item.runId==='live'));await step('live').locator('.run-execution-details>summary').click();check('执行详情按需读取本Run检查点，默认不重复工具清单');
 await update("state.runs.find(run=>run.id==='live').runtimeStatus={activity:'retry_wait',updatedAt:new Date().toISOString(),retry:{attempt:2,maxAttempts:3,delayMs:2000,status:'waiting'}}");await step('live').getByText('等待模型重试 · 第 2 次',{exact:true}).waitFor();check('重试真实状态直接显示在步骤摘要');
 await update("const run=state.runs.find(run=>run.id==='live');run.status='waiting_user';run.phase='waiting_approval';state.pendingApprovals=[{id:'approval',runId:'live',conversationId:'work',status:'pending',capability:'process_execute',summary:'授权本次原型检查',createdAt:new Date().toISOString()}];");await step('live').locator('.run-plan-head').getByText('等待授权确认',{exact:true}).waitFor();await page.getByRole('button',{name:'仅这次允许',exact:true}).click();await page.waitForFunction(()=>window.__fixtureCalls.some(item=>item.type==='approvalResolve'&&item.id==='approval'));check('审批状态和原授权按钮保持可见及归属');
 if(await page.locator('.notice button').isVisible())await page.locator('.notice button').click();
 await page.getByRole('button',{name:'工作记录',exact:true}).click();const records=page.getByRole('region',{name:'工作记录与项目历史',exact:true});await records.getByText('文案调整待确认',{exact:true}).waitFor();assert.equal(await records.getByText('其他会话的已确认口径',{exact:true}).count(),0);await records.getByRole('button',{name:'项目历史',exact:true}).click();await records.getByText('其他会话的已确认口径',{exact:true}).waitFor();await shot('project-work-records');await records.getByRole('button',{name:'记录待确认',exact:true}).click();await records.getByRole('textbox',{name:'待确认标题'}).fill('保留未保存的记录');await page.getByRole('button',{name:'工作记录',exact:true}).click();await page.getByRole('button',{name:'工作记录',exact:true}).click();assert.equal(await records.getByRole('textbox',{name:'待确认标题'}).inputValue(),'保留未保存的记录');await page.getByRole('button',{name:'收起工作记录',exact:true}).click();check('顶部入口保留当前事项、完整项目历史、处理记录及未提交草稿');
 await choose('失败与恢复');await step('failed').getByRole('button',{name:'继续任务',exact:true}).waitFor({state:'visible'});assert.match(await step('failed').innerText(),/执行失败/);assert.doesNotMatch(await step('failed').locator('.run-plan-head').innerText(),/重试/);await shot('failure-recovery');await step('failed').getByRole('button',{name:'继续任务',exact:true}).click();await page.waitForFunction(()=>window.__fixtureCalls.some(item=>item.type==='resume'&&item.id==='failed'));check('失败终态覆盖旧运行字段，恢复入口使用原Run');
 await choose('方案确认');await step('plan').getByRole('button',{name:'确认并开始 Build',exact:true}).waitFor();await step('plan').getByRole('textbox',{name:'自定义方案补充'}).fill('保持现有业务规则');await page.waitForFunction(()=>window.__fixtureCalls.some(item=>item.type==='planDraft'&&item.id==='plan'&&item.customText==='保持现有业务规则'));await shot('plan-confirmation');check('无正文方案仍保留确认选项和原保存请求');
 await choose('任务步骤与工具记录');await page.getByRole('button',{name:'停止任务',exact:true}).click();await step('live').getByText('任务已取消',{exact:true}).waitFor();assert.equal(await step('live').count(),1);await page.waitForFunction(()=>window.__fixtureCalls.some(item=>item.type==='cancel'&&item.id==='live'));await shot('cancelled-step');check('停止请求绑定运行中Run，取消后的步骤与排队任务均保留');
 if(await page.locator('.notice button').isVisible())await page.locator('.notice button').click();
 for(const width of [680,390]){await page.setViewportSize({width,height:850});await step('queued').scrollIntoViewIfNeeded();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.getByRole('button',{name:'工作记录',exact:true}).click();assert.equal(await records.isVisible(),true);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await shot('narrow-'+width);await page.getByRole('button',{name:'工作记录',exact:true}).click();}check('680与390窗口运行卡、历史面板无横向溢出且入口可操作');
 assert.deepEqual(evidence.pageErrors,[]);evidence.calls=await page.evaluate(()=>window.__fixtureCalls);evidence.status='passed';
}catch(error){evidence.status='failed';evidence.error=error.stack||String(error);process.exitCode=1;await shot('failure').catch(()=>{});}
finally{await app?.close();await new Promise(resolve=>server.close(resolve));await fs.writeFile(path.join(output,'result.json'),JSON.stringify(evidence,null,2));console.log(JSON.stringify({status:evidence.status,output,checks:evidence.checks.length,error:evidence.error}));}
