// Real offline Electron layout assertions; synthetic fixtures only, no dist build.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {transform} from 'esbuild';
import electronPath from 'electron';
const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const output=await fs.mkdtemp(path.join(repo,'.test-data','prototype-viewport-smoke-'));
const realPath=process.argv[2]?path.resolve(process.argv[2]):undefined;
for(const relative of ['main/prototype-browser.ts','shared/prototype-acceptance.ts']){
 const target=path.join(output,'runtime',relative.replace(/\.ts$/,'.js'));await fs.mkdir(path.dirname(target),{recursive:true});
 const compiled=await transform(await fs.readFile(path.join(repo,relative),'utf8'),{loader:'ts',target:'es2022',format:'esm'});await fs.writeFile(target,compiled.code,{flag:'wx'});
}
let requests=0;const server=createServer((_req,res)=>{requests++;res.end('blocked');});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
async function smoke(app,output,moduleURL,port,realPath){
 app.setPath('userData',output);app.setPath('sessionData',output);app.on('window-all-closed',()=>{});
 const fs=await import('node:fs/promises'),path=await import('node:path'),assert=(await import('node:assert/strict')).default,{createHash}=await import('node:crypto');
 const report={status:'running',cloudExecuted:false,projectBuild:false,checks:[],runs:[]};let api;
 try{
  await app.whenReady();api=await import(moduleURL);
  const snapshot=html=>new Map([['index.html',{bytes:Buffer.from(html),hash:createHash('sha256').update(html).digest('hex')}]]);
  const mobile={width:390,height:844},desktop={width:1440,height:900};
  const noOverflow=selector=>({action:'assert',assertion:'no-horizontal-overflow',...(selector?{selector}:{})});
  const size=(selector,minPixels)=>({action:'assert',assertion:'min-target-size',selector,...(minPixels?{minPixels}:{})});
  const testcase=(id,steps,viewport=mobile)=>({id,title:id,steps,...(viewport?{viewport}:{})});
  const page=body=>'<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{box-sizing:border-box}body{margin:0;font-family:Arial}button{font:inherit;padding:0}</style></head><body>'+body+'</body></html>';
  async function run(label,html,cases,expected){
   const result=await api.runPrototypeAcceptance({entryPath:'index.html',snapshot:snapshot(html),cases});
   report.runs.push({label,status:result.status,cases:result.cases,screenshots:result.screenshots.map(image=>({caseId:image.caseId,capture:image.capture,bytes:image.bytes.length,width:image.bytes.readUInt32BE(16),height:image.bytes.readUInt32BE(20)}))});
   for(let i=0;i<result.screenshots.length;i++)await fs.writeFile(path.join(output,label+'-'+i+'.png'),result.screenshots[i].bytes);
   assert.equal(result.status,expected,label);assert.equal(api.prototypeBrowserActiveCount(),0);
   for(const item of cases)if(item.viewport)assert.deepEqual(result.cases.find(c=>c.caseId===item.id).viewport,item.viewport);
   report.checks.push({name:label,status:'passed'});return result;
  }
  const filter=page('<div id="filters" style="display:flex;width:100%;gap:12px"><button style="flex:none;width:240px;height:44px">区域筛选</button><button style="flex:none;width:240px;height:44px">任务状态</button></div>');
  const overflow=await run('mobile-filter-overflow',filter,[testcase('page',[noOverflow()]),testcase('container',[noOverflow('#filters')])],'failed');
  assert.equal(overflow.cases[0].steps[0].observed,false);assert.equal(overflow.cases[0].steps[0].measurements.availableWidth,390);assert.ok(overflow.cases[0].steps[0].measurements.scrollWidth>390);
  assert.equal(overflow.cases[1].steps[0].observed,false);
  const small=await run('mobile-35px-button',page('<button id="assign" style="width:35px;height:35px">分配</button>'),[testcase('small',[size('#assign')]),testcase('explicit-35',[size('#assign',35)])],'failed');
  assert.equal(small.cases[0].steps[0].observed,false);assert.deepEqual(small.cases[0].steps[0].measurements,{width:35,height:35,minPixels:44});assert.equal(small.cases[1].status,'passed');
  const good=page('<div id="filters" style="display:flex;flex-wrap:wrap;gap:8px;max-width:100%"><button id="assign" style="width:44px;height:44px">分配</button><button style="width:150px;height:44px">区域</button></div><p id="result">未分配</p><script>document.querySelector("#assign").onclick=e=>document.querySelector("#result").textContent=e.isTrusted?"已分配":"不可信";</script>');
  const valid=await run('responsive-valid',good,[testcase('mobile',[noOverflow(),noOverflow('#filters'),size('#assign'),{action:'click',selector:'#assign'},{action:'assert',assertion:'text',selector:'#result',expected:'已分配'}]),testcase('desktop',[noOverflow(),size('#assign')],desktop)],'passed');
  assert.equal(valid.screenshots.length,2);
  // capturePage pixels follow the display scale; CSS viewport remains the
  // measured layout size. Both screenshot axes must use the same scale.
  for(const item of report.runs.at(-1).screenshots){const vp=item.caseId==='mobile'?mobile:desktop;assert.ok(Math.abs(item.height-item.width/vp.width*vp.height)<=2);}
  const wide=await run('same-file-viewports',page('<div style="width:640px;height:44px">固定宽度筛选</div>'),[testcase('mobile',[noOverflow()]),testcase('desktop',[noOverflow()],desktop)],'failed');assert.deepEqual(wide.cases.map(c=>c.status),['failed','passed']);
  const legacy=await run('legacy-viewport',page('<button id="ok" style="width:44px;height:44px">旧用例</button>'),[testcase('legacy',[{action:'assert',assertion:'visible',selector:'#ok',expected:true}],null)],'passed');assert.ok(legacy.cases[0].viewport.width>0);
  await run('blocked-network',page('<p id="ok">安全</p><img src="http://127.0.0.1:'+port+'/must-not-reach">'),[testcase('network',[noOverflow()])],'unknown');
  if(realPath){
   const bytes=await fs.readFile(realPath),hash=buffer=>createHash('sha256').update(buffer).digest('hex');report.realSource={path:realPath,hash:hash(bytes),bytes:bytes.length};
   const actual=await run('real-old-prototype',bytes.toString('utf8'),[testcase('real-filter',[noOverflow('.filters')]),testcase('real-marker',[size('.store-mark[data-test="marker-ST001"]')])],'failed');
   assert.deepEqual(actual.cases.map(item=>item.status),['failed','failed']);assert.equal(hash(await fs.readFile(realPath)),report.realSource.hash);report.realSource.unchanged=true;
  }
  report.status='passed';
 }catch(error){report.status='failed';report.reason=String(error?.message??'VIEWPORT_SMOKE_FAILED');process.exitCode=1;}
 finally{api?.cancelAllPrototypeAcceptance();await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));app.exit(process.exitCode??0);}
}
const harness=path.join(output,'harness.mjs');await fs.writeFile(harness,"import {app} from 'electron';void ("+smoke.toString()+")(app,"+JSON.stringify(output)+","+JSON.stringify(pathToFileURL(path.join(output,'runtime','main','prototype-browser.js')).href)+","+server.address().port+","+JSON.stringify(realPath??null)+");");
const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
try{
 const code=await new Promise((resolve,reject)=>{const child=spawn(electronPath,[harness],{cwd:repo,env,windowsHide:true,stdio:'ignore'});const timer=setTimeout(()=>{child.kill();reject(Error('VIEWPORT_SMOKE_PARENT_TIMEOUT'));},120000);child.once('error',()=>{clearTimeout(timer);reject(Error('VIEWPORT_SMOKE_START_FAILED'));});child.once('exit',value=>{clearTimeout(timer);resolve(value);});});
 const report=JSON.parse(await fs.readFile(path.join(output,'report.json'),'utf8'));report.loopbackRequests=requests;if(requests)report.status='failed';await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({status:report.status,checks:report.checks.length,loopbackRequests:requests,output,reason:report.reason}));if(code!==0||report.status!=='passed')process.exitCode=1;
}finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
