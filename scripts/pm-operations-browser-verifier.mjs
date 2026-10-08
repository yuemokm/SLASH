import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';

// Selectors are from the actual generated pending DOM read on 2026-10-06.
// Execute only against final applied output; no prototype mutation or injection.
const arg=name=>{const index=process.argv.indexOf(name);return index<0?undefined:process.argv[index+1];};
const diagnostic=process.argv.includes('--diagnostic');
const artifact=path.resolve(arg('--artifact')),applied=diagnostic?artifact:path.resolve(arg('--applied')),receipt=path.resolve(arg('--receipt')),out=path.resolve(arg('--out'));
const testRoot=path.resolve('.test-data');
for(const target of [artifact,applied,receipt,out]){const relative=path.relative(testRoot,target);assert.ok(relative&&!relative.startsWith('..')&&!path.isAbsolute(relative),'isolated paths required');}
const generation=JSON.parse(await fs.readFile(receipt,'utf8'));
const bytes=await fs.readFile(artifact),sha=b=>createHash('sha256').update(b).digest('hex'),before=sha(bytes);
if(diagnostic){const entry=generation.drafts?.find(item=>path.resolve(item.snapshot??'')===artifact);assert.ok(entry&&entry.appliedByHarness===false,'diagnostic must match saved unapplied draft receipt');assert.equal(entry.sha256,before);}
else{assert.equal(generation.run?.status,'succeeded','unfinished tasks cannot receive delivery verification');assert.ok(generation.finalArtifact,'successful applied artifact receipt is required');assert.equal(path.resolve(generation.finalArtifact.snapshot),artifact,'receipt must identify this final snapshot');assert.equal(path.resolve(generation.finalArtifact.path),applied,'receipt must identify this applied target');assert.equal(generation.finalArtifact.sha256,before,'receipt hash must match final snapshot');assert.equal(sha(await fs.readFile(applied)),before,'snapshot must match final applied artifact');}
await fs.mkdir(out,{recursive:true});
const result={status:'running',sourceState:diagnostic?'unapplied_pending_diagnostic':'applied',deliverable:!diagnostic,artifact,applied:diagnostic?undefined:applied,receipt,sha256:before,startedAt:new Date().toISOString(),checks:[],screenshots:[],layouts:[],blockedRequests:[],pageErrors:[],consoleErrors:[],notice:diagnostic?'Failed run pending draft only. Read-only diagnostic observations are not delivery acceptance, even when individual behavior works.':'Actual model-generated applied artifact, unchanged. Native browser actions and DOM assertions; offline synthetic business interaction only. Visual judgment is separate.'};
const server=http.createServer((req,res)=>{if(req.url!=='/index.html'){res.writeHead(404);res.end();return;}res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'});res.end(bytes);});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin=`http://127.0.0.1:${server.address().port}`;
let browser;
try{
 browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--disable-background-networking','--disable-component-update','--disable-sync','--no-first-run']});
 for(const viewport of [{width:390,height:844},{width:1440,height:900},{width:1280,height:800}]){
  const context=await browser.newContext({viewport,serviceWorkers:'block'}),tag=`${viewport.width}x${viewport.height}`;
  await context.route('**/*',route=>{const url=route.request().url();if(url===origin+'/index.html')return route.continue();result.blockedRequests.push({viewport:tag,url});return route.abort('blockedbyclient');});
  await context.routeWebSocket('**/*',socket=>{result.blockedRequests.push({viewport:tag,url:socket.url()});socket.close();});
  const page=await context.newPage();page.setDefaultTimeout(2200);page.on('pageerror',error=>result.pageErrors.push({viewport:tag,message:error.message}));page.on('console',message=>{if(message.type()==='error')result.consoleErrors.push({viewport:tag,message:message.text()});});
  const test=id=>page.locator(`[data-test="${id}"]`),rows=kind=>page.locator(`#list [data-test^="${kind}-row-"]`),markers=()=>page.locator('[data-test^="map-marker-"]');
  const screen=async name=>{await page.waitForFunction(()=>document.getAnimations().every(animation=>animation.playState!=='running'),{timeout:2200});const target=path.join(out,`${tag}-${name}.png`);await page.screenshot({path:target});result.screenshots.push({viewport:tag,name,path:target});};
  const check=async(id,action)=>{try{const detail=await action();result.checks.push({viewport:tag,id,status:detail?.observation==='unknown'?'unknown':'passed',detail});}catch(error){result.checks.push({viewport:tag,id,status:'failed',error:error.message});}};
  const reset=async()=>{await page.locator('#drawer-close').click().catch(()=>{});await page.locator('#reset-filters').click();await page.locator('#tab-stores').click();};
  const expectedCount=async(kind,n,total)=>{assert.equal(await rows(kind).count(),n);assert.equal((await test('result-count').innerText()).replace(/\s/g,''),`${n}/${total}`);};
  await page.goto(origin+'/index.html');await test('store-row-ST001').waitFor();await screen('initial');
  const geometry=await page.evaluate(()=>{
   const rect=selector=>{const node=document.querySelector(selector),r=node.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom};};
   return{viewport:{width:innerWidth,height:innerHeight},rootWidth:document.documentElement.scrollWidth,bodyWidth:document.body.scrollWidth,map:rect('.map-wrap'),workbench:rect('.workbench'),filters:rect('.filters'),filterScrollWidth:document.querySelector('.filters').scrollWidth,controls:['#region-filter','#status-filter','#search-input','#reset-filters'].map(selector=>({selector,...rect(selector)})),nav:rect('.nav'),list:rect('#list')};
  });result.layouts.push({viewport:tag,...geometry});
  await check('root-no-horizontal-overflow',()=>{assert.ok(geometry.rootWidth<=viewport.width+1);assert.ok(geometry.bodyWidth<=viewport.width+1);return geometry.rootWidth;});
  await check('all-search-filter-controls-fit',()=>{assert.ok(geometry.filterScrollWidth<=geometry.filters.width+1,'filter strip requires horizontal scrolling');for(const c of geometry.controls)assert.ok(c.x>=-1&&c.right<=viewport.width+1,`${c.selector} extends outside viewport`);return geometry.controls;});
  await check('map-workbench-layout',()=>{if(viewport.width>=1024){assert.ok(geometry.workbench.y>=geometry.map.bottom-2,'desktop workbench is beside map instead of beneath it');assert.ok(geometry.map.width>=viewport.width*.9,'desktop map must span the work area');}else{assert.ok(geometry.workbench.y>=geometry.map.bottom-2);assert.ok(geometry.nav.bottom<=viewport.height+1);}return{map:geometry.map,workbench:geometry.workbench};});
  await check('initial-six-records-and-synthetic-map',async()=>{await expectedCount('store',6,6);assert.equal(await markers().count(),6);assert.match(await page.locator('.map-note').innerText(),/离线示意地图.*合成数据/);});
  if(viewport.width===1280){await screen('compact-desktop');await context.close();continue;}
  await check('mobile-initial-touch-targets',async()=>{if(viewport.width>=1024)return 'mobile-only';const short=await page.locator('#region-filter,#status-filter,#reset-filters,#search-input,.task-link,.nav button,.store-mark').evaluateAll(nodes=>nodes.map(node=>({tag:node.tagName,id:node.id||node.getAttribute('data-test'),height:node.getBoundingClientRect().height,width:node.getBoundingClientRect().width})).filter(item=>item.height>0&&(item.height<44||item.width<44)));assert.deepEqual(short,[],'initial visible interactive targets must meet 44×44px');return short;});
  await check('map-list-bidirectional-selection',async()=>{
   await test('map-marker-ST006').locator('circle.base').click();assert.match(await test('store-row-ST006').getAttribute('class'),/selected/);assert.match(await test('map-marker-ST006').getAttribute('class'),/selected/);const visible=await test('store-row-ST006').evaluate(node=>{const r=node.getBoundingClientRect(),p=node.closest('#list').getBoundingClientRect();return r.top>=p.top-1&&r.bottom<=p.bottom+1;});assert.ok(visible,'selected store row must scroll into list view');
   await test('store-row-ST001').click();assert.match(await test('map-marker-ST001').getAttribute('class'),/selected/);assert.match(await test('store-row-ST001').innerText(),/青禾东区旗舰店/);assert.match(await test('store-row-ST001').innerText(),/待拜访/);await screen('selected');
  });
  await check('region-status-joint-filter-and-selection-clear',async()=>{
   await reset();await test('region-filter').selectOption('东区');await expectedCount('store',2,6);assert.equal(await markers().count(),2);
   await test('status-filter').selectOption('待拜访');await expectedCount('store',1,6);assert.equal(await markers().count(),1);assert.equal(await test('store-row-ST001').count(),1);assert.equal(await page.locator('.store-mark.selected').count(),0);
   await test('region-filter').selectOption('全部');await expectedCount('store',2,6);assert.equal(await markers().count(),2);await screen('filtered');
  });
  await check('search-no-result-reset-and-safe-text',async()=>{
   await reset();await test('search-input').fill('松石');await expectedCount('store',1,6);assert.equal(await test('store-row-ST003').count(),1);assert.equal(await markers().count(),1);
   await test('search-input').fill('NO-MATCH-999');await expectedCount('store',0,6);assert.equal(await markers().count(),0);assert.match(await test('empty-state').innerText(),/没有匹配|无结果/);await screen('no-results');
   await test('search-input').fill('<img src=x onerror=alert(1)>');assert.equal(await test('empty-state').locator('img').count(),0);assert.match(await test('empty-state').innerText(),/<img src=x/);
   await test('reset-filters').click();await expectedCount('store',6,6);assert.equal(await test('search-input').inputValue(),'');assert.equal(await test('region-filter').inputValue(),'全部');assert.equal(await test('status-filter').inputValue(),'全部');
  });
  await check('tabs-three-reps-three-tasks',async()=>{await reset();await test('tab-reps').click();await expectedCount('rep',3,3);await test('tab-tasks').click();await expectedCount('task',3,3);});
  await check('task-tab-associated-filters-and-search',async()=>{await reset();await test('region-filter').selectOption('东区');await test('status-filter').selectOption('待拜访');await test('tab-tasks').click();await expectedCount('task',1,3);assert.equal(await test('task-row-TASK01').count(),1);await test('search-input').fill('陈列巡检');await expectedCount('task',1,3);await test('search-input').fill('NO-MATCH-999');await expectedCount('task',0,3);});
  await check('rep-tab-associated-status-filter',async()=>{await reset();await test('status-filter').selectOption('跟进中');await test('tab-reps').click();await expectedCount('rep',1,3);assert.equal(await test('rep-row-REP02').count(),1);return 'Both follow-up stores are assigned REP02; status must affect reps';});
  await check('rep-tab-associated-region-status-joint-filter',async()=>{await reset();await test('region-filter').selectOption('东区');await test('tab-reps').click();await expectedCount('rep',2,3);assert.equal(await test('rep-row-REP01').count(),1);assert.equal(await test('rep-row-REP02').count(),1);assert.equal(await test('rep-row-REP03').count(),0);await test('status-filter').selectOption('待拜访');await expectedCount('rep',1,3);assert.equal(await test('rep-row-REP01').count(),1);assert.equal(await test('rep-row-REP02').count(),0);return 'East stores associate REP01 and REP02; East plus pending visit associates only REP01';});
  await check('store-task-entry-and-no-task-notice',async()=>{await reset();assert.match(await test('store-row-ST002').innerText(),/无关联任务/);await test('store-row-ST001').locator('[data-goto]').click();assert.match(await page.locator('#task-drawer.open').innerText(),/TASK01/);await test('drawer-close').click();assert.equal(await page.locator('#task-drawer.open').count(),0);});
  await check('task-detail-fields-close-and-escape',async()=>{
   await reset();await test('tab-tasks').click();await test('task-row-TASK01').click();const body=await page.locator('#drawer-body').innerText();for(const expected of ['TASK01','东区旗舰店陈列巡检','青禾东区旗舰店','东区','待执行','高','2026-10-07 10:00','核对促销物料','合成外勤林青'])assert.ok(body.includes(expected),`missing detail ${expected}`);await screen('detail');
   await page.keyboard.press('Escape');assert.equal(await page.locator('#task-drawer.open').count(),0);await test('task-row-TASK01').click();await test('drawer-close').click();assert.equal(await page.locator('#task-drawer.open').count(),0);
  });
  await check('unselected-assignee-validation-ui',async()=>{await test('task-row-TASK01').click();const originalAssignee=await page.locator('#cur-assignee').innerText(),values=await test('assignee-select').locator('option').evaluateAll(nodes=>nodes.map(node=>node.value));if(!values.includes(''))return{observation:'unknown',reason:'UI has no empty selection; cannot exercise missing-assignee validation with native controls. No option is injected.'};await test('assignee-select').selectOption('');await test('assign-confirm').click();assert.match(await test('feedback').innerText(),/先选择|请选择/);assert.equal(await page.locator('#cur-assignee').innerText(),originalAssignee,'invalid assignment must preserve current assignee');await screen('assignment-validation');await test('drawer-close').click();await test('task-row-TASK01').click();assert.equal(await test('assignee-select').inputValue(),'REP01');assert.equal(await page.locator('#cur-assignee').innerText(),originalAssignee);});
  await check('assignment-mutates-details-list-and-rep-counts',async()=>{
   await page.locator('#drawer-close').click();await test('task-row-TASK01').click();await test('assignee-select').selectOption('REP02');await test('assign-confirm').click();assert.match(await page.locator('#cur-assignee').innerText(),/合成外勤陈杉.*REP02/);assert.match(await test('feedback').innerText(),/已分配|成功/);await screen('assigned');
   await test('drawer-close').click();assert.match(await test('task-row-TASK01').innerText(),/合成外勤陈杉/);await test('task-row-TASK01').click();assert.equal(await test('assignee-select').inputValue(),'REP02');await test('assign-confirm').click();assert.match(await test('feedback').innerText(),/无变更|已是/);await test('drawer-close').click();await test('tab-reps').click();assert.match(await test('rep-row-REP01').innerText(),/关联任务\s*0/);assert.match(await test('rep-row-REP02').innerText(),/关联任务\s*2/);assert.match(await test('rep-row-REP03').innerText(),/关联任务\s*1/);await screen('rep-counts');
  });
  await check('mobile-navigation-and-touch-targets',async()=>{if(viewport.width>=1024)return 'mobile-only';await test('nav-tasks').click();await expectedCount('task',3,3);const short=await page.locator('#drawer-close,#region-filter,#status-filter,#reset-filters,#search-input,.task-link,.nav button,.store-mark').evaluateAll(nodes=>nodes.map(node=>({tag:node.tagName,id:node.id||node.getAttribute('data-test'),height:node.getBoundingClientRect().height,width:node.getBoundingClientRect().width})).filter(item=>item.height>0&&(item.height<44||item.width<44)));assert.deepEqual(short,[],'visible interactive targets must meet 44×44px');return short;});
  await context.close();
 }
 assert.equal(sha(await fs.readFile(artifact)),before);assert.equal(sha(await fs.readFile(applied)),before);result.artifactUnchanged=true;
 result.observationStatus=result.checks.some(c=>c.status==='failed')||result.pageErrors.length||result.consoleErrors.length||result.blockedRequests.length?'failed':'passed';result.status=diagnostic?'not_deliverable':result.observationStatus;
}catch(error){result.status='verifier_failed';result.error=error.message;}
finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));result.finishedAt=new Date().toISOString();await fs.writeFile(path.join(out,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({status:result.status,out,passed:result.checks.filter(c=>c.status==='passed').length,failed:result.checks.filter(c=>c.status==='failed').length,screenshots:result.screenshots.length,pageErrors:result.pageErrors.length}));}
