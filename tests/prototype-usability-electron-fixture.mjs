// Fixed host fixture, real production restricted Electron runner; no app build,
// model, Electron export mutation, supplied JS or real prototype writes.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {transform} from 'esbuild';
import electronPath from 'electron';
const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const output=await fs.mkdtemp(path.join(repo,'.test-data','prototype-usability-'));
const realPath=path.join(repo,'.test-data','duplicate-create-repair-proposal','case-DUPLICATE-CREATE','pending-1.html');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const runtimeHashes={};
for(const relative of ['main/prototype-browser.ts','main/prototype-browser-diagnostics.ts','main/prototype-usability.ts','shared/prototype-acceptance.ts']){
 const source=await fs.readFile(path.join(repo,relative),'utf8');runtimeHashes[relative]=sha(source);
 const target=path.join(output,'runtime',relative.replace(/\.ts$/,'.js'));await fs.mkdir(path.dirname(target),{recursive:true});
 await fs.writeFile(target,(await transform(source,{loader:'ts',target:'es2022',format:'esm'})).code,{flag:'wx'});
}
let requests=0;const server=createServer((_req,res)=>{requests++;res.end('must not reach');});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
async function fixture(app,output,moduleURL,helperURL,realPath,port){
 app.setPath('userData',output);app.setPath('sessionData',output);app.on('window-all-closed',()=>{});
 const fs=await import('node:fs/promises'),path=await import('node:path'),assert=(await import('node:assert/strict')).default,{createHash}=await import('node:crypto');
 const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
 const report={status:'running',cloudExecuted:false,projectBuild:false,checks:[],runs:[],limitations:['Only visible enabled native fields and text submit buttons; no aesthetic, hierarchy, labels, input value clipping, partial overlay or business correctness claim.','Offscreen controls have font/size/CSS clipping checked, but occlusion only in the current viewport. No scrolling/state exploration.','Mobile is explicitly enabled for this recorded replay; no site declaration grants mobile applicability.']};let api;
 try{
  await app.whenReady();api=await import(moduleURL);const {buildPrototypeUsabilityBaselineCases}=await import(helperURL);
  const baseline=buildPrototypeUsabilityBaselineCases({mobile:true});
  const page=body=>'<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{box-sizing:border-box}body{margin:0;padding:16px;font-family:Arial}input,select,textarea,button{font:14px Arial;width:180px;height:44px}form{display:grid;gap:12px}button{padding:8px}</style>'+body;
  const cases=steps=>baseline.map(item=>({...item,steps:steps??item.steps}));
  async function run(label,html,items=cases(),expected){
   const bytes=Buffer.from(html),entryHash=hash(bytes);
   const result=await api.runPrototypeAcceptance({entryPath:'index.html',snapshot:new Map([['index.html',{bytes,hash:entryHash}]]),cases:items});
   const images=[];for(let index=0;index<result.screenshots.length;index++){
    const image=result.screenshots[index],file=label+'-'+index+'.png';await fs.writeFile(path.join(output,file),image.bytes);
    images.push({file,caseId:image.caseId,contentHash:hash(image.bytes),capture:image.capture});
   }
   report.runs.push({label,entryHash,status:result.status,cases:result.cases,screenshots:images});
   if(expected)assert.equal(result.status,expected,label);assert.equal(api.prototypeBrowserActiveCount(),0);
   for(const item of items)assert.deepEqual(result.cases.find(c=>c.caseId===item.id).viewport,item.viewport);
   report.checks.push({name:label,status:'passed'});return result;
  }
  const good=page('<form><input value="PRIVATE_VALUE_73"><select><option>PRIVATE_OPTION_73</option></select><textarea>PRIVATE_TEXT_73</textarea><button>提交</button><input hidden style="height:1px"><input disabled style="height:1px"><input type="checkbox" style="width:12px;height:12px"><button type="button" style="width:16px;height:16px">×</button></form>');
  // Preserve the actual cold-start result independently; this does not relax
  // the production 3s phase timeout or relabel a timed-out case as passed.
  await run('cold-start-observation',good,cases());
  const healthy=await run('healthy-hidden-disabled-icon-excluded',good,cases(),'passed');
  assert.ok(healthy.cases.every(c=>c.steps[0].observed===true&&c.steps[0].usability.checked===4&&c.steps[0].usability.skipped===4));
  assert.ok(!JSON.stringify(healthy.cases).includes('PRIVATE_'));
  const broken=page('<form><input style="font-size:9px;height:18px" value="PRIVATE_INPUT_73"><div style="width:60px;height:22px;overflow:hidden"><input></div><button style="width:44px;white-space:nowrap;overflow:hidden">很长很长的提交按钮</button></form>');
  const defects=await run('small-font-small-target-clipping',broken,cases(),'failed');
  const allIssues=defects.cases.flatMap(c=>c.steps[0].usability.issues),codes=new Set(allIssues.map(i=>i.code));
  for(const code of ['CONTROL_FONT_TOO_SMALL','CONTROL_TARGET_TOO_SMALL','CONTROL_CLIPPED','BUTTON_TEXT_CLIPPED'])assert.ok(codes.has(code),code);
  assert.ok(!JSON.stringify(defects.cases).includes('PRIVATE_'));
  const selectors=[...new Set(allIssues.map(issue=>issue.selector))];
  await run('returned-selectors-uniquely-match-original-controls',broken,cases(selectors.map(selector=>({action:'assert',assertion:'visible',selector,expected:true}))),'passed');
  const covered=page('<form><input id="covered"></form><div style="position:fixed;inset:0;background:white;z-index:10"></div>');
  const overlay=await run('fully-obscured-control',covered,cases(),'failed');
  assert.ok(overlay.cases.every(c=>c.steps[0].usability.issues.some(i=>i.code==='CONTROL_FULLY_OBSCURED'&&i.measurements.hitSamples===0)));
  await run('below-fold-normal-control',page('<form style="margin-top:1500px"><input><button>提交</button></form>'),cases(),'passed');
  await run('scrollable-long-form-is-not-permanent-clipping',page('<div style="overflow:auto;height:80px;width:240px"><form><input><div style="height:200px"></div><input><button>提交</button></form></div>'),cases(),'passed');
  await run('subpixel-size-rounding-accepted',page('<form><input style="height:31.82px"><button style="height:43.82px">提交</button></form>'),cases(),'passed');
  await run('no-applicable-controls-unknown',page('<button type="button" style="width:12px;height:12px">×</button><input disabled>'),cases(),'unknown');
  const limited=await run('candidate-limit-retains-issues-unknown',page('<form><input style="height:10px">'+'<input>'.repeat(81)+'</form>'),cases(),'unknown');
  assert.ok(limited.cases.every(c=>!c.steps[0].usability.complete&&c.steps[0].usability.issues.length>0&&c.steps[0].reason==='PROTOTYPE_USABILITY_LIMIT'));
  const manyNodes=await run('element-traversal-limit-unknown',page('<div>'+'<span></span>'.repeat(2100)+'</div><input>'),cases(),'unknown');
  assert.ok(manyNodes.cases.every(c=>!c.steps[0].usability.complete));
  await run('blocked-network',page('<form><input><button>提交</button></form><img src="http://127.0.0.1:'+port+'/private">'),cases(),'unknown');
  const actual=await fs.readFile(realPath);report.realSource={path:realPath,hash:hash(actual),bytes:actual.length};
  // Replay the actual existing entry state; do not rewrite its business flow.
  const real=await run('actual-old-prototype-entry',actual,cases());
  report.realObservation={status:real.status,issues:real.cases.map(c=>({viewport:c.viewport,status:c.status,usability:c.steps[0].usability,reason:c.steps[0].reason})),knownLimit:'The four-line status/hierarchy and source annotations are outside this deterministic control scope. No claim that the user-rated visual problems are solved.'};
  report.realSource.unchanged=hash(await fs.readFile(realPath))===report.realSource.hash;assert.ok(report.realSource.unchanged);
  assert.equal(api.prototypeBrowserActiveCount(),0);report.status='passed';
 }catch(error){report.status='failed';report.reason=String(error?.message??'USABILITY_FIXTURE_FAILED');process.exitCode=1;}
 finally{api?.cancelAllPrototypeAcceptance();await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));app.exit(process.exitCode??0);}
}
const harness=path.join(output,'harness.mjs');
await fs.writeFile(harness,"import {app} from 'electron';void ("+fixture.toString()+")(app,"+JSON.stringify(output)+","+JSON.stringify(pathToFileURL(path.join(output,'runtime','main','prototype-browser.js')).href)+","+JSON.stringify(pathToFileURL(path.join(output,'runtime','main','prototype-usability.js')).href)+","+JSON.stringify(realPath)+","+server.address().port+");");
const env={...process.env};for(const key of ['ELECTRON_RUN_AS_NODE','PM_SLASH_DEV_SERVER_URL','VITE_DEV_SERVER_URL','ELECTRON_RENDERER_URL'])delete env[key];
try{
 const code=await new Promise((resolve,reject)=>{
  const child=spawn(electronPath,[harness],{cwd:repo,env,windowsHide:true,stdio:'ignore'});
  const timer=setTimeout(()=>{child.kill();reject(Error('USABILITY_FIXTURE_PARENT_TIMEOUT'));},120000);
  child.once('error',()=>{clearTimeout(timer);reject(Error('USABILITY_FIXTURE_START_FAILED'));});child.once('exit',value=>{clearTimeout(timer);resolve(value);});
 });
 const report=JSON.parse(await fs.readFile(path.join(output,'report.json'),'utf8'));report.loopbackRequests=requests;report.runtimeHashes=runtimeHashes;
 if(requests)report.status='failed';await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));
 console.log(JSON.stringify({status:report.status,checks:report.checks.length,loopbackRequests:requests,output,reason:report.reason,realObservation:report.realObservation?.status}));
 if(code!==0||report.status!=='passed')process.exitCode=1;
}finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
