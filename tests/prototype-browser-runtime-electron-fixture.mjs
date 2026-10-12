// Real Electron, production source runner, isolated profile, no build/cloud.
// Optional --sfa uses the fixed immutable diagnosis copy, never the original.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
import electronPath from 'electron';
const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),sha=b=>createHash('sha256').update(b).digest('hex');
if(!process.versions.electron){
 const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;delete env.NODE_OPTIONS;
 const child=spawn(electronPath,[fileURLToPath(import.meta.url),...process.argv.slice(2)],{cwd:repo,env,windowsHide:true,stdio:['ignore','pipe','pipe']});
 child.stdout.on('data',b=>process.stdout.write(b));let stderr='';child.stderr.on('data',b=>{stderr=(stderr+b).slice(-2000);});
 process.exitCode=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',resolve);});if(process.exitCode)process.stderr.write(stderr);
}else{void run();}
async function run(){
 const {app}=await import('electron'),output=await fs.mkdtemp(path.join(repo,'.test-data','prototype-runtime-electron-')),profile=path.join(output,'profile');await fs.mkdir(profile);app.setPath('userData',profile);app.setPath('sessionData',profile);app.on('window-all-closed',()=>{});
 const compiled=process.argv.includes('--dist'),report={status:'running',cloudCalls:0,build:false,sourceRunner:!compiled,compiledRunner:compiled,output,checks:[]};let runner;
 try{
  await app.whenReady();if(compiled)runner=await import(pathToFileURL(path.join(repo,'dist/main/prototype-browser.js')).href);else{const {tsImport}=await import('tsx/esm/api');runner=await tsImport(pathToFileURL(path.join(repo,'main/prototype-browser.ts')).href,import.meta.url);}report.runnerVersion=runner.PROTOTYPE_BROWSER_VERSION;
  const testCase={id:'runtime',title:'真实按钮运行异常',steps:[{action:'click',selector:'#go'},{action:'assert',assertion:'text',selector:'#result',expected:'完成'}]};
  async function check(name,html,cases,expected,guard){const bytes=Buffer.isBuffer(html)?html:Buffer.from(html),snapshot=new Map([['QE12/index.html',{bytes,hash:sha(bytes)}]]),result=await runner.runPrototypeAcceptance({entryPath:'QE12/index.html',snapshot,cases,assertCurrent:guard});assert.equal(result.status,expected);assert.equal(runner.prototypeBrowserActiveCount(),0);report.checks.push({name,entryHash:sha(bytes),status:result.status,runnerVersion:result.runnerVersion,cases:result.cases,screenshotCount:result.screenshots.length});return result;}
  const body='<!doctype html><meta charset="utf-8"><button id="go">继续</button><p id="result">未完成</p>';
  const failing=await check('uncaught-dom-node-error',body+"<script>document.querySelector('#go').onclick=()=>{document.createTextNode('x').appendChild(document.createElement('div'));}</script>",[testCase],'unknown');
  const error=failing.cases[0].diagnostics.runtimeErrors.find(e=>e.category==='dom_node_operation_unsupported');assert.ok(error);assert.equal(error.errorType,'HierarchyRequestError');assert.equal(error.domMethod,'appendChild');assert.equal(error.phase,'step');assert.equal(error.stepIndex,0);assert.equal(error.locations[0].path,'QE12/index.html');assert.equal(failing.cases[0].steps[0].status,'unknown');assert.equal(failing.cases[0].steps[1].status,'not_run');assert.equal(failing.cases[0].diagnostics.stoppedPhase,'step');
  const privateError=await check('caught-error-and-private-console',body+"<script>document.querySelector('#go').onclick=()=>{try{document.createTextNode('x').appendChild(document.createElement('div'));}catch(e){console.error(e);console.error('PRIVATE_TOKEN_MUST_NOT_LEAK');}}</script>",[testCase],'unknown');assert.ok(privateError.cases[0].diagnostics.runtimeErrors.some(e=>e.category==='dom_node_operation_unsupported'));assert.doesNotMatch(JSON.stringify(privateError),/PRIVATE_TOKEN/);
  const success=await check('successful-action-compatible',body+"<script>document.querySelector('#go').onclick=()=>document.querySelector('#result').textContent='完成';</script>",[testCase],'passed');assert.equal(success.cases[0].diagnostics.runtimeErrors,undefined);
  if(process.argv.includes('--sfa')){
   const base=path.join(repo,'.test-data/actual-sfa-layout-20261009'),identity=JSON.parse(await fs.readFile(path.join(base,'fixed-identity.json'),'utf8')),bytes=await fs.readFile(path.join(base,'fixed.html')),cases=JSON.parse(await fs.readFile(path.join(base,'fixed-suite.json'),'utf8')).batches.flatMap(b=>b.cases).filter(c=>['fixed-visit-390','fixed-outside-390'].includes(c.id)),source='E:/code/slash test/成果/成果/原型/异动端SFA主要界面.html';assert.equal(sha(bytes),identity.candidateHash);assert.equal(sha(await fs.readFile(source)),identity.originalHash);
   for(const testcase of cases){const result=await check('actual-sfa-'+testcase.id,bytes,[testcase],'unknown');const c=result.cases[0],runtime=c.diagnostics.runtimeErrors.find(e=>e.domMethod==='appendChild');assert.ok(runtime);assert.equal(runtime.phase,'step');assert.equal(runtime.stepIndex,testcase.id==='fixed-visit-390'?5:2);assert.deepEqual(runtime.locations[0],{path:'QE12/index.html',line:697,column:281});assert.equal(c.steps[runtime.stepIndex].status,'unknown');assert.equal(c.diagnostics.stoppedPhase,'step');}
   assert.equal(sha(await fs.readFile(source)),identity.originalHash);report.originalProtected=true;
  }
  report.status='passed';report.activeBrowserCount=runner.prototypeBrowserActiveCount();
 }catch(error){report.status='failed';report.failure=error?.message?.slice(0,500);process.exitCode=1;}
 finally{await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({status:report.status,output,checks:report.checks.length,runnerVersion:report.runnerVersion}));app.exit(process.exitCode??0);}
}
