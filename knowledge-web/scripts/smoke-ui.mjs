import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),{chromium}=require('playwright');
const root=path.resolve(import.meta.dirname,'..'),output=path.join(root,'test-results',`ui-smoke-${new Date().toISOString().replaceAll(':','-').replaceAll('.','-')}`);
await mkdir(output,{recursive:true});
const evidence={fixture:true,cloudCalls:0,checks:[],errors:[]};
let child,browser,logs='';
const port=Number(process.env.KNOWLEDGE_SMOKE_PORT??3321),base=`http://127.0.0.1:${port}`;
try {
 child=spawn(process.execPath,[path.join(root,'node_modules/next/dist/bin/next'),'dev','--hostname','127.0.0.1','--port',String(port)],{cwd:root,env:{...process.env,KNOWLEDGE_LOCAL_FIXTURE:'true',VERCEL:'',NEXT_TELEMETRY_DISABLED:'1'},windowsHide:true,stdio:['ignore','pipe','pipe']});
 child.stdout.on('data',chunk=>logs+=chunk);child.stderr.on('data',chunk=>logs+=chunk);
 let ready=false;for(let i=0;i<90;i++){try{const response=await fetch(base);if(response.ok){ready=true;break;}}catch{}if(child.exitCode!==null)throw Error(`Next dev exited ${child.exitCode}`);await new Promise(resolve=>setTimeout(resolve,500));}assert.ok(ready,'fixture server ready');
 const channel=process.env.KNOWLEDGE_SMOKE_BROWSER_CHANNEL;
 browser=await chromium.launch({headless:true,...(channel?{channel}:{})});const page=await browser.newPage({viewport:{width:1150,height:900}});
 page.on('pageerror',e=>evidence.errors.push(e.message));
 page.on('request',request=>{if(!request.url().startsWith(base)&&!request.url().startsWith('data:'))evidence.cloudCalls++;});
 await page.goto(base);await page.getByRole('button',{name:'进入本地演示'}).click();await page.getByLabel('你想了解什么？').fill('门店两种地址分别由谁维护？');await page.getByRole('button',{name:'查找答案 →'}).click();await page.getByText('本地演示：门店定位地址只读；图商地址可由管理员修改。').waitFor();evidence.checks.push('input → answer');
 await page.getByText('查看 1 处资料来源').click();await page.getByRole('link',{name:'1. 演示门店规则'}).click();await page.getByLabel('来源原文').waitFor();assert.match(await page.getByLabel('来源原文').innerText(),/演示第1版/);evidence.checks.push('authorized clickable source and version');
 await page.getByRole('button',{name:'有帮助',exact:true}).click();await page.getByRole('status').filter({hasText:'演示反馈已接收'}).waitFor();evidence.checks.push('explicit fixture feedback');
 await page.screenshot({path:path.join(output,'desktop.png'),fullPage:true});
 await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:path.join(output,'mobile.png'),fullPage:true});evidence.checks.push('mobile 390px no horizontal overflow');
 await page.getByLabel('你想了解什么？').fill('差旅补贴是多少？');await page.getByRole('button',{name:'查找答案 →'}).click();await page.getByText('当前资料没有依据',{exact:true}).waitFor();assert.equal(await page.getByText('查看 1 处资料来源').count(),0);evidence.checks.push('no evidence → insufficient without citation');
 await page.getByLabel('你想了解什么？').fill('地址？');await page.getByRole('button',{name:'查找答案 →'}).click();await page.getByText('本地演示：门店定位地址只读；图商地址可由管理员修改。').waitFor();
 let releaseSource;const heldSource=new Promise(resolve=>releaseSource=resolve);let sourceStarted;const sourceReady=new Promise(resolve=>sourceStarted=resolve);
 await page.route('**/api/sources/**',async route=>{const response=await route.fetch();sourceStarted();await heldSource;await route.fulfill({response});});
 await page.getByRole('button',{name:'查看引用演示门店规则'}).click();await sourceReady;await page.getByRole('button',{name:'退出登录'}).click();releaseSource();await page.waitForTimeout(400);assert.equal(await page.getByLabel('来源原文').count(),0);evidence.checks.push('delayed source after logout does not reappear');await page.unroute('**/api/sources/**');
 await page.getByRole('button',{name:'进入本地演示'}).click();await page.getByLabel('你想了解什么？').fill('地址？');await page.getByRole('button',{name:'查找答案 →'}).click();await page.getByText('本地演示：门店定位地址只读；图商地址可由管理员修改。').waitFor();
 let releaseFeedback;const heldFeedback=new Promise(resolve=>releaseFeedback=resolve);let feedbackStarted;const feedbackReady=new Promise(resolve=>feedbackStarted=resolve);
 await page.route('**/api/feedback',async route=>{const response=await route.fetch();feedbackStarted();await heldFeedback;await route.fulfill({response});});
 await page.getByRole('button',{name:'有帮助',exact:true}).click();await feedbackReady;await page.getByRole('button',{name:'退出登录'}).click();releaseFeedback();await page.waitForTimeout(400);assert.equal(await page.getByText('演示反馈已接收（不存入云端）。',{exact:true}).count(),0);evidence.checks.push('delayed feedback after logout does not reappear');
 const unauthorized=await fetch(`${base}/api/sources/fixture-chunk?version=fixture-v1`,{headers:{authorization:'Bearer wrong'}});assert.equal(unauthorized.status,401);evidence.checks.push('source rechecks authentication');
 assert.equal(evidence.cloudCalls,0);assert.deepEqual(evidence.errors,[]);evidence.passed=true;
} catch(e) {evidence.passed=false;evidence.failure=String(e);process.exitCode=1;} finally {
 await browser?.close();if(child&&child.exitCode===null){if(process.platform==='win32'){await new Promise(resolve=>{const stop=spawn('taskkill',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});stop.on('close',resolve);});}else child.kill('SIGTERM');}
 await writeFile(path.join(output,'result.json'),JSON.stringify(evidence,null,2));await writeFile(path.join(output,'server.log'),logs);console.log(JSON.stringify(evidence,null,2));
}
