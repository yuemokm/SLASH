import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'vite';
import {chromium} from 'playwright';
import path from 'node:path';
import fs from 'node:fs/promises';

test('recovery and trusted-login UI preserve explicit actions, scope and saved request fields',{timeout:90000},async t=>{
 const output=path.resolve('.test-data/production-g0-baseline-20261011/ui');await fs.mkdir(output,{recursive:true});
 const server=await createServer({root:process.cwd(),configFile:false,cacheDir:path.join(output,'vite-cache'),logLevel:'error',optimizeDeps:{noDiscovery:true,include:['react','react-dom/client','react/jsx-runtime','react/jsx-dev-runtime','zod']},server:{host:'127.0.0.1',port:0,watch:null,hmr:false}});await server.listen();
 t.after(()=>server.close());
 const browser=await chromium.launch({headless:true,...(process.platform==='win32'?{channel:'chrome'}:{})}),page=await browser.newPage({viewport:{width:1100,height:850}}),pageErrors:string[]=[];page.on('pageerror',error=>pageErrors.push(error.message));
 const url=new URL('/tests/fixtures/run-recovery-ui.html',server.resolvedUrls!.local[0]).href;
 t.after(()=>browser.close());
 const evidence={status:'failed' as 'failed'|'passed',realComponent:true,realElectronIPC:false,cloudExecuted:false,cases:[] as string[],screenshots:[] as string[]};
 const check=(name:string)=>{evidence.cases.push(name);t.diagnostic(name);};
 const screenshot=async(name:string)=>{const target=path.join(output,name+'.png');await page.screenshot({path:target,fullPage:true});evidence.screenshots.push(target);};
 try{
  await page.goto(url);await page.getByText('转换已授权副本为需求正文',{exact:true}).waitFor();
  const resume=page.getByRole('button',{name:'继续任务',exact:true}),save=page.getByRole('button',{name:'保存此操作的核对',exact:true});
  assert.equal(await resume.isDisabled(),true);assert.equal(await save.isDisabled(),true);
  await page.getByLabel('核对结果').selectOption('verified_done');await page.getByLabel('核对依据').fill('确认');assert.equal(await save.isDisabled(),true);
  await page.getByLabel('核对依据').fill('查看转换后的需求文件，内容完整且已保存。');await page.evaluate(()=>{(window as any).defer=true;});await save.click();
  await page.waitForFunction(()=>typeof (window as any).release==='function');assert.equal(await page.getByLabel('核对结果').isDisabled(),true);assert.equal(await page.getByLabel('核对依据').isDisabled(),true);assert.equal(await resume.isDisabled(),true);
  await screenshot('pending-confirmation');
  await page.evaluate(()=>{const state=window as any,request=state.requests.at(-1),record={...state.view().records[0],dispatch:'settled',resolution:request.resolution,resolvedBy:'user',evidenceRefs:['user:'+request.evidence],updatedAt:'2026-10-11T00:01:00Z'};state.release({record,view:{...state.view(),contextToken:'b'.repeat(64),blocked:false,records:[record]}});});
  await page.getByText('已确认完成',{exact:true}).waitFor();assert.equal(await resume.isEnabled(),true);assert.equal(await page.evaluate(()=>(window as any).resumes),0);await resume.click();assert.equal(await page.evaluate(()=>(window as any).resumes),1);
  check('核对结果/依据必填，提交锁定，保存不自动继续，独立按钮才继续');await screenshot('verified-result');
  await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth),true);await screenshot('verified-result-mobile');await page.setViewportSize({width:1100,height:850});check('手机宽度结果和依据可读，无水平溢出');

  await page.goto(url);await page.getByLabel('核对结果').waitFor();await page.getByLabel('核对结果').selectOption('verified_not_done');assert.match(await page.getByLabel('核对结果').innerText(),/未执行且未产生修改/);assert.match(await page.locator('body').innerText(),/只完成一部分/);
  await page.getByLabel('核对依据').fill('查看目标文件和操作记录，确认没有执行且没有任何修改。');await page.getByRole('button',{name:'保存此操作的核对',exact:true}).click();await page.getByText('已确认未执行且未产生修改',{exact:true}).waitFor();assert.equal(await page.evaluate(()=>(window as any).resumes),0);check('未执行选项排除部分完成，核对未执行也不自动重放');

  await page.goto(url);await page.getByLabel('核对结果').waitFor();await page.getByLabel('核对结果').selectOption('verified_done');await page.getByLabel('核对依据').fill('查看目标文件，确认转换结果已经保存。');await page.evaluate(()=>{(window as any).defer=true;});await page.getByRole('button',{name:'保存此操作的核对',exact:true}).click();await page.waitForFunction(()=>typeof (window as any).release==='function');
  await page.evaluate(()=>{const state=window as any;state.nextView={runId:'run-2',contextToken:'c'.repeat(64),blocked:false,records:[]};state.renderRecovery('project-2','run-2');});await page.waitForFunction(()=>!(document.querySelector('section[aria-label="停止任务的结果核对"]') as HTMLElement)?.getAttribute('aria-busy')?.includes('true'));
  await page.evaluate(async()=>{const state=window as any;state.release({view:{...state.view(),blocked:false}});await Promise.resolve();});assert.equal(await page.getByText('转换已授权副本为需求正文',{exact:true}).count(),0);assert.equal(await page.getByText('核对已保存。确认剩余操作后，可单独继续任务。',{exact:true}).count(),0);assert.equal(await page.evaluate(()=>(window as any).resumes),0);check('旧项目/Run的核对提交响应不写回新任务');

  await page.goto(url);await page.getByLabel('核对结果').waitFor();await page.evaluate(()=>{const state=window as any;state.defer=true;state.renderRecovery('deferred-project','run-1');});await page.waitForFunction(()=>typeof (window as any).release==='function');await page.evaluate(()=>{const state=window as any;state.nextView={runId:'run-2',contextToken:'d'.repeat(64),blocked:false,records:[]};state.renderRecovery('new-project','run-2');});await page.waitForFunction(()=>!(document.querySelector('section[aria-label="停止任务的结果核对"]') as HTMLElement)?.getAttribute('aria-busy')?.includes('true'));await page.evaluate(async()=>{const state=window as any;state.release(state.view());await Promise.resolve();});assert.equal(await page.getByText('转换已授权副本为需求正文',{exact:true}).count(),0);assert.equal(await page.getByRole('button',{name:'继续任务',exact:true}).isEnabled(),true);check('旧项目/Run的读取响应不覆盖新任务');
  await page.evaluate(()=>{const state=window as any;state.failNext='操作版本已变化，请重新查看';state.renderRecovery('error-project','run-2');});await page.getByRole('alert').filter({hasText:'版本已变化'}).waitFor();assert.equal(await page.getByRole('button',{name:'继续任务',exact:true}).isDisabled(),true);await page.getByRole('button',{name:'重新查看核对记录',exact:true}).click();await page.waitForFunction(()=>!(document.querySelector('section[aria-label="停止任务的结果核对"]') as HTMLElement)?.getAttribute('aria-busy')?.includes('true'));assert.equal(await page.getByRole('button',{name:'继续任务',exact:true}).isEnabled(),true);check('读取失败不放行继续，显式刷新后使用当前核对记录');

  await page.evaluate(()=>{(window as any).renderConnections();});await page.getByRole('button',{name:'编辑',exact:true}).click();await page.getByRole('dialog',{name:'编辑连接',exact:true}).waitFor();await page.getByText('高级设置',{exact:true}).click();
  const origins=page.getByLabel('允许的公司内网登录地址（可选）');assert.equal(await origins.inputValue(),'https://login.company.example');await origins.fill('https://login.company.example\nhttps://identity.company.example');await page.getByRole('button',{name:'保存连接',exact:true}).click();await page.getByRole('dialog',{name:'编辑连接',exact:true}).waitFor({state:'hidden'});const connection=await page.evaluate(()=>(window as any).requests.findLast((request:any)=>request.type==='connection').connection);assert.deepEqual(connection.mcpNetworkAllowedOrigins,['https://login.company.example','https://identity.company.example']);check('既有连接范围读回，编辑的两个origin实际进入保存请求');
  await page.getByRole('button',{name:'编辑',exact:true}).click();await page.getByText('高级设置',{exact:true}).click();await page.getByRole('textbox',{name:'服务地址',exact:true}).fill('https://other.company.example/mcp');assert.equal(await origins.inputValue(),'');await origins.fill('https://login.company.example/path');await page.getByRole('button',{name:'保存连接',exact:true}).click();await page.getByRole('dialog',{name:'编辑连接',exact:true}).getByRole('alert').filter({hasText:'不含路径'}).waitFor();await origins.fill(Array.from({length:17},(_,index)=>`https://login-${index}.company.example`).join('\n'));await page.getByRole('button',{name:'保存连接',exact:true}).click();await page.getByRole('dialog',{name:'编辑连接',exact:true}).getByRole('alert').filter({hasText:'最多 16 个'}).waitFor();await origins.fill('');await screenshot('company-login-origins');await page.getByRole('button',{name:'保存连接',exact:true}).click();await page.getByRole('dialog',{name:'编辑连接',exact:true}).waitFor({state:'hidden'});const cleared=await page.evaluate(()=>(window as any).requests.findLast((request:any)=>request.type==='connection').connection);assert.equal(cleared.mcpNetworkAllowedOrigins,undefined);check('更换URL清空范围，拒绝路径/超16项，清空后保存请求明确撤销旧范围');
  assert.deepEqual(pageErrors,[]);evidence.status='passed';
 }finally{await fs.writeFile(path.join(output,'result.json'),JSON.stringify({...evidence,pageErrors},null,2));}
});
