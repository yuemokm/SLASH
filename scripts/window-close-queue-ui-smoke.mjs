// Real window-close path, with persisted queue state and process diagnostics.
import {_electron as electron} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createServer} from 'node:http';
import {DatabaseSync} from 'node:sqlite';

const repo=process.cwd(),output=await fs.mkdtemp(path.join(repo,'.test-data','window-close-queue-')),profile=path.join(output,'profile'),diagnostic=path.join(output,'main-errors.jsonl');
await fs.cp(path.join(repo,'.test-data/composer-toolbar-queue-8EQOxg/profile'),profile,{recursive:true});
const report={status:'running',output,checks:[],cloudExecuted:false,productionProfileAccessed:false,mainErrors:[],dialogs:[],pageErrors:[],requests:0};
let response,app,page,closed=false;
const server=createServer(async(req,res)=>{
 if(req.method==='GET'){res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({id:'close-local'}));return;}
 let body='';for await(const chunk of req)body+=chunk;const packet=JSON.parse(body);report.requests++;response=res;
 res.writeHead(200,{'content-type':'text/event-stream'});res.write('data: '+JSON.stringify({id:'close-local',object:'chat.completion.chunk',created:1,model:packet.model,choices:[{index:0,delta:{role:'assistant',content:'正在核对资料。'},finish_reason:null}]})+'\n\n');
});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const call=async request=>{const value=await page.evaluate(request=>window.pm.request(request),request);assert(value.ok,value.error);return value.data;};
const until=async(fn,predicate,timeout=20000)=>{const end=Date.now()+timeout;while(Date.now()<end){const value=await fn();if(predicate(value))return value;await new Promise(resolve=>setTimeout(resolve,50));}throw Error('CLOSE_WAIT_EXCEEDED');};
try{
 const env={...process.env,PM_SLASH_DATA_DIR:profile,PM_SLASH_TEST_HIDDEN:'1'};delete env.ELECTRON_RUN_AS_NODE;delete env.PM_SLASH_DEV_SERVER_URL;delete env.VITE_DEV_SERVER_URL;delete env.ELECTRON_RENDERER_URL;
 app=await electron.launch({cwd:repo,args:['.'],env,timeout:60000});app.on('close',()=>{closed=true;});page=await app.firstWindow();page.setDefaultTimeout(15000);page.on('pageerror',error=>report.pageErrors.push(error.message));await page.locator('.brand').waitFor();
 await app.evaluate(({dialog},diagnostic)=>{const fs=process.getBuiltinModule('fs');const record=value=>fs.appendFileSync(diagnostic,JSON.stringify(value)+'\n');process.on('uncaughtExceptionMonitor',error=>record({type:'uncaught',message:error.stack||String(error)}));process.on('unhandledRejection',error=>record({type:'unhandled',message:error?.stack||String(error)}));dialog.showErrorBox=(title,content)=>record({type:'dialog',title,content});},diagnostic);
 const model=await call({type:'modelUpsert',model:{provider:'loopback-close',name:'退出核对模型',baseUrl:`http://127.0.0.1:${server.address().port}/v1`,modelId:'close-local',protocol:'openai-completions',hasKey:true,contextWindow:65536,maxTokens:2048},key:'LOCAL-CLOSE-ONLY-KEY'});await call({type:'modelDefault',id:model.id});
 const cid=await call({type:'conversation',title:'关闭活动队列核验'});await page.locator('.sidebar').getByRole('button',{name:'关闭活动队列核验',exact:true}).click();const input=page.getByRole('textbox',{name:'描述你的任务'});await input.fill('请核对资料，等待后续要求。');await page.getByRole('button',{name:'发送',exact:true}).click();await until(()=>report.requests,value=>value===1);
 await input.fill('关闭时仍未处理的原文');await input.press('Enter');const state=await until(()=>call({type:'state'}),state=>state.runs.some(run=>run.conversationId===cid&&run.inputs?.length));const run=state.runs.find(run=>run.conversationId===cid);assert.equal(run.inputs[0].status,'queued');assert.equal(run.inputs[0].submittedAt,undefined);await page.screenshot({path:path.join(output,'before-close.png'),scale:'css'});
 const processExit=new Promise(resolve=>app.process().once('exit',(code,signal)=>resolve({code,signal})));
 // This triggers BrowserWindow.closed, then window-all-closed and before-quit.
 await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].close()).catch(error=>{if(!/closed|destroyed/i.test(String(error)))throw error;});
 report.exit=await Promise.race([processExit,new Promise((_,reject)=>setTimeout(()=>reject(Error('NATURAL_EXIT_TIMEOUT')),15000))]);assert.equal(report.exit.code,0);assert.equal(report.exit.signal,null);closed=true;
 const errors=await fs.readFile(diagnostic,'utf8').catch(error=>{if(error.code==='ENOENT')return '';throw error;});report.mainErrors=errors.trim()?errors.trim().split('\n').map(line=>JSON.parse(line)):[];assert.deepEqual(report.mainErrors,[]);assert.deepEqual(report.pageErrors,[]);
 const db=new DatabaseSync(path.join(profile,'slash.sqlite'));try{const saved=JSON.parse(db.prepare("SELECT value FROM kv WHERE key='state'").get().value),closedRun=saved.runs.find(item=>item.id===run.id);assert.equal(closedRun.inputs[0].text,'关闭时仍未处理的原文');assert.equal(closedRun.inputs[0].status,'cancelled');assert.equal(closedRun.inputs[0].reason,'RUN_INPUT_RUN_ENDED');report.persistedInputs=closedRun.inputs;}finally{db.close();}
 assert.equal(report.requests,1);report.checks.push('真实流式任务与未送达队列关闭窗口后15秒内自然退出0，无uncaught/unhandled/error dialog','关闭清理真实写入cancelled/原文/原因；无第二次模型请求，重复dispose不写关闭数据库');report.status='passed';
}catch(error){report.status='failed';report.error=String(error.stack||error);process.exitCode=1;await page?.screenshot({path:path.join(output,'failure.png'),scale:'css'}).catch(()=>{});}finally{if(!closed)await app?.close();response?.destroy();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await fs.writeFile(path.join(output,'result.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({status:report.status,output,error:report.error}));}
