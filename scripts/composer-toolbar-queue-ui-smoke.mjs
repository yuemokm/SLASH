// Actual compiled Electron, IPC and Pi session, with a held loopback stream.
// All data is synthetic and isolated; no cloud model or user profile access.
import {_electron as electron} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createServer} from 'node:http';
import {Store} from '../dist/main/store.js';
import {Service} from '../dist/main/service.js';

const repo=process.cwd(),output=await fs.mkdtemp(path.join(repo,'.test-data','composer-toolbar-queue-')),profile=path.join(output,'profile');
const report={status:'running',output,checks:[],screenshots:[],metrics:[],requests:[],pageErrors:[],cloudExecuted:false,productionProfileAccessed:false,limitations:['Loopback model holds a real Pi stream; verifies desktop layout and local queue behavior, not model output quality.']};
const store=new Store(profile),service=new Service(store,()=>'',()=>{});let cid;
try{await service.workspace(path.join(output,'workspace'));service.setPermission('workspace_read','allow');cid=service.conversation(undefined,'审批规则整理');service.save();}finally{service.dispose();await Promise.allSettled([...service.agentIndex.queues.values()]);store.close();}
const held=new Set();
const server=createServer(async(req,res)=>{
 if(req.method==='GET'){
  const id=decodeURIComponent(req.url.split('/').at(-1)),supported=id==='thinking-local';
  res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({id,capabilities:{thinking:{types:{enabled:{supported},adaptive:{supported:false}}},effort:Object.fromEntries(['low','medium','high','xhigh','max'].map(level=>[level,{supported:supported&&['low','high'].includes(level)}]))}}));return;
 }
 if(req.method!=='POST'){res.writeHead(405).end();return;}
 let body='';for await(const chunk of req)body+=chunk;const packet=JSON.parse(body);report.requests.push({model:packet.model,messageCount:packet.messages?.length});
 res.writeHead(200,{'content-type':'text/event-stream','cache-control':'no-cache'});
 res.write('data: '+JSON.stringify({id:'held-local',object:'chat.completion.chunk',created:1,model:packet.model,choices:[{index:0,delta:{role:'assistant',content:'正在整理已确认的审批规则。'},finish_reason:null}]})+'\n\n');
 held.add(res);res.on('close',()=>held.delete(res));
});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const check=name=>{report.checks.push(name);console.log('PASS '+name);};let app,page;
const call=async request=>{const response=await page.evaluate(input=>window.pm.request(input),request);assert(response.ok,response.error);return response.data;};
const until=async(fn,predicate,timeout=20000)=>{const end=Date.now()+timeout;while(Date.now()<end){const value=await fn();if(predicate(value))return value;await new Promise(resolve=>setTimeout(resolve,100));}throw Error('UI_WAIT_EXCEEDED');};
async function capture(name,width,height=800){
 await page.setViewportSize({width,height});await page.evaluate(()=>document.fonts.ready);await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 const metric=await page.locator('.composer-bottom').evaluate(node=>{
  const rect=element=>{const r=element.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom};};
  return{viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio,scrollWidth:document.documentElement.scrollWidth},toolbar:rect(node),toolbarOverflow:node.scrollWidth>node.clientWidth+1,controls:[...node.querySelectorAll('button')].map(button=>({name:button.getAttribute('aria-label')||button.textContent,rect:rect(button)})),sources:rect(node.querySelector('.composer-source-controls')),task:rect(node.querySelector('.composer-task-controls')),send:rect(node.querySelector('.send'))};
 });
 assert.equal(metric.viewport.scrollWidth,metric.viewport.width);assert.equal(metric.toolbarOverflow,false);
 for(const {name,rect} of metric.controls){assert(rect.x>=metric.toolbar.x-1&&rect.right<=metric.toolbar.right+1,`${name}: ${JSON.stringify(metric)}`);assert(rect.bottom<=height+1);}
 assert(Math.abs(metric.send.right-metric.toolbar.right)<=5,JSON.stringify(metric));
 metric.name=name;report.metrics.push(metric);await page.screenshot({path:path.join(output,name+'.png'),scale:'css',animations:'disabled'});report.screenshots.push(name+'.png');
}
try{
 const env={...process.env,PM_SLASH_DATA_DIR:profile,PM_SLASH_TEST_HIDDEN:'1'};delete env.ELECTRON_RUN_AS_NODE;delete env.PM_SLASH_DEV_SERVER_URL;delete env.VITE_DEV_SERVER_URL;delete env.ELECTRON_RENDERER_URL;
 app=await electron.launch({cwd:repo,args:['.'],env,timeout:60000});page=await app.firstWindow();page.setDefaultTimeout(15000);page.on('pageerror',error=>report.pageErrors.push(error.message));await page.locator('.brand').waitFor();assert(page.url().startsWith('file:'));assert.equal(await app.evaluate(({app})=>app.getPath('userData')),profile);await page.emulateMedia({reducedMotion:'reduce'});
 await page.evaluate(()=>{localStorage.setItem('slash:theme','reference');localStorage.setItem('slash:details-open','false');});await page.reload();await page.locator('.brand').waitFor();
 const baseUrl=`http://127.0.0.1:${server.address().port}/v1`,models=[];
 for(const [name,modelId] of [['本机核对模型','plain-local'],['本机思考模型','thinking-local']])models.push(await call({type:'modelUpsert',model:{provider:'loopback',name,baseUrl,modelId,protocol:'openai-completions',supportsVision:false,contextWindow:65536,maxTokens:2048},key:'LOCAL-ONLY-KEY'}));
 await call({type:'modelDefault',id:models[1].id});await page.locator('.sidebar').getByRole('button',{name:'审批规则整理',exact:true}).click();await page.getByRole('button',{name:'思考强度',exact:true}).waitFor();
 const input=page.getByRole('textbox',{name:'描述你的任务'}),subagent=page.getByRole('switch',{name:'子 Agent',exact:true});await until(()=>subagent.isEnabled(),Boolean);
 if(await subagent.getAttribute('aria-checked')==='true'){await subagent.click();await until(()=>subagent.getAttribute('aria-checked'),value=>value==='false');}assert.equal(await subagent.locator('small').count(),0);await subagent.click();await until(()=>subagent.getAttribute('aria-checked'),value=>value==='true');assert.equal((await call({type:'subagentSettingsGet'})).enabled,true);await capture('desktop-thinking-subagent-on',1366,900);
 await subagent.focus();await page.keyboard.press('Space');await until(()=>subagent.getAttribute('aria-checked'),value=>value==='false');assert.equal((await call({type:'subagentSettingsGet'})).enabled,false);await capture('desktop-thinking-subagent-off',1366,900);await capture('narrow-thinking',680);await capture('mobile-thinking',390);
 await page.getByRole('button',{name:'思考强度',exact:true}).click();await page.getByRole('slider',{name:'思考强度'}).waitFor();await page.keyboard.press('Escape');await page.getByRole('button',{name:'选择模型',exact:true}).click();await page.getByRole('dialog',{name:'选择模型',exact:true}).getByRole('option',{name:/^本机核对模型/}).click();await page.getByRole('button',{name:'思考强度',exact:true}).waitFor({state:'hidden'});await capture('mobile-no-thinking',390);await capture('desktop-no-thinking',1366,900);
 await page.getByRole('button',{name:'模式',exact:true}).click();await page.getByRole('radio',{name:/^Plan/}).click();await page.getByRole('button',{name:'权限',exact:true}).click();await page.getByRole('radio',{name:/^完全访问/}).click();await page.getByRole('button',{name:'添加',exact:true}).click();await page.getByRole('dialog',{name:'添加',exact:true}).getByText('引用资料',{exact:true}).waitFor();await page.keyboard.press('Escape');await capture('desktop-plan-full-access',1366,900);
 await page.getByRole('button',{name:'模式',exact:true}).click();await page.getByRole('radio',{name:/^Build/}).click();check('真实桌面1366/680/390：按钮紧邻、发送固定右侧、思考显隐、子Agent点击与键盘状态、模式权限及附件菜单');
 await input.fill('请整理审批规则。');await page.getByRole('button',{name:'发送',exact:true}).click();await page.getByRole('button',{name:'停止任务',exact:true}).waitFor();const current=await until(()=>call({type:'state'}),value=>value.runs.some(run=>run.conversationId===cid&&run.status==='running'));const runId=current.runs.find(run=>run.conversationId===cid&&run.status==='running').id;await until(()=>report.requests.length,Boolean);
 await input.fill('第一条待处理要求');await input.press('Enter');await page.getByRole('region',{name:'待处理消息'}).waitFor();await input.fill('第二条待处理要求');await page.getByRole('button',{name:'加入队列',exact:true}).click();
 let state=await call({type:'state'}),run=state.runs.find(run=>run.id===runId);assert.deepEqual(run.inputs.map(input=>input.delivery),['follow_up','follow_up']);assert.deepEqual(run.inputs.map(input=>input.text),['第一条待处理要求','第二条待处理要求']);assert(!state.conversations.find(item=>item.id===cid).messages.some(message=>message.text==='第一条待处理要求'));assert.equal(await input.inputValue(),'');
 const queue=page.getByRole('region',{name:'待处理消息'});assert.equal(await queue.evaluate(node=>node.previousElementSibling.className),'conversation-head');assert.equal(await queue.evaluate(node=>node.nextElementSibling.className),'messages');await capture('desktop-running-queue',1366,900);
 await queue.locator('li').first().getByRole('button',{name:'编辑',exact:true}).click();await queue.getByLabel('编辑队列消息').fill('第一条修改后的要求');await queue.getByRole('button',{name:'保存修改',exact:true}).click();await queue.locator('li').nth(1).getByRole('button',{name:'取消',exact:true}).click();await until(()=>queue.locator('li').count(),value=>value===1);
 await queue.locator('li').first().getByRole('button',{name:'立即发出',exact:true}).click();await until(()=>call({type:'state'}),value=>value.runs.find(run=>run.id===runId).inputs[0].submittedAt);
 await input.fill('立即操作之后仍然排队');await input.press('Enter');await until(()=>queue.locator('li').count(),value=>value===2);state=await call({type:'state'});run=state.runs.find(run=>run.id===runId);assert.equal(run.inputs[0].delivery,'steer');assert.equal(run.inputs[0].text,'第一条修改后的要求');assert.equal(run.inputs[1].status,'cancelled');assert.equal(run.inputs[2].delivery,'follow_up');assert.equal(run.inputs[2].submittedAt,undefined);await capture('mobile-running-queue',390);await capture('narrow-running-queue',680);check('实际IPC与Pi：Enter/按钮默认follow_up，顶部队列按顺序显示且不冒充已发送；编辑取消和单条立即后下一条仍排队');
 await page.getByRole('button',{name:'停止任务',exact:true}).click();await page.getByRole('button',{name:'发送',exact:true}).waitFor();state=await call({type:'state'});run=state.runs.find(run=>run.id===runId);assert(run.inputs.every(input=>['cancelled','unknown','delivered'].includes(input.status)));assert.equal(run.inputs[2].status,'cancelled');const postCount=report.requests.length;await page.waitForTimeout(300);assert.equal(report.requests.length,postCount);await capture('narrow-stopped-queue',680);check('停止恢复发送，待发取消/结果不明保留原文，停止后无自动重发');
 const nextCid=await call({type:'conversation',title:'新的审批任务'});await page.setViewportSize({width:1366,height:900});await page.locator('.sidebar').getByRole('button',{name:'新的审批任务',exact:true}).click();assert.equal(await queue.count(),0);await input.fill('新的主任务');await page.getByRole('button',{name:'发送',exact:true}).click();await page.getByRole('button',{name:'停止任务',exact:true}).waitFor();await input.fill('新会话默认排队');await input.press('Enter');state=await call({type:'state'});const nextRun=state.runs.find(run=>run.conversationId===nextCid);assert.equal(nextRun.inputs[0].delivery,'follow_up');check('新会话沿用默认排队，不继承前一条立即操作');
 assert.deepEqual(report.pageErrors,[]);report.status='passed';
}catch(error){report.status='failed';report.error=String(error.stack||error);process.exitCode=1;await page?.screenshot({path:path.join(output,'failure.png'),scale:'css'}).catch(()=>{});}finally{await app?.close();for(const response of held)response.destroy();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await fs.writeFile(path.join(output,'result.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({status:report.status,output,error:report.error}));}
