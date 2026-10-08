// Explicit synthetic fixtures. Uses compiled production IPC/browser runner and
// the real existing sandboxed preview; never builds dist or calls a model.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {_electron as electron} from 'playwright';
import {inspectQualityPrototype,hashBytes} from '../scripts/quality-prototype-inspect.mjs';
import {qualityPrototypeCases,qualityCodeProtectionStatus,prototypeRuntimeHashes,assertPrototypeRuntime} from '../scripts/quality-prototype-checks.mjs';
const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),output=await fs.mkdtemp(path.join(repo,'.test-data','quality-prototype-fixture-')),profile=path.join(output,'profile'),workspace=path.join(output,'workspace');
await fs.mkdir(profile);await fs.mkdir(workspace);const runtimeHashes=await prototypeRuntimeHashes(repo);
const report={status:'running',basis:'explicit_synthetic_fixtures_not_model_output',cloudExecuted:false,projectBuild:false,output,runtimeHashes,checks:[]};let app;
const bindings={schemaVersion:1,artifactHash:'a'.repeat(64),reviewed:true,entrySteps:[],code:{selector:'#code',mode:'display_text',representation:'allocated_demo',generatedNote:{selector:'#system',text:'系统生成'},allocationNote:{selector:'#demo',text:'模拟编码'}},name:{selector:'#name',hint:{selector:'#hint',text:'50'},boundary:'native_maxlength'},submit:'#submit',fillSteps:[],scenarios:{success:[],duplicate:[],failure:[]},feedback:{success:{selector:'#result',text:'创建成功'},duplicate:{selector:'#result',text:'重复'},failure:{selector:'#result',text:'服务失败'}},names:{success:'独立正常门店',duplicate:'独立重复门店',failure:'独立失败门店'}};
try{
 const env={...process.env,PM_SLASH_DATA_DIR:profile,PM_SLASH_TEST_HIDDEN:'1'};for(const key of ['ELECTRON_RUN_AS_NODE','PM_SLASH_DEV_SERVER_URL','VITE_DEV_SERVER_URL','ELECTRON_RENDERER_URL'])delete env[key];
 app=await electron.launch({cwd:repo,args:['.'],env,timeout:60000});const page=await app.firstWindow();await page.locator('.brand').waitFor();assert.equal(await app.evaluate(({app})=>app.getPath('userData')),profile);
 const call=async input=>{const response=await page.evaluate(input=>window.pm.request(input),input);if(!response.ok)throw Error('FIXTURE_OFFICIAL_IPC_FAILED');return response.data;};
 const deadline=Date.now()+45000;for(;;){try{await call({type:'workspace',path:workspace});break;}catch(error){if(Date.now()>=deadline)throw error;await new Promise(resolve=>setTimeout(resolve,500));}}
 const state=await call({type:'state'}),mount=state.mounts.find(m=>m.name==='成果');assert.ok(mount?.write);assert.equal(state.runs.length,0);
 async function fixture(name,html,cases,expected){
  const relative=name+'.html',file=path.join(mount.path,relative);await fs.writeFile(file,html);const target={mountId:mount.id,path:relative},hash=hashBytes(Buffer.from(html));
  await call({type:'prototypeAcceptanceSave',...target,mode:'build',title:'显式隔离fixture '+name,cases});const start=await call({type:'prototypeAcceptanceRun',...target,mode:'build'});let latest;
  const end=Date.now()+75000;while(Date.now()<end){const view=await call({type:'prototypeAcceptanceGet',...target});if(!view.activeRun&&view.latestReport?.evidence.executionId===start.executionId){latest=view.latestReport;break;}await new Promise(resolve=>setTimeout(resolve,100));}
  assert.ok(latest);assert.equal(latest.evidence.status,expected);assert.equal(latest.versionState,'current');assert.equal(hashBytes(await fs.readFile(file)),hash);
  const images=[];for(const image of latest.evidence.screenshots){const raw=await call({type:'prototypeAcceptanceScreenshot',reportId:latest.reportId,screenshotId:image.id}),bytes=Buffer.from(raw.dataUrl.split(',')[1],'base64');assert.equal(hashBytes(bytes),image.contentHash);const imagePath=path.join(output,name+'-'+image.caseId.replaceAll(':','_')+'.png');await fs.writeFile(imagePath,bytes);images.push({path:imagePath,hash:image.contentHash});}
  report.checks.push({name,status:'passed',observed:latest.evidence.status,report:latest,screenshots:images});return{target,hash};
 }
 const success=qualityPrototypeCases(bindings).find(c=>c.id==='benchmark:submit-success'),hidden='<!doctype html><input id="name" maxlength="50"><button id="submit">提交</button><p id="result" hidden>创建成功</p>';
 await fixture('old-hidden-text-false-positive',hidden,[{id:'old-text-only',title:'旧文本断言假阳性证据',steps:[{action:'assert',assertion:'text',selector:'#result',expected:'创建成功'}]}],'passed');
 await fixture('new-hidden-feedback-rejected',hidden,[success],'failed');
 await fixture('new-async-visible-feedback',hidden+'<script>document.querySelector("#submit").onclick=()=>setTimeout(()=>document.querySelector("#result").hidden=false,150);</script>',[success],'passed');
 await fixture('ambiguous-feedback-unknown',hidden.replace('<p id="result" hidden>','<p id="result">')+'<p id="result">创建成功</p>',[success],'unknown');
 const fullBindings={...bindings,scenarios:{success:[{action:'select',selector:'#scenario',value:'success'}],duplicate:[{action:'select',selector:'#scenario',value:'duplicate'}],failure:[{action:'select',selector:'#scenario',value:'failure'}]},followUps:{retry:{steps:[{action:'select',selector:'#scenario',value:'success'},{action:'click',selector:'#submit'}],feedback:{selector:'#result',text:'创建成功'}},duplicateView:{steps:[{action:'click',selector:'#view'}],feedback:{selector:'#detail',text:'重复门店详情'}}}};
 const tenCases=qualityPrototypeCases(fullBindings),totalSteps=tenCases.reduce((n,c)=>n+c.steps.length,0);assert.equal(tenCases.length,10);assert.ok(totalSteps<=100);assert.ok(tenCases.every(c=>c.steps.length<=20));
 const fullHtml='<!doctype html><meta charset="utf-8"><div id="code">JHWD0000000001</div><p id="system">系统生成</p><p id="demo">模拟编码</p><input id="name" maxlength="50"><p id="hint">50字符</p><select id="scenario"><option value="success">成功</option><option value="duplicate">重复</option><option value="failure">失败</option></select><button id="submit">提交</button><p id="result" hidden></p><button id="view" hidden>查看重复</button><p id="detail" hidden>重复门店详情</p><script>document.querySelector("#submit").onclick=()=>{const scenario=document.querySelector("#scenario").value,result=document.querySelector("#result");result.textContent={success:"创建成功",duplicate:"重复",failure:"服务失败"}[scenario];result.hidden=false;document.querySelector("#view").hidden=scenario!=="duplicate";};document.querySelector("#view").onclick=()=>document.querySelector("#detail").hidden=false;</script>';
 await fixture('eight-plus-two-budget-real-browser',fullHtml,tenCases,'passed');report.checks.at(-1).caseCount=tenCases.length;report.checks.at(-1).totalSteps=totalSteps;
 for(const editable of [true,false]){
  const html='<!doctype html><div id="code"'+(editable?' contenteditable="true"':'')+'>JHWD0000000001</div><p id="system">系统生成</p><p id="demo">模拟编码</p>',codeCase=qualityPrototypeCases(bindings)[0],current=await fixture(editable?'editable-code-dom':'static-code-dom',html,[codeCase],'passed');
  const inspection=await inspectQualityPrototype({page,call,target:current.target,artifactHash:current.hash,selectors:['#code']}),observation=inspection.selectorObservations[0],status=qualityCodeProtectionStatus('display_text',observation);assert.equal(observation.contentEditable,editable);assert.equal(status,editable?'failed':'passed');report.checks.push({name:editable?'editable-code-benchmark-rejected':'static-code-benchmark-accepted',status:'passed',observed:status,inspection});
 }
 assert.equal((await call({type:'state'})).runs.length,0);await assertPrototypeRuntime(repo,runtimeHashes);report.status='passed';
}catch(error){report.status='failed';report.reason=error.message;process.exitCode=1;}finally{await app?.close().catch(()=>{});await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({status:report.status,output,checks:report.checks.length,cloudExecuted:false,projectBuild:false}));}
