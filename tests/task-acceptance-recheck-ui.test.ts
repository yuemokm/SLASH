import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'vite';
import {chromium} from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import {requestSchema} from '../shared/types.js';

test('host recheck IPC requires exact existing contract/report and excludes generation or verdict inputs',()=>{
 const input={type:'taskAcceptanceRecheck',runId:'run-1',expectedContractHash:'d'.repeat(64),expectedReportId:'report-1'};
 assert.deepEqual(requestSchema.parse(input),input);
 assert.equal(requestSchema.safeParse({...input,expectedReportId:null}).success,true);
 for(const bad of [{...input,expectedReportId:undefined},{...input,expectedContractHash:'old'},{...input,status:'passed'},{...input,prompt:'create again'},{...input,runId:'run\n2'}])assert.equal(requestSchema.safeParse(bad).success,false);
});

test('real recheck component locks active/queued requests and rejects responses for another run or report',{timeout:60000},async t=>{
 const output=path.resolve('.test-data/production-task-recheck-20261011/ui');await fs.mkdir(output,{recursive:true});
 const server=await createServer({root:process.cwd(),configFile:false,cacheDir:path.join(output,'vite-cache'),logLevel:'error',optimizeDeps:{noDiscovery:true,include:['react','react-dom/client','react/jsx-runtime','react/jsx-dev-runtime','zod']},server:{host:'127.0.0.1',port:0,watch:null,hmr:false}});t.after(()=>server.close());await server.listen();
 const browser=await chromium.launch({headless:true,...(process.platform==='win32'?{channel:'chrome'}:{})});t.after(()=>browser.close());const page=await browser.newPage({viewport:{width:1100,height:850}}),pageErrors:string[]=[];page.on('pageerror',e=>pageErrors.push(e.message));const evidence={status:'failed',realComponent:true,realElectronIPC:false,cases:[] as string[],pageErrors};const record=(name:string)=>{evidence.cases.push(name);t.diagnostic(name);};
 try{
  await page.goto(new URL('/tests/fixtures/run-recovery-ui.html',server.resolvedUrls!.local[0]).href);await page.getByLabel('核对结果').waitFor();
  await page.evaluate(()=>(window as any).renderRecheck('run-1','running'));const button=page.getByRole('button',{name:'重新运行自动检查',exact:true});await button.waitFor();assert.equal(await button.isDisabled(),true);assert.match(await page.locator('body').innerText(),/不调用付费模型/);record('活跃任务禁止重检，入口说明只自动检查并不重新生成成果');
  await page.evaluate(()=>{const s=window as any;s.renderRecheck();s.defer=true;});await button.click();await page.waitForFunction(()=>typeof (window as any).release==='function');assert.equal(await page.getByRole('button',{name:'正在运行自动检查…'}).isDisabled(),true);const request=await page.evaluate(()=>(window as any).requests.at(-1));assert.equal(request.type,'taskAcceptanceRecheck');assert.equal(request.expectedReportId,'report-1');assert.equal(request.expectedContractHash,'d'.repeat(64));assert.equal(requestSchema.safeParse(request).success,true);record('发送真实期望合同与报告，检查中锁定重复提交');
  await page.evaluate(()=>{const s=window as any;s.renderRecheck('run-2','succeeded','e'.repeat(64),'report-2','project-2');});await button.waitFor();await page.evaluate(()=>(window as any).release({}));assert.equal(await page.evaluate(()=>(window as any).recheckRefreshes??0),0);assert.equal(await page.getByText(/自动检查已更新/).count(),0);record('旧Run与项目的重检响应不会刷新新任务');
  await page.evaluate(()=>{const s=window as any;s.defer=true;s.release=undefined;});await button.click();await page.waitForFunction(()=>typeof (window as any).release==='function');await page.evaluate(()=>(window as any).renderRecheck('run-2','succeeded','e'.repeat(64),'report-3','project-2'));await button.waitFor();await page.evaluate(()=>(window as any).release({}));assert.equal(await page.evaluate(()=>(window as any).recheckRefreshes??0),0);record('同Run报告已更换时旧响应也不能改写当前记录');
  await button.click();await page.waitForFunction(()=>(window as any).recheckRefreshes===1);assert.match(await page.getByRole('status').innerText(),/业务与视觉仍需逐项核对/);assert.match(await page.getByRole('status').innerText(),/未决操作仍需单独核对/);record('成功仅刷新自动报告，业务视觉与未决操作不自动通过');
  await page.evaluate(()=>{const s=window as any;s.renderRecheck('run-3');s.failNext='TASK_ACCEPTANCE_RECHECK_STALE: 报告已变化，请刷新';});await button.click();await page.getByRole('alert').waitFor();assert.match(await page.getByRole('alert').innerText(),/STALE/);await page.getByRole('button',{name:'刷新当前检查记录'}).click();await page.waitForFunction(()=>(window as any).recheckRefreshes===2);assert.equal(await page.evaluate(()=>(window as any).requests.filter((r:any)=>r.type==='send'||r.type==='taskDeliveryReview').length),0);record('过期拒绝明确刷新，不发模型任务或保存人工核对');
  await page.evaluate(()=>(window as any).renderQualityWithoutReport());await button.waitFor();assert.equal(await button.isDisabled(),false);await button.click();await page.waitForFunction(()=>(window as any).requests.some((r:any)=>r.type==='taskAcceptanceRecheck'&&r.runId==='interrupted-before-first-report'));assert.equal(await page.evaluate(()=>(window as any).requests.filter((r:any)=>r.type==='taskAcceptanceRecheck').at(-1).expectedReportId),null);record('真实质量面板在可信合同已存在而无首报时，终态任务以null请求首次检查');
  await page.screenshot({path:path.join(output,'automatic-recheck.png'),fullPage:true});assert.deepEqual(pageErrors,[]);evidence.status='passed';
 }finally{await fs.writeFile(path.join(output,'result.json'),JSON.stringify(evidence,null,2));}
});
