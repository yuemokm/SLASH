import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import {chromium} from 'playwright';

// Independent review of one isolated, model-generated opportunity-store repair.
// First inspect the actual rendered controls. A reviewer may then supply a small
// selector map for this specific submission scenario; there are no assumed IDs,
// prototype rewrites, mocked responses or automatic PRD correctness scores.
const args=process.argv.slice(2);
const option=name=>{const i=args.indexOf(name);return i<0?undefined:args[i+1];};
const testRoot=path.resolve('.test-data');
const scoped=value=>{const absolute=path.resolve(value),relative=path.relative(testRoot,absolute);assert(relative&&!relative.startsWith('..')&&!path.isAbsolute(relative),'Review paths must remain inside .test-data');return absolute;};
const project=scoped(option('--project')||'.test-data/pm-business-real-2026-10-05T06-28-41-722Z/workspace/成果/机会门店新建');
const out=scoped(option('--out')||`.test-data/pm-business-repair-review-${Date.now()}`);
const entry=option('--entry')||'index.html';
assert(!entry.includes(':')&&!entry.startsWith('/')&&!entry.replaceAll('\\','/').split('/').includes('..'));
assert(!out.startsWith(project+path.sep),'Evidence must be outside the generated project');
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const files=new Map();let totalBytes=0,visited=0;
async function capture(relative='',depth=0){assert(depth<=8,'Project depth budget exceeded');for(const item of await fs.readdir(path.join(project,relative),{withFileTypes:true})){assert(++visited<=1000,'Project traversal budget exceeded');if(item.name.startsWith('.')||item.name==='node_modules')continue;const key=path.posix.join(relative,item.name),absolute=path.join(project,key),stat=await fs.lstat(absolute);assert(!stat.isSymbolicLink(),'Project links are unsupported');if(stat.isDirectory()){await capture(key,depth+1);continue;}assert(stat.isFile()&&files.size<100&&totalBytes+stat.size<=16*1024*1024,'Project read budget exceeded');const bytes=await fs.readFile(absolute);assert(bytes.length===stat.size&&totalBytes+bytes.length<=16*1024*1024,'Project changed or exceeded read budget');totalBytes+=bytes.length;files.set(key,{bytes,hash:digest(bytes)});}}
await capture();assert(files.has(entry),'HTML entry not captured');await fs.mkdir(out,{recursive:true});
const report={status:'inspection_only',project,entry,out,startedAt:new Date().toISOString(),browserProfile:path.join(out,'browser-profile'),manifest:[...files].map(([file,value])=>({path:file,hash:value.hash,bytes:value.bytes.length})),inputs:[],checks:[],screenshots:[],pageErrors:[],blockedRequests:[],manualDocumentReview:'pending: use numbered document evidence; no automatic correctness judgment',notice:'Actual generated files are unchanged. Native browser actions verify the explicit local simulation only; production services, original Office semantics and unresolved stage rules remain unverified.'};
const manifestPath=option('--manifest');
if(manifestPath){const manifest=JSON.parse(await fs.readFile(scoped(manifestPath),'utf8'));for(const source of manifest.sources??[]){const input=scoped(source.inputPath),hash=digest(await fs.readFile(input));report.inputs.push({path:input,hash,expectedHash:source.inputSha256,current:hash===source.inputSha256,locator:source.inputLocator});assert.equal(hash,source.inputSha256,'Model input evidence version changed');}}
for(const [name,value] of files)if(/\.md$/i.test(name))await fs.writeFile(path.join(out,path.basename(name)+'.numbered.txt'),value.bytes.toString('utf8').split(/\r?\n/).map((line,i)=>`${i+1}: ${line}`).join('\n'));
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.woff':'font/woff','.woff2':'font/woff2'};
const server=http.createServer((request,response)=>{let key;try{key=decodeURIComponent(new URL(request.url,'http://test.invalid').pathname).slice(1)||entry;}catch{response.writeHead(400).end();return;}const value=files.get(key),type=mime[path.extname(key).toLowerCase()];if(!value||!type||key.split('/').includes('..')){response.writeHead(404).end();return;}response.writeHead(200,{'Content-Type':type,'Cache-Control':'no-store','Content-Security-Policy':"connect-src 'none'; object-src 'none'; frame-src 'none'; form-action 'none'"});response.end(value.bytes);});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin=`http://127.0.0.1:${server.address().port}`;
let context;
try{
 context=await chromium.launchPersistentContext(report.browserProfile,{executablePath:option('--executable')||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,viewport:{width:420,height:900},serviceWorkers:'block',args:['--disable-background-networking','--disable-component-update','--disable-sync','--no-first-run']});
 await context.route('**/*',route=>{if(new URL(route.request().url()).origin===origin)return route.continue();report.blockedRequests.push(route.request().url());return route.abort('blockedbyclient');});
 await context.routeWebSocket('**/*',socket=>{report.blockedRequests.push(socket.url());socket.close();});
 context.on('page',page=>{if(page!==context.pages()[0])page.close().catch(()=>{});});
 const page=context.pages()[0]||await context.newPage();page.on('pageerror',error=>report.pageErrors.push(error.message));
 page.setDefaultTimeout(8000);await page.goto(`${origin}/${entry}`,{waitUntil:'domcontentloaded',timeout:30000});await page.waitForLoadState('domcontentloaded');
 const unique=async selector=>{assert(typeof selector==='string'&&selector.length<=200,'Use a bounded selector observed from the actual DOM');const locator=page.locator(selector);assert.equal(await locator.count(),1,`Ambiguous/missing observed control: ${selector}`);return locator;};
 const observe=async name=>{const controls=await page.locator('input,select,textarea,button,[role="button"],[role="radio"],a').evaluateAll(elements=>elements.map(element=>({tag:element.tagName,id:element.id,name:element.getAttribute('name'),type:element.getAttribute('type'),role:element.getAttribute('role'),label:element.getAttribute('aria-label')||Array.from(element.labels||[]).map(label=>label.textContent.trim()).join(' ')||element.closest('.field')?.querySelector('label')?.textContent?.trim()||element.textContent?.trim().slice(0,160),readonly:element.readOnly,disabled:element.disabled,value:element.value,options:element.tagName==='SELECT'?Array.from(element.options).map(option=>({value:option.value,label:option.textContent})):undefined})));await fs.writeFile(path.join(out,name+'.controls.json'),JSON.stringify(controls,null,2));await fs.writeFile(path.join(out,name+'.dom.html'),await page.locator('body').evaluate(element=>element.outerHTML));const image=path.join(out,name+'.png');await page.screenshot({path:image,fullPage:true});report.screenshots.push(image);return controls;};
 await observe('01-entry');
 if(args.includes('--inspect-form')){await(await unique(option('--source'))).click();await(await unique(option('--next'))).click();await observe('02-form');}
 const mappingPath=option('--map');
 if(mappingPath){
  const map=JSON.parse(await fs.readFile(scoped(mappingPath),'utf8'));
  // This is a single business scenario, not an executable arbitrary-step DSL.
  if(map.source)await(await unique(map.source)).click();if(map.next)await(await unique(map.next)).click();
  const name=await unique(map.name),detail=await unique(map.detail),submit=await unique(map.submit);
  await name.waitFor({state:'visible'});await observe('02-form');
  const setScenario=async choice=>{assert(choice&&typeof choice.selector==='string');const control=await unique(choice.selector);if(choice.value!==undefined){assert.equal(await control.evaluate(element=>element.tagName),'SELECT');await control.selectOption(String(choice.value));}else await control.click();};
  const check=async(id,action)=>{try{report.checks.push({id,status:'pass',detail:await action()});}catch(error){report.checks.push({id,status:'fail',detail:error.message});}};
  await check('name-maxlength-50',async()=>{assert.equal(await name.getAttribute('maxlength'),'50');await name.focus();await page.keyboard.press('Control+A');await page.keyboard.insertText('验'.repeat(51));assert.equal((await name.inputValue()).length,50);return{attempted:51,accepted:50};});
  const verifyReadonly=async(selector,text)=>{const control=await unique(selector);assert(await control.isVisible());assert.equal(await control.evaluate(element=>element.readOnly),true);const before=await control.inputValue();await control.focus();await page.keyboard.press('Control+A');await page.keyboard.insertText(text);assert.equal(await control.inputValue(),before);return{before,editBlocked:true};};
  if(map.code)await check('code-readonly',()=>verifyReadonly(map.code,'试图改写编码'));
  if(map.location)await check('location-readonly',()=>verifyReadonly(map.location,'试图改写定位地址'));
  await check('detail-editable',async()=>{assert(await detail.isEditable());await detail.fill('详细地址编辑回归');assert.equal(await detail.inputValue(),'详细地址编辑回归');return{nativeEdit:true};});
  if(map.nameError)await check('corrected-input-clears-error-without-resubmit',async()=>{await name.fill('');await detail.fill('');await submit.click();await page.locator(map.nameError).waitFor({state:'visible'});if(map.dismissValidation)await(await unique(map.dismissValidation)).click();await name.fill('修正必填错误');await page.locator(map.nameError).waitFor({state:'hidden',timeout:1500});return{clearedOnInput:true,extraSubmit:false};});
  const values={name:'独立验收门店（本地模拟）',detail:'四川省成都市武侯区天府三街288号二楼（修订验收）'};
  await setScenario(map.failureMode);await name.fill(values.name);if(map.locate)await(await unique(map.locate)).click();
  if(map.locationError){await page.waitForTimeout(100);const located={value:await(await unique(map.location)).inputValue(),buttonText:await(await unique(map.locate)).innerText(),errorVisible:await page.locator(map.locationError).isVisible(),extraSubmit:false};report.checks.push({id:'located-address-clears-old-error-without-resubmit',status:located.value&&!located.errorVisible?'pass':'fail',detail:located});
   if(map.detailError){const automaticDetail={value:await detail.inputValue(),errorVisible:await page.locator(map.detailError).isVisible(),typedAfterLocate:false,extraSubmit:false};report.checks.push({id:'auto-filled-detail-clears-old-error-without-resubmit',status:automaticDetail.value&&!automaticDetail.errorVisible?'pass':'fail',detail:automaticDetail});}
   report.locatedFormObservation=await page.locator('.field').evaluateAll(fields=>fields.map(field=>({label:field.querySelector('label')?.textContent?.trim(),controls:Array.from(field.querySelectorAll('input,select,textarea')).map(control=>({id:control.id,value:control.value,readonly:control.readOnly})),visibleErrors:Array.from(field.querySelectorAll('.error-text')).filter(error=>getComputedStyle(error).display!=='none'&&error.getBoundingClientRect().height>0).map(error=>({id:error.id,text:error.textContent.trim()}))})));await(await unique(map.location)).scrollIntoViewIfNeeded();await observe('02a-location-after-correction');}
  await detail.fill(values.detail);if(map.phone)await(await unique(map.phone)).fill('13812345678');
  const failure=page.locator(map.failureResult);const beforeFailure={visible:await failure.isVisible().catch(()=>false),text:await failure.textContent().catch(()=>null)};
  assert(!beforeFailure.visible,'Failure evidence was already visible before submission');
  await submit.click();await failure.waitFor({state:'visible'});const failureText=(await failure.innerText()).trim();assert(typeof map.failureExpected==='string'&&map.failureExpected.length>0);assert(failureText.includes(map.failureExpected),'Expected submission-service failure was not observed');
  assert.equal(await name.inputValue(),values.name,'Failure lost the entered name');assert.equal(await detail.inputValue(),values.detail,'Failure lost the entered address');
  await observe('03-service-failure');report.checks.push({id:'service-failure-preserves-input',status:'pass',beforeFailure,failureText,valuesPreserved:true,mechanism:'actual scenario control, valid input, native submit'});
  if(map.serviceError){await check('corrected-input-clears-service-error-without-resubmit',async()=>{values.detail+='（输入已修正）';await detail.fill(values.detail);await page.locator(map.serviceError).waitFor({state:'hidden',timeout:1500});return{clearedOnInput:true,extraSubmit:false};});await submit.click();await failure.waitFor({state:'visible'});assert.equal(await detail.inputValue(),values.detail);}
  if(map.dismissFailure)await(await unique(map.dismissFailure)).click();
  await setScenario(map.successMode);assert.equal(await name.inputValue(),values.name);assert.equal(await detail.inputValue(),values.detail);await(await unique(map.retry||map.submit)).click();assert(typeof map.successExpected==='string'&&map.successExpected.length>0);await page.locator(map.successResult).filter({hasText:map.successExpected}).waitFor({state:'visible'});const success=await unique(map.successResult);const successText=(await success.innerText()).trim();assert(successText.includes(map.successExpected),'Successful retry result not observed');
  await observe('04-successful-retry');report.checks.push({id:'retry-success',status:'pass',successText,inputsReused:true});report.status=report.checks.some(check=>check.status==='fail')?'interaction_review_with_failures':'interaction_review_completed';
  if(map.exploratory){
   const freshForm=async()=>{await page.goto(`${origin}/${entry}`,{waitUntil:'domcontentloaded',timeout:30000});await(await unique(map.source)).click();await(await unique(map.next)).click();};
   const validInputs=async()=>{await(await unique(map.name)).fill(values.name);if(map.locate)await(await unique(map.locate)).click();await(await unique(map.detail)).fill(values.detail);if(map.phone)await(await unique(map.phone)).fill('13812345678');};
   await freshForm();await setScenario(map.failureMode);await(await unique(map.submit)).click();
   const emptyFailure={name:await(await unique(map.name)).inputValue(),detail:await(await unique(map.detail)).inputValue(),serviceVisible:await page.locator(map.failureResult).isVisible(),nameErrorVisible:await page.locator(map.nameError).isVisible()};
   report.checks.push({id:'empty-required-fields-validate-before-service-failure',status:!emptyFailure.serviceVisible&&emptyFailure.nameErrorVisible?'pass':'fail',detail:emptyFailure});if(emptyFailure.serviceVisible)await page.locator(map.failureResult).scrollIntoViewIfNeeded();else{if(map.dismissValidation&&await page.locator(map.dismissValidation).isVisible())await(await unique(map.dismissValidation)).click();await(await unique(map.name)).scrollIntoViewIfNeeded();}await observe('05-empty-required-service-failure');
   await freshForm();await validInputs();await(await unique(map.phone)).fill('123');await(await unique(map.submit)).click();await page.locator(map.phoneError).waitFor({state:'visible'});if(map.dismissValidation)await(await unique(map.dismissValidation)).click();await(await unique(map.phone)).fill('13812345678');await page.waitForTimeout(250);
   const phoneCorrected={value:await(await unique(map.phone)).inputValue(),errorVisible:await page.locator(map.phoneError).isVisible(),errorText:await page.locator(map.phoneError).textContent(),extraSubmit:false};
   report.checks.push({id:'corrected-phone-clears-error-without-resubmit',status:phoneCorrected.errorVisible?'fail':'pass',detail:phoneCorrected});await page.locator(map.phone).scrollIntoViewIfNeeded();await observe('06-corrected-phone-error');
   await freshForm();await validInputs();await setScenario(map.failureMode);await(await unique(map.backToIntro)).click();await(await unique(map.source)).click();await(await unique(map.next)).click();await validInputs();const visibleChecked=await(await unique(map.failureMode.selector)).isChecked();await(await unique(map.submit)).click();await page.waitForTimeout(250);
   const modeAfterReenter={visibleChecked,serviceFailureVisible:await page.locator(map.failureResult).isVisible(),serviceText:await page.locator(map.failureResult).textContent()};
   report.checks.push({id:'service-mode-matches-visible-control-after-reenter',status:visibleChecked===modeAfterReenter.serviceFailureVisible?'pass':'fail',detail:modeAfterReenter});if(modeAfterReenter.serviceFailureVisible)await page.locator(map.failureResult).scrollIntoViewIfNeeded();else await(await unique(map.failureMode.selector)).scrollIntoViewIfNeeded();await observe('07-reentered-service-mode');
   report.status=report.checks.some(check=>check.status==='fail')?'interaction_review_with_failures':'interaction_review_completed';
  }
 }
 assert.deepEqual(await page.evaluate(()=>({pm:typeof window.pm,require:typeof window.require,ipcRenderer:typeof window.ipcRenderer})),{pm:'undefined',require:'undefined',ipcRenderer:'undefined'});
 assert.equal(report.pageErrors.length,0,'Prototype page runtime errors observed');
}catch(error){report.status='failed';report.error=error.stack;process.exitCode=1;}
finally{
 if(context)await context.close();await new Promise(resolve=>server.close(resolve));
 report.artifactUnchanged=true;for(const [file,value] of files){const actual=digest(await fs.readFile(path.join(project,file)));if(actual!==value.hash){report.artifactUnchanged=false;report.status='failed';process.exitCode=1;}}
 report.finishedAt=new Date().toISOString();await fs.writeFile(path.join(out,'result.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({status:report.status,result:path.join(out,'result.json'),checks:report.checks,pageErrors:report.pageErrors,artifactUnchanged:report.artifactUnchanged},null,2));
}
