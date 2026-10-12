// Real Electron, current source runner, fresh profile, no model/build/user files.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
import electronPath from 'electron';

const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const sha=value=>createHash('sha256').update(value).digest('hex');
if(!process.versions.electron){
 const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;delete env.NODE_OPTIONS;
 const child=spawn(electronPath,[fileURLToPath(import.meta.url),...process.argv.slice(2)],{cwd:repo,env,windowsHide:true,stdio:['ignore','pipe','pipe']});
 child.stdout.on('data',bytes=>process.stdout.write(bytes));let stderr='';
 child.stderr.on('data',bytes=>{stderr=(stderr+bytes).slice(-3000);});
 const timer=setTimeout(()=>child.kill(),90000);
 process.exitCode=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',resolve);});
 clearTimeout(timer);if(process.exitCode)process.stderr.write(stderr);
}else{void run();}

async function run(){
 const {app}=await import('electron');
 const output=await fs.mkdtemp(path.join(repo,'.test-data/prototype-visibility-electron-'));
 const profile=path.join(output,'profile');await fs.mkdir(profile);
 app.setPath('userData',profile);app.setPath('sessionData',profile);app.on('window-all-closed',()=>{});
 const compiled=process.argv.includes('--dist');
 const report={status:'running',output,sourceRunner:!compiled,compiledRunner:compiled,cloudCalls:0,build:false,checks:[]};
 let runner;
 const visible=(selector,expected)=>({action:'assert',assertion:'visible',selector,expected});
 const click=selector=>({action:'click',selector});
 const count=(selector,expected)=>({action:'assert',assertion:'count',selector,expected});
 try{
  await app.whenReady();
  if(compiled)runner=await import(pathToFileURL(path.join(repo,'dist/main/prototype-browser.js')).href);
  else{const {tsImport}=await import('tsx/esm/api');runner=await tsImport(pathToFileURL(path.join(repo,'main/prototype-browser.ts')).href,import.meta.url);}
  report.runnerVersion=runner.PROTOTYPE_BROWSER_VERSION;
  async function check(name,html,testcase,expected='passed'){
   const bytes=Buffer.from(html),hash=sha(bytes);
   const result=await runner.runPrototypeAcceptance({entryPath:'index.html',snapshot:new Map([['index.html',{bytes,hash}]]),cases:[testcase]});
   const screenshots=[];
   for(let index=0;index<result.screenshots.length;index++){
    const image=result.screenshots[index],filename=name+'-'+index+'.png';
    await fs.writeFile(path.join(output,filename),image.bytes,{flag:'wx'});
    screenshots.push({filename,sha256:sha(image.bytes),bytes:image.bytes.length,viewport:result.cases[index]?.viewport,capture:image.capture});
   }
   report.checks.push({name,entryHash:hash,status:result.status,cases:result.cases,screenshots});
   assert.equal(result.status,expected,name);assert.equal(runner.prototypeBrowserActiveCount(),0);
   if(expected==='passed')assert(result.cases[0].steps.every(step=>step.status==='passed'),name);
   return result;
  }
  const html='<!doctype html><meta charset="utf-8"><details id="outer"><summary id="outer-summary">说明</summary><div id="body"><button id="inside">内部操作</button><details id="inner"><summary id="inner-summary">嵌套说明</summary><p id="inner-body">静态原文</p></details></div></details><p id="normal">普通内容</p>';
  const toggle=[count('#outer[open]',0),visible('#body',false),visible('#outer-summary',true),click('#outer-summary'),count('#outer[open]',1),visible('#body',true),click('#outer-summary'),count('#outer[open]',0),visible('#body',false),visible('#outer-summary',true),click('#outer-summary'),visible('#body',true)];
  for(const [width,height]of [[1440,900],[390,844]])await check('native-details-toggle-'+width,html,{id:'toggle-'+width,title:'原生说明关闭展开关闭再展开',viewport:{width,height},steps:toggle});
  await check('nested-details-retains-inner-open-state',html,{id:'nested',title:'嵌套原生说明与summary可见性',steps:[click('#outer-summary'),visible('#inner-summary',true),visible('#inner-body',false),click('#inner-summary'),visible('#inner-body',true),click('#outer-summary'),visible('#body',false),visible('#inner-body',false),visible('#inner-summary',false),visible('#outer-summary',true),click('#outer-summary'),count('#inner[open]',1),visible('#inner-body',true)]});
  await check('ordinary-hidden-and-visible-regressions',html+'<div style="display:none"><p id="display-hidden">隐藏</p></div><div style="visibility:hidden"><p id="visibility-hidden">隐藏</p><p id="visibility-override" style="visibility:visible">显示</p></div><div style="opacity:0"><p id="opacity-hidden">隐藏</p></div><p id="attribute-hidden" hidden>隐藏</p><div style="content-visibility:hidden"><p id="content-hidden">隐藏</p></div>',{id:'ordinary',title:'普通可见元素与CSS/原生隐藏元素',steps:[visible('#normal',true),visible('#display-hidden',false),visible('#visibility-hidden',false),visible('#visibility-override',true),visible('#opacity-hidden',false),visible('#attribute-hidden',false),visible('#content-hidden',false),visible('#absent',false)]});
  const denied=await check('closed-details-child-action-denied',html,{id:'denied',title:'关闭说明中的按钮不能操作',steps:[click('#inside'),visible('#normal',true)]},'failed');
  assert.equal(denied.cases[0].steps[0].reason,'PROTOTYPE_TARGET_HIDDEN');
  assert.equal(denied.cases[0].steps[1].status,'not_run');

  if(process.argv.includes('--qe12')){
  // Explicit local fixture replay; ordinary tests do not depend on untracked artifacts.
  const base=path.join(repo,'.test-data/qe12-astra-visual-continuation-20261010');
  const seed=path.join(base,'case-VISUAL-CONTINUATION/pending-1.html');
  const actual=await fs.readFile(seed,'utf8'),originalHash=sha(actual);
  assert.equal(originalHash,'7364956246b0c80a1cdd571df062719783fe86f4fd60b4730bb6913c4c17f7b9');
  const suite=JSON.parse(await fs.readFile(path.join(base,'suite-description-details-corrected.json'),'utf8'));
  for(const testcase of suite.cases)await check('actual-qe12-'+testcase.id,actual,testcase);
  for(const [width,height]of [[1440,900],[390,2160]])await check('expanded-notes-readable-'+width,actual,{id:'expanded-notes-'+width,title:'展开静态说明全文诊断截图',viewport:{width,height},steps:[click('[data-qe12-notes] > summary'),visible('[data-qe12-notes-body]',true)]});
  assert.equal(sha(await fs.readFile(seed)),originalHash);report.originalProtected=true;
  report.descriptionDetailsSupplement={cases:2,steps:30,notice:'New source-runner verification only. Historic failed 23/202 report remains failed; this does not verify all seven visual goals.'};
  report.expandedNotesScreenshotSupplement={cases:2,steps:4,viewports:[{width:1440,height:900},{width:390,height:2160}],notice:'Additional open-end captures for full description reading. Taller mobile diagnostic viewport does not replace official 390x844 toggle case or its expanded end screenshot; not two new features or visual approval.'};
  }
  report.status='passed';report.activeBrowserCount=runner.prototypeBrowserActiveCount();
 }catch(error){report.status='failed';report.failure=String(error?.message??error).slice(0,1000);process.exitCode=1;}
 finally{
  await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify({status:report.status,output,checks:report.checks.length,runnerVersion:report.runnerVersion,cloudCalls:0}));
  app.exit(process.exitCode??0);
 }
}
