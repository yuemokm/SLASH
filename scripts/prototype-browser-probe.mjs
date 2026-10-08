// Offline Electron feasibility probe; no app profile or prototype is modified.
import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import electronPath from 'electron';
const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
await fs.mkdir(path.join(repo,'.test-data'),{recursive:true});
const output=await fs.mkdtemp(path.join(repo,'.test-data','prototype-browser-probe-'));
async function probe(app,BrowserWindow,session,output){
 app.setPath('userData',output);app.setPath('sessionData',output);app.on('window-all-closed',()=>{});
 const fs=await import('node:fs/promises'),path=await import('node:path');
 const result={status:'failed',offline:true,checks:{}};let win,ses;
 try{
  await app.whenReady();ses=session.fromPartition('prototype-probe-'+Date.now(),{cache:false});
  await ses.setProxy({mode:'fixed_servers',proxyRules:'127.0.0.1:9',proxyBypassRules:'<-loopback>'});ses.enableNetworkEmulation({offline:true});
  ses.setPermissionRequestHandler((_w,_p,cb)=>cb(false));ses.setPermissionCheckHandler(()=>false);ses.setDevicePermissionHandler(()=>false);
  ses.on('will-download',event=>event.preventDefault());
  const origin='https://prototype-check.invalid';
  ses.protocol.handle('https',request=>new Response(request.url===origin+'/index.html'?'<!doctype html><meta charset="utf-8"><input id="f" maxlength="3" value="old"><input id="ro" readonly value="keep"><button id="go">Go</button><p id="r">0</p><script>document.querySelector("#go").onclick=e=>document.querySelector("#r").textContent=e.isTrusted?"native":"synthetic";document.querySelector("#f").oninput=e=>document.body.dataset.trusted=String(e.isTrusted);</script>':'',{status:request.url===origin+'/index.html'?200:403,headers:{'content-type':'text/html','Content-Security-Policy':"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'none'; frame-src 'none'; worker-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'"}}));
  ses.webRequest.onBeforeRequest({urls:['<all_urls>']},(details,callback)=>callback({cancel:details.url!==origin+'/index.html'}));
  win=new BrowserWindow({show:false,width:900,height:650,webPreferences:{session:ses,sandbox:true,contextIsolation:true,nodeIntegration:false,nodeIntegrationInWorker:false,nodeIntegrationInSubFrames:false,webviewTag:false,webSecurity:true,allowRunningInsecureContent:false,disableDialogs:true,devTools:false,backgroundThrottling:false}});
  const wc=win.webContents;wc.setWebRTCIPHandlingPolicy('disable_non_proxied_udp');wc.setWindowOpenHandler(()=>({action:'deny'}));
  for(const event of ['will-navigate','will-frame-navigate','will-redirect','will-attach-webview'])wc.on(event,e=>e.preventDefault());
  await win.loadURL(origin+'/index.html');result.checks.offlineProtocolLoaded=wc.getURL()===origin+'/index.html';
  wc.debugger.attach('1.3');
  await wc.executeJavaScriptInIsolatedWorld(1001,[{code:'document.querySelector("#f").focus();document.querySelector("#f").select();'}]);
  await wc.debugger.sendCommand('Input.insertText',{text:'abcdef'});
  result.checks.nativeFill=await wc.executeJavaScriptInIsolatedWorld(1001,[{code:'({value:document.querySelector("#f").value,trusted:document.body.dataset.trusted})'}]);
  await wc.executeJavaScriptInIsolatedWorld(1001,[{code:'document.querySelector("#ro").focus();document.querySelector("#ro").select();'}]);
  await wc.debugger.sendCommand('Input.insertText',{text:'changed'});
  result.checks.readonlyPreserved=await wc.executeJavaScriptInIsolatedWorld(1001,[{code:'document.querySelector("#ro").value==="keep"'}]);
  const rect=await wc.executeJavaScriptInIsolatedWorld(1001,[{code:'(()=>{const r=document.querySelector("#go").getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()'}]);
  await wc.debugger.sendCommand('Input.dispatchMouseEvent',{type:'mousePressed',...rect,button:'left',clickCount:1});
  await wc.debugger.sendCommand('Input.dispatchMouseEvent',{type:'mouseReleased',...rect,button:'left',clickCount:1});
  result.checks.nativeClick=await wc.executeJavaScriptInIsolatedWorld(1001,[{code:'document.querySelector("#r").textContent'}]);
  const png=(await wc.capturePage(undefined,{stayHidden:true})).toPNG();await fs.writeFile(path.join(output,'viewport.png'),png);
  result.checks.screenshotBytes=png.length;
  result.status=result.checks.offlineProtocolLoaded&&result.checks.nativeFill.value==='abc'&&result.checks.nativeFill.trusted==='true'&&result.checks.readonlyPreserved&&result.checks.nativeClick==='native'&&png.length>0?'passed':'failed';
 }catch(error){result.reason=String(error?.code??'ELECTRON_PROBE_FAILED');}
 finally{if(win&&!win.isDestroyed())win.destroy();if(ses){ses.protocol.unhandle('https');await ses.clearStorageData();await ses.clearCache();}await fs.writeFile(path.join(output,'result.json'),JSON.stringify(result,null,2));app.exit(result.status==='passed'?0:1);}
}
const harness=path.join(output,'harness.mjs');
await fs.writeFile(harness,"import {app,BrowserWindow,session} from 'electron';void ("+probe.toString()+")(app,BrowserWindow,session,"+JSON.stringify(output)+");");
const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
const code=await new Promise((resolve,reject)=>{const child=spawn(electronPath,[harness],{cwd:repo,env,windowsHide:true,stdio:'ignore'});const timer=setTimeout(()=>{child.kill();reject(Error('PROBE_TIMEOUT'));},20000);child.once('error',()=>{clearTimeout(timer);reject(Error('PROBE_START_FAILED'));});child.once('exit',value=>{clearTimeout(timer);resolve(value);});});
console.log(JSON.stringify({output,...JSON.parse(await fs.readFile(path.join(output,'result.json'),'utf8'))}));if(code!==0)process.exitCode=1;
