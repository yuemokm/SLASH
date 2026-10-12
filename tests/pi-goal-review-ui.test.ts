import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createServer} from 'vite';
import {chromium} from 'playwright';
test('real goal review detail defaults collapsed and hides stale candidate content',{timeout:60000},async t=>{
 const output=path.resolve('.test-data/pi-goal-production-20261012/ui');await fs.mkdir(output,{recursive:true});
 const server=await createServer({root:process.cwd(),configFile:false,cacheDir:path.join(output,'vite-cache'),logLevel:'error',server:{host:'127.0.0.1',port:0,watch:null,hmr:false}});t.after(()=>server.close());await server.listen();
 const browser=await chromium.launch({headless:true,...(process.platform==='win32'?{channel:'chrome'}:{})});t.after(()=>browser.close());const page=await browser.newPage(),errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto(new URL('/tests/fixtures/pi-goal-review-ui.html',server.resolvedUrls!.local[0]).href);const summary=page.locator('summary');await summary.waitFor();assert.match(await summary.innerText(),/有待核对/);assert.equal(await page.locator('details').getAttribute('open'),null);assert.equal(await page.getByText('保存顺序需要核对',{exact:true}).isVisible(),false);
 await summary.click();assert.equal(await page.getByText('保存顺序需要核对',{exact:true}).isVisible(),true);assert.match(await page.locator('body').innerText(),/50 tokens/);await page.screenshot({path:path.join(output,'candidate.png')});
 await page.evaluate(()=>(window as any).renderGoal('stale'));await page.getByText(/当前版本已失效/).waitFor();assert.equal(await page.getByText('保存顺序需要核对',{exact:true}).count(),0);assert.equal(await page.getByText('诊断说明',{exact:true}).count(),0);await page.screenshot({path:path.join(output,'stale.png')});assert.deepEqual(errors,[]);await fs.writeFile(path.join(output,'evidence.json'),JSON.stringify({status:'passed',realReactComponent:true,realElectron:false,cases:['collapsed-by-default','candidate-details','actual-usage','stale-hides-old-content'],errors},null,2));
});
