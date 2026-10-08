// Actual Electron DSL validation on a new file/profile copy; no Service, cloud or build.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
import electronPath from 'electron';
import {hostPrototypeCases} from './pm-business-prototype-cases.mjs';
const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const source=path.join(repo,'.test-data','pm-business-real-repair-XeeFst','workspace','成果','机会门店新建','index.html');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex'),original=await fs.readFile(source),sourceHash=sha(original);
const output=await fs.mkdtemp(path.join(repo,'.test-data','pm-business-prototype-cases-smoke-')),copy=path.join(output,'index.html'),profile=path.join(output,'profile');
await fs.mkdir(profile);await fs.writeFile(copy,original,{flag:'wx'});
const cases=hostPrototypeCases(),caseHash=sha(Buffer.from(JSON.stringify(cases))),modulePath=path.join(repo,'dist','main','prototype-browser.js');
async function smoke(app,cfg){
 app.setPath('userData',cfg.profile);app.setPath('sessionData',cfg.profile);app.on('window-all-closed',()=>{});
 const fs=await import('node:fs/promises'),path=await import('node:path'),{createHash}=await import('node:crypto');
 const hash=bytes=>createHash('sha256').update(bytes).digest('hex');let api;
 const report={status:'starting',cloudExecuted:false,projectBuild:false,sourcePath:cfg.source,sourceHash:cfg.sourceHash,copy:cfg.copy,caseHash:cfg.caseHash,caseCount:cfg.cases.length,totalSteps:cfg.cases.reduce((n,c)=>n+c.steps.length,0),startedAt:new Date().toISOString()};
 try{
  await app.whenReady();api=await import(cfg.moduleURL);const bytes=await fs.readFile(cfg.copy);
  const result=await api.runPrototypeAcceptance({entryPath:'index.html',snapshot:new Map([['index.html',{bytes,hash:hash(bytes)}]]),cases:cfg.cases});
  report.prototypeStatus=result.status;report.cases=result.cases;report.notice=result.notice;
  for(const item of result.screenshots)await fs.writeFile(path.join(cfg.output,item.caseId+'.png'),item.bytes,{flag:'wx'});
  report.activeWindows=api.prototypeBrowserActiveCount();report.sourceUnchanged=hash(await fs.readFile(cfg.source))===cfg.sourceHash;report.copyUnchanged=hash(await fs.readFile(cfg.copy))===cfg.sourceHash;
  const expected=cfg.cases.map((_,i)=>i===7?'failed':'passed');
  const actual=result.cases.map(c=>c.status),location=result.cases[7];
  if(JSON.stringify(actual)!==JSON.stringify(expected)||location.steps.find(step=>step.status==='failed')?.observed!==true||result.status!=='failed'||report.activeWindows!==0||!report.sourceUnchanged||!report.copyUnchanged)throw Error('FIXED_HOST_CASE_VALIDATION_MISMATCH');
  report.status='expected_known_location_defect_detected';report.validationPassed=true;
 }catch(error){report.status='validation_failed';report.reason=String(error?.message??'HOST_CASE_SMOKE_FAILED');process.exitCode=1;}
 finally{api?.cancelAllPrototypeAcceptance();report.finishedAt=new Date().toISOString();await fs.writeFile(path.join(cfg.output,'report.json'),JSON.stringify(report,null,2));app.exit(process.exitCode??0);}
}
const cfg={source,sourceHash,copy,profile,output,cases,caseHash,moduleURL:pathToFileURL(modulePath).href};
const harness=path.join(output,'harness.mjs');await fs.writeFile(harness,"import {app} from 'electron';void ("+smoke.toString()+")(app,"+JSON.stringify(cfg)+");\n",{flag:'wx'});
await fs.writeFile(path.join(output,'manifest.json'),JSON.stringify({sourceHash,caseHash,runnerHash:sha(await fs.readFile(modulePath)),caseModuleHash:sha(await fs.readFile(path.join(repo,'scripts','pm-business-prototype-cases.mjs'))),output,profile,copy},null,2));
const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
const exitCode=await new Promise((resolve,reject)=>{const child=spawn(electronPath,[harness],{cwd:repo,env,windowsHide:true,stdio:'ignore'});const timeout=setTimeout(()=>{child.kill();reject(Error('HOST_CASE_SMOKE_TIMEOUT'));},90000);child.once('error',()=>{clearTimeout(timeout);reject(Error('HOST_CASE_SMOKE_START_FAILED'));});child.once('exit',code=>{clearTimeout(timeout);resolve(code);});});
const report=JSON.parse(await fs.readFile(path.join(output,'report.json'),'utf8'));
console.log(JSON.stringify({status:report.status,validationPassed:report.validationPassed,prototypeStatus:report.prototypeStatus,caseCount:report.caseCount,totalSteps:report.totalSteps,cases:report.cases?.map(c=>({id:c.caseId,status:c.status})),sourceUnchanged:report.sourceUnchanged,copyUnchanged:report.copyUnchanged,output}));
if(exitCode!==0||!report.validationPassed)process.exitCode=1;
