// Real Electron runner smoke, isolated temporary JS for these two TS modules.
// Never builds dist, sends a model request, or changes the generated HTML.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {transform} from 'esbuild';
import electronPath from 'electron';
const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const actualPath=path.join(repo,'.test-data','pm-business-real-2026-10-05T06-28-41-722Z','workspace','成果','机会门店新建','index.html');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const originalBytes=await fs.readFile(actualPath),originalHash=sha(originalBytes);
const output=await fs.mkdtemp(path.join(repo,'.test-data','prototype-browser-smoke-'));
const runtime=path.join(output,'runtime');
for(const relative of ['main/prototype-browser.ts','shared/prototype-acceptance.ts']){
 const target=path.join(runtime,relative.replace(/\.ts$/,'.js'));await fs.mkdir(path.dirname(target),{recursive:true});
 const compiled=await transform(await fs.readFile(path.join(repo,relative),'utf8'),{loader:'ts',target:'es2022',format:'esm',sourcemap:false});
 await fs.writeFile(target,compiled.code,{flag:'wx'});
}
let requests=0;
const server=createServer((_req,res)=>{requests++;res.end('must not be reached');});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const port=server.address().port;
async function smoke(app,output,moduleURL,actualPath,port){
 app.setPath('userData',output);app.setPath('sessionData',output);app.on('window-all-closed',()=>{});
 const fs=await import('node:fs/promises'),path=await import('node:path'),assert=(await import('node:assert/strict')).default,{createHash}=await import('node:crypto');
 const report={status:'running',cloudExecuted:false,projectBuild:false,checks:[],runs:[],sourcePath:actualPath};
 let api;
 try{
  await app.whenReady();api=await import(moduleURL);
  const snapshot=html=>new Map([['index.html',{bytes:Buffer.from(html),hash:createHash('sha256').update(html).digest('hex')}]]);
  const testcase=(id,steps)=>({id,title:id,steps});
  const visible=(selector,expected=true)=>({action:'assert',assertion:'visible',selector,expected});
  const text=(selector,expected,match='equals')=>({action:'assert',assertion:'text',selector,expected,match});
  const value=(selector,expected)=>({action:'assert',assertion:'value',selector,expected});
  const click=selector=>({action:'click',selector});
  const fill=(selector,value)=>({action:'fill',selector,value});
  const start=[click('[data-src="manual"]'),click('#nextBtn')];
  const actual=await fs.readFile(actualPath);
  report.sourceHash=createHash('sha256').update(actual).digest('hex');
  const actualCases=[
   testcase('actual-native-fields',[...start,{action:'assert',assertion:'readonly',selector:'input[data-ro="1"]',expected:true},{action:'assert',assertion:'readonly',selector:'#f_loc',expected:true},fill('#f_name','甲'.repeat(55)),value('#f_name','甲'.repeat(50)),fill('#f_detail','隔离原生输入地址'),value('#f_detail','隔离原生输入地址')]),
   testcase('actual-success',[...start,fill('#f_name','来源链隔离测试新门店'),click('#locBtn'),click('#submitBtn'),text('#topTitle','新增成功'),visible('#againBtn')]),
   testcase('actual-duplicate',[...start,fill('#f_name','惠优乐超市'),click('#locBtn'),click('#submitBtn'),text('#dialog','疑似重复门店','contains')]),
   testcase('actual-service-failure-missing',[...start,fill('#f_name','来源链隔离失败路径门店'),click('#locBtn'),click('#submitBtn'),text('#topTitle','新增成功'),visible('#serviceError')])
  ];
  async function run(label,input,expected){
   const result=await api.runPrototypeAcceptance(input);
   report.runs.push({label,status:result.status,cases:result.cases,notice:result.notice,screenshots:result.screenshots.map(item=>({caseId:item.caseId,bytes:item.bytes.length}))});
   for(let index=0;index<result.screenshots.length;index++)await fs.writeFile(path.join(output,label+'-'+index+'.png'),result.screenshots[index].bytes);
   assert.equal(result.status,expected,label);
   assert.equal(api.prototypeBrowserActiveCount(),0,label+' leaves no window');
   report.checks.push({name:label,status:'passed'});
   return result;
  }
  const real=await run('actual-model-html',{entryPath:'index.html',snapshot:new Map([['index.html',{bytes:actual,hash:report.sourceHash}]]),cases:actualCases},'failed');
  assert.deepEqual(real.cases.map(item=>item.status),['passed','passed','passed','failed']);
  assert.equal(real.cases[3].steps.at(-1).observed,false);
  const controls='<!doctype html><input id="f" maxlength="3"><input id="ro" readonly value="keep"><select id="s"><option disabled value="x">x</option><option value="a">a</option><option disabled value="skip">skip</option><option value="b">b</option></select><span id="trust">none</span><script>document.querySelector("#s").onchange=e=>document.querySelector("#trust").textContent=String(e.isTrusted);</script>';
  await run('native-select-disabled-option',{entryPath:'index.html',snapshot:snapshot(controls),cases:[testcase('native-inputs',[fill('#f','abcdef'),value('#f','abc'),{action:'select',selector:'#s',value:'b'},value('#s','b'),text('#trust','true'),{action:'assert',assertion:'readonly',selector:'#ro',expected:true}])]},'passed');
  const local='<!doctype html><span id="seen"></span><button id="save">save</button><script>document.querySelector("#seen").textContent=localStorage.getItem("sentinel")||"empty";document.querySelector("#save").onclick=()=>{localStorage.setItem("sentinel","written");document.querySelector("#seen").textContent="written";};</script>';
  await run('case-storage-isolation',{entryPath:'index.html',snapshot:snapshot(local),cases:[testcase('store',[click('#save'),text('#seen','written')]),testcase('clean-next-case',[text('#seen','empty')])]},'passed');
  const multi=new Map();for(const [name,html] of [['index.html','<!doctype html><a id="go" href="sub.html">next</a>'],['sub.html','<!doctype html><p id="sub">next page</p>']])multi.set(name,{bytes:Buffer.from(html),hash:createHash('sha256').update(html).digest('hex')});
  await run('snapshot-multi-page',{entryPath:'index.html',snapshot:multi,cases:[testcase('navigate',[click('#go'),{action:'assert',assertion:'url',expected:'sub.html'},text('#sub','next page')])]},'passed');
  await run('ambiguous-selector-unknown',{entryPath:'index.html',snapshot:snapshot('<!doctype html><span>one</span><span>two</span>'),cases:[testcase('ambiguous',[text('span','one')])]},'unknown');
  await run('missing-visible-assertion-failed',{entryPath:'index.html',snapshot:snapshot('<!doctype html><p>no error</p>'),cases:[testcase('missing-path',[visible('#error')])]},'failed');
  const unsafe='<!doctype html><p id="ok">yes</p><img src="http://127.0.0.1:'+port+'/private"><script>fetch("https://example.invalid/").catch(()=>{});window.open("http://127.0.0.1:'+port+'/new");</script>';
  await run('blocked-network-and-popup-unknown',{entryPath:'index.html',snapshot:snapshot(unsafe),cases:[testcase('blocked',[visible('#ok')])]},'unknown');
  await run('runtime-exception-unknown',{entryPath:'index.html',snapshot:snapshot('<!doctype html><p id="ok">yes</p><script>throw Error("synthetic runtime failure");</script>'),cases:[testcase('runtime',[visible('#ok')])]},'unknown');
  await run('malformed-resource-unknown',{entryPath:'index.html',snapshot:snapshot('<!doctype html><p id="ok">yes</p><img src="/%zz">'),cases:[testcase('malformed',[visible('#ok')])]},'unknown');
  const hanging=snapshot('<!doctype html><script>while(true){}</script>');
  const controller=new AbortController();
  const cancelTimer=setInterval(()=>{if(api.prototypeBrowserActiveCount()){clearInterval(cancelTimer);controller.abort();}},10);
  const aborted=await run('abort-cleanup',{entryPath:'index.html',snapshot:hanging,cases:[testcase('active',[visible('#x')]),testcase('never-started',[visible('#x')])],signal:controller.signal},'unknown');
  clearInterval(cancelTimer);assert.equal(aborted.cases[1].steps[0].status,'not_run');
  const cancelAllTimer=setInterval(()=>{if(api.prototypeBrowserActiveCount()){clearInterval(cancelAllTimer);api.cancelAllPrototypeAcceptance();}},10);
  await run('cancel-all-cleanup',{entryPath:'index.html',snapshot:hanging,cases:[testcase('active',[visible('#x')])]},'unknown');clearInterval(cancelAllTimer);
  await run('renderer-step-timeout-cleanup',{entryPath:'index.html',snapshot:hanging,cases:[testcase('hang',[visible('#x')])]},'unknown');
  let checks=0;
  await run('authorization-invalidated',{entryPath:'index.html',snapshot:snapshot('<!doctype html><p id="ok">yes</p>'),cases:[testcase('authorization',[visible('#ok')])],assertCurrent:()=>{if(++checks>4)throw Error('test mount revoked');}},'unknown');
  await assert.rejects(api.runPrototypeAcceptance({entryPath:'index.html',snapshot:new Map([['index.html',{bytes:Buffer.alloc(16*1024*1024+1),hash:'0'.repeat(64)}]]),cases:[testcase('limit',[visible('#ok')])]}),/PROTOTYPE_SNAPSHOT_HASH_OR_LIMIT/);
  report.checks.push({name:'snapshot-budget-rejected-before-renderer',status:'passed'});
  report.sourceUnchanged=createHash('sha256').update(await fs.readFile(actualPath)).digest('hex')===report.sourceHash;
  assert.equal(report.sourceUnchanged,true);assert.equal(api.prototypeBrowserActiveCount(),0);
  report.status='passed';
 }catch(error){report.status='failed';report.reason=String(error?.message??'PROTOTYPE_SMOKE_FAILED');process.exitCode=1;}
 finally{api?.cancelAllPrototypeAcceptance();await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));app.exit(process.exitCode??0);}
}
const harness=path.join(output,'harness.mjs'),moduleURL=pathToFileURL(path.join(runtime,'main','prototype-browser.js')).href;
await fs.writeFile(harness,"import {app} from 'electron';void ("+smoke.toString()+")(app,"+JSON.stringify(output)+","+JSON.stringify(moduleURL)+","+JSON.stringify(actualPath)+","+port+");");
const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
try{
 const code=await new Promise((resolve,reject)=>{const child=spawn(electronPath,[harness],{cwd:repo,env,windowsHide:true,stdio:'ignore'});const timer=setTimeout(()=>{child.kill();reject(Error('SMOKE_PARENT_TIMEOUT'));},120000);child.once('error',()=>{clearTimeout(timer);reject(Error('SMOKE_START_FAILED'));});child.once('exit',value=>{clearTimeout(timer);resolve(value);});});
 const report=JSON.parse(await fs.readFile(path.join(output,'report.json'),'utf8'));
 report.loopbackRequests=requests;report.realSourceUnchanged=sha(await fs.readFile(actualPath))===originalHash;report.runnerSourceHash=sha(await fs.readFile(path.join(repo,'main','prototype-browser.ts')));
 if(requests!==0||!report.realSourceUnchanged)report.status='failed';
 await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));
 console.log(JSON.stringify({status:report.status,checks:report.checks.length,loopbackRequests:requests,realSourceUnchanged:report.realSourceUnchanged,output,reason:report.reason}));if(code!==0||report.status!=='passed')process.exitCode=1;
}finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
