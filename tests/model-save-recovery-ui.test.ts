import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'vite';
import {chromium} from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

test('真实设置组件保存途中Escape保护，部分失败与抛错保留完整连接草稿',{timeout:90000},async t=>{
 const output=path.resolve('.test-data/model-save-recovery-20261013');await fs.mkdir(output,{recursive:true});
 const server=await createServer({root:process.cwd(),configFile:false,cacheDir:path.join(output,'vite-cache'),logLevel:'error',optimizeDeps:{noDiscovery:true,include:['react','react-dom','react-dom/client','react/jsx-runtime','react/jsx-dev-runtime','zod']},server:{host:'127.0.0.1',port:0,watch:null,hmr:false}});t.after(()=>server.close());await server.listen();
 const browser=await chromium.launch({headless:true,...(process.platform==='win32'?{channel:'chrome'}:{})});t.after(()=>browser.close());const page=await browser.newPage(),errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto(new URL('/tests/fixtures/model-save-recovery-ui.html',server.resolvedUrls!.local[0]).href);
 await page.getByRole('button',{name:'添加模型',exact:true}).click();const form=page.locator('.subdialog');
 await form.getByLabel('供应商名称',{exact:true}).fill('fixture');await form.getByLabel('API 地址',{exact:true}).fill('https://fixture.invalid/v1');await form.getByLabel('接口协议').selectOption('openai-responses');await form.locator('input[type=password]').fill('fixture-secret');
 await form.getByLabel('模型 ID 1',{exact:true}).fill('first');await form.getByRole('button',{name:'添加模型行',exact:true}).click();await form.getByLabel('模型 ID 2',{exact:true}).fill('second');
 await form.getByRole('button',{name:/^保存模型/}).click();await page.waitForFunction(()=>(window as any).requests.length===1);await page.keyboard.press('Escape');await page.keyboard.press('Escape');assert(await form.isVisible());assert.equal(await page.evaluate(()=>(window as any).fixtureClosed),undefined);
 await page.evaluate(()=>(window as any).resolveSave({items:[{modelId:'first',status:'added',id:'first-id'},{modelId:'second',status:'failed',error:'fixture write failure'}]}));await form.getByRole('button',{name:/^保存模型/}).waitFor();
 await form.getByText('保留失败项，可重试。',{exact:false}).waitFor();assert.equal(await form.getByLabel('模型 ID 1',{exact:true}).inputValue(),'second');assert.equal(await form.getByLabel('供应商名称',{exact:true}).inputValue(),'fixture');assert.equal(await form.getByLabel('API 地址',{exact:true}).inputValue(),'https://fixture.invalid/v1');assert.equal(await form.getByLabel('接口协议').inputValue(),'openai-responses');assert.equal(await form.locator('input[type=password]').inputValue(),'fixture-secret');
 await form.getByRole('button',{name:/^保存模型/}).click();await page.waitForFunction(()=>(window as any).requests.length===2);await page.keyboard.press('Escape');assert(await form.isVisible());
 const requests=await page.evaluate(()=>(window as any).requests);assert.deepEqual(requests[1].connection,requests[0].connection);assert.equal(requests[1].key,'fixture-secret');assert.deepEqual(requests[1].models,[{modelId:'second',name:'second'}]);
 await page.evaluate(()=>(window as any).rejectSave(Error('fixture IPC failure')));await form.getByText('fixture IPC failure',{exact:true}).waitFor();assert.equal(await form.locator('input[type=password]').inputValue(),'fixture-secret');
 await page.screenshot({path:path.join(output,'failure-draft-preserved.png')});await page.keyboard.press('Escape');await form.waitFor({state:'hidden'});assert.deepEqual(errors,[]);
 await fs.writeFile(path.join(output,'result.json'),JSON.stringify({status:'passed',checks:['busy Escape blocked','partial failure retains complete draft','retry uses same connection and secret','thrown IPC failure retains draft','idle Escape closes draft'],realComponent:true,realElectronIPC:false,errors},null,2));
});
