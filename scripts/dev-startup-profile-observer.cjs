// Diagnostic only: preload in the isolated Electron main process, never in a
// user's running app. CDP starts at window construction, before loadURL.
const fs=require('node:fs'),path=require('node:path');
setImmediate(()=>{
 if(!process.versions.electron||process.type!=='browser')return;
 const {app,BrowserWindow,session}=require('electron');
 const profile=process.env.PM_SLASH_DATA_DIR;
 const evidence={startedAt:new Date().toISOString(),pid:process.pid,profile,events:[],requests:[],errors:[],cloudRequests:[]};
 const file=path.join(profile,'startup-evidence.json'),requests=new Map();
 const mark=(name,details={})=>evidence.events.push({name,at:new Date().toISOString(),...details});
 const save=()=>{fs.mkdirSync(profile,{recursive:true});fs.writeFileSync(file,JSON.stringify(evidence,null,2));};
 let finished=false,busy=false,poll;
 const finish=async(ok,details)=>{
  if(finished)return;finished=true;clearInterval(poll);clearTimeout(deadline);
  if(ok){
   try{
    const win=BrowserWindow.getAllWindows()[0];
    await win.webContents.executeJavaScript('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
    fs.writeFileSync(path.join(profile,'workbench.png'),(await win.capturePage()).toPNG());
   }catch(error){ok=false;details='Rendered screenshot failed: '+String(error);}
  }
  evidence.status=ok?'passed':'failed';if(ok)evidence.ready=details;else evidence.errors.push(String(details));
  mark('diagnostic-complete');save();
  if(ok)app.quit();else app.exit(1);
 };
 const deadline=setTimeout(()=>void finish(false,'Diagnostic UI/IPC timeout after 180s'),180000);
 app.on('browser-window-created',(_event,win)=>{
  // Only this diagnostic's hidden profile: allow Chromium to paint the actual
  // workbench before capture, rather than retaining the loading-shell bitmap.
  win.webContents.setBackgroundThrottling(false);
  mark('browser-window-created');save();
  try{
   win.webContents.debugger.attach('1.3');
   const rendererMarker=`(() => {
    if(window.__slashStartupDiagnostic)return;
    const diagnostic=window.__slashStartupDiagnostic={installedAt:performance.now(),timeOrigin:performance.timeOrigin};
    const observe=()=>{if(diagnostic.firstReactAt===undefined&&document.querySelector('.brand')){diagnostic.firstReactAt=performance.now();observer.disconnect();}};
    const observer=new MutationObserver(observe);observer.observe(document,{childList:true,subtree:true});observe();
   })();`;
   win.webContents.debugger.on('message',(_event,method,p)=>{
    if(method==='Runtime.executionContextCreated'&&p.context.auxData?.isDefault){
     // addScript may race the first loadURL. The new default context event also
     // installs the marker, while this fresh document's module graph is loading.
     win.webContents.debugger.sendCommand('Runtime.evaluate',{expression:rendererMarker,contextId:p.context.id}).catch(()=>{});
    }else if(method==='Network.requestWillBeSent'){
     const item={id:p.requestId,url:p.request.url,method:p.request.method,type:p.type,initiator:p.initiator?.type,start:p.timestamp,wallTime:p.wallTime};requests.set(p.requestId,item);evidence.requests.push(item);
    }else if(method==='Network.responseReceived'){
     Object.assign(requests.get(p.requestId)??{},{responseAt:p.timestamp,status:p.response.status,mimeType:p.response.mimeType,fromDiskCache:p.response.fromDiskCache,fromServiceWorker:p.response.fromServiceWorker,timing:p.response.timing});
    }else if(method==='Network.loadingFinished')Object.assign(requests.get(p.requestId)??{},{end:p.timestamp,encodedDataLength:p.encodedDataLength});
    else if(method==='Network.loadingFailed')Object.assign(requests.get(p.requestId)??{},{end:p.timestamp,error:p.errorText,cancelled:p.canceled});
   });
   const debuggerApi=win.webContents.debugger;
   debuggerApi.sendCommand('Network.enable').catch(error=>evidence.errors.push('CDP Network: '+String(error)));
   debuggerApi.sendCommand('Page.enable').catch(error=>evidence.errors.push('CDP Page: '+String(error)));
   debuggerApi.sendCommand('Runtime.enable').catch(error=>evidence.errors.push('CDP Runtime: '+String(error)));
   debuggerApi.sendCommand('Page.addScriptToEvaluateOnNewDocument',{source:rendererMarker}).catch(error=>evidence.errors.push('CDP early renderer mark: '+String(error)));
  }catch(error){evidence.errors.push('CDP attach: '+String(error));}
  win.webContents.on('did-finish-load',()=>mark('did-finish-load'));
  win.webContents.on('did-fail-load',(_event,code,description)=>evidence.errors.push({code,description}));
  win.webContents.on('console-message',(_event,details)=>{if(details.level==='error')evidence.errors.push(details.message);});
  poll=setInterval(async()=>{
   if(finished||busy||win.isDestroyed())return;busy=true;
   try{
    const result=await win.webContents.executeJavaScript(`(async()=>{
     const visible=selector=>{const node=document.querySelector(selector);if(!node)return false;const box=node.getBoundingClientRect(),style=getComputedStyle(node);return box.width>0&&box.height>0&&style.display!=='none'&&style.visibility!=='hidden';};
     const startupShellAbsent=!document.getElementById('startup-status');
     const sidebarVisible=visible('.sidebar'),newSessionVisible=visible('.sidebar button.new');
     if(!startupShellAbsent||!sidebarVisible||!newSessionVisible||!window.pm?.request)return null;
     const ipcStartedAt=performance.now(),response=await window.pm.request({type:'state'}),ipcFinishedAt=performance.now();
     const nav=performance.getEntriesByType('navigation')[0];
     return {url:location.href,title:document.title,text:document.body.innerText,startupShellAbsent,sidebarVisible,newSessionVisible,ipcOk:response.ok,ipcStartedAt,ipcFinishedAt,timeOrigin:performance.timeOrigin,diagnostic:window.__slashStartupDiagnostic??null,navigation:nav?.toJSON(),resources:performance.getEntriesByType('resource').map(item=>item.toJSON())};
    })()`);
    if(result?.ipcOk){mark('react-and-diagnostic-state-ipc-observed');await finish(true,result);}
   }catch(error){if(!String(error).includes('destroyed'))evidence.lastProbeError=String(error);}
   finally{busy=false;}
  },50);
 });
 app.whenReady().then(()=>{
  mark('app-ready');evidence.actualProfile=app.getPath('userData');evidence.actualAppPath=app.getAppPath();save();
  session.defaultSession.webRequest.onBeforeRequest((details,callback)=>{
   const url=new URL(details.url),allow=!['http:','https:','ws:','wss:'].includes(url.protocol)||['localhost','127.0.0.1','[::1]'].includes(url.hostname);
   if(!allow)evidence.cloudRequests.push(url.origin);callback({cancel:!allow});
  });
 });
 app.on('will-quit',()=>{mark('will-quit');save();});
});
