import {app,BrowserWindow,session} from 'electron';
import {createHash,randomUUID} from 'node:crypto';
import path from 'node:path';
import {PrototypeCaseDiagnosticsRecorder,sanitizePrototypeRuntimeError} from './prototype-browser-diagnostics.js';
import {inspectPrototypeControlUsability} from './prototype-usability.js';
import {PROTOTYPE_ACCEPTANCE_LIMITS as LIMITS,PROTOTYPE_ACCEPTANCE_NOTICE,prototypeAcceptanceCaseSchema,type PrototypeAcceptanceCase,type PrototypeCaseResult,type PrototypeStepResult} from '../shared/prototype-acceptance.js';

export type PrototypeBrowserInput={entryPath:string;snapshot:ReadonlyMap<string,{bytes:Buffer;hash:string}>;cases:PrototypeAcceptanceCase[];signal?:AbortSignal;assertCurrent?:()=>void};
export type PrototypeBrowserResult={status:'passed'|'failed'|'unknown';cases:PrototypeCaseResult[];screenshots:Array<{caseId:string;stepIndex?:number;bytes:Buffer;capture?:{sourceWidth:number;sourceHeight:number;cssWidth:number;cssHeight:number;normalized:boolean}}>;notice:string;runnerVersion:string};
export const PROTOTYPE_BROWSER_VERSION='electron-snapshot-cdp-v8';
const activeJobs=new Map<symbol,()=>void>(),windows=new Set<BrowserWindow>();
export function cancelAllPrototypeAcceptance(){for(const cancel of activeJobs.values())cancel();}
export function prototypeBrowserActiveCount(){return windows.size;}
// Creating an isolated renderer and enabling CDP are startup work. They use a
// separate bound; native interaction stays at 3s and the job stays at 60s.
const INITIALIZATION_MS=10000,STEP_MS=3000,WORLD=1017;
const normalize=(value:string)=>value.replaceAll('\\','/');
const safePath=(value:string)=>typeof value==='string'&&value.length>0&&value.length<=4096&&!/[:\0\r\n?#]/.test(value)&&!value.startsWith('/')&&!normalize(value).split('/').some(part=>!part||part==='.'||part==='..');
const reasonOf=(error:unknown)=>error instanceof Error&&/^PROTOTYPE_[A-Z_]+$/.test(error.message)?error.message:'PROTOTYPE_EXECUTION_UNAVAILABLE';
class Stop extends Error{}

/** Observe before native input: a new document can abandon its old rAF promise.
 * Same-document and child-frame events do not require a document-load wait.
 * The caller's existing bounded step/abort guard owns the entire wait budget. */
function observeInputNavigation(contents:Electron.WebContents){
 type Outcome={kind:'navigation'|'loaded'}|{kind:'failed';reason:string};
 let resolveStarted!:(value:Outcome)=>void,resolveFinished!:(value:Outcome)=>void;
 const started=new Promise<Outcome>(resolve=>{resolveStarted=resolve;}),finished=new Promise<Outcome>(resolve=>{resolveFinished=resolve;});
 const begin=(details:Electron.Event<Electron.WebContentsDidStartNavigationEventParams>)=>{if(details.isMainFrame&&!details.isSameDocument)resolveStarted({kind:'navigation'});};
 const loaded=(_event:Electron.Event,isMainFrame:boolean)=>{if(isMainFrame)resolveFinished({kind:'loaded'});};
 const settleFailure=(reason:string)=>{const outcome:Outcome={kind:'failed',reason};resolveStarted(outcome);resolveFinished(outcome);};
 const failed=(_event:Electron.Event,_code:number,_description:string,_url:string,isMainFrame:boolean)=>{if(isMainFrame)settleFailure('PROTOTYPE_NAVIGATION_LOAD_FAILED');};
 const destroyed=()=>{settleFailure('PROTOTYPE_RENDERER_EXITED');dispose();};
 const dispose=()=>{contents.removeListener('did-start-navigation',begin);contents.removeListener('did-frame-finish-load',loaded);contents.removeListener('did-fail-load',failed);contents.removeListener('did-fail-provisional-load',failed);contents.removeListener('destroyed',destroyed);};
 contents.on('did-start-navigation',begin);contents.on('did-frame-finish-load',loaded);contents.on('did-fail-load',failed);contents.on('did-fail-provisional-load',failed);
 contents.once('destroyed',destroyed);
 return{started,finished,dispose};
}


// This function is fixed application code. The page receives only validated
// JSON command data; no Agent code, regex, CDP method or host object is exposed.
function inspectDom(command:{selector?:string;operation:string;value?:string;minPixels?:number}){
 if(command.operation==='viewport')return{ok:true,width:window.innerWidth,height:window.innerHeight};
 if(command.operation==='no-horizontal-overflow'&&!command.selector){
  const availableWidth=document.documentElement.clientWidth,scrollWidth=Math.max(document.documentElement.scrollWidth,document.body?.scrollWidth??0);
  return{ok:true,value:scrollWidth<=availableWidth+1,measurements:{scrollWidth,availableWidth}};
 }
 let matches:NodeListOf<Element>|never[];
 try{matches=command.selector?document.querySelectorAll(command.selector):[];}catch{return{ok:false,reason:'PROTOTYPE_SELECTOR_INVALID'};}
 if(command.operation==='count')return{ok:true,value:Math.min(matches.length,10001)};
 if(command.operation==='visible'&&matches.length===0)return{ok:true,value:false};
 if(matches.length!==1)return{ok:false,reason:'PROTOTYPE_SELECTOR_NOT_UNIQUE',count:matches.length};
 const el=matches[0] as HTMLElement,rect=el.getBoundingClientRect();
 // Native closed details can retain descendant layout boxes while skipping
 // their rendering. Use the same browser visibility check as control usability.
 const visible=rect.width>0&&rect.height>0&&el.checkVisibility({checkOpacity:true,checkVisibilityCSS:true});
 const disabled=el.matches(':disabled')||el.getAttribute('aria-disabled')==='true';
 if(command.operation==='no-horizontal-overflow')return{ok:true,value:el.scrollWidth<=el.clientWidth+1,measurements:{scrollWidth:el.scrollWidth,availableWidth:el.clientWidth}};
 if(command.operation==='min-target-size')return{ok:true,value:visible&&rect.width>=command.minPixels!&&rect.height>=command.minPixels!,measurements:{width:rect.width,height:rect.height,minPixels:command.minPixels}};
 if(command.operation==='visible')return{ok:true,value:visible};
 if(command.operation==='enabled')return{ok:true,value:!disabled};
 if(command.operation==='readonly'||command.operation==='checked'){
  const property=command.operation==='readonly'?'readOnly':'checked';
  if(!(property in el))return{ok:false,reason:'PROTOTYPE_CONTROL_UNSUPPORTED'};
  return{ok:true,value:Boolean((el as unknown as Record<string,unknown>)[property])};
 }
 if(command.operation==='text'||command.operation==='value'){
  if(command.operation==='value'&&!('value' in el))return{ok:false,reason:'PROTOTYPE_CONTROL_UNSUPPORTED'};
  const value=String(command.operation==='text'?el.innerText??el.textContent??'':(el as HTMLInputElement).value);
  if(value.length>2000)return{ok:false,reason:'PROTOTYPE_OBSERVATION_LIMIT'};
  return{ok:true,value};
 }
 if(!visible)return{ok:false,reason:'PROTOTYPE_TARGET_HIDDEN'};
 if(disabled)return{ok:false,reason:'PROTOTYPE_TARGET_DISABLED'};
 el.scrollIntoView({block:'center',inline:'center',behavior:'instant'});
 const actual=el.getBoundingClientRect(),x=actual.x+actual.width/2,y=actual.y+actual.height/2;
 const hit=document.elementFromPoint(x,y);
 if(!hit||!(hit===el||el.contains(hit)))return{ok:false,reason:'PROTOTYPE_TARGET_OBSCURED'};
 if(command.operation==='click')return{ok:true,x,y};
 if(command.operation==='fill'){
  if(!(el instanceof HTMLInputElement||el instanceof HTMLTextAreaElement)||el instanceof HTMLInputElement&&!['text','search','tel','url','email','password','number'].includes(el.type))return{ok:false,reason:'PROTOTYPE_CONTROL_UNSUPPORTED'};
  if(el.readOnly)return{ok:false,reason:'PROTOTYPE_TARGET_READONLY'};
  el.focus();if(document.activeElement!==el)return{ok:false,reason:'PROTOTYPE_FOCUS_UNAVAILABLE'};
  // Selecting existing text does not mutate it. CDP inserts native text.
  if(el instanceof HTMLTextAreaElement||el instanceof HTMLInputElement&&el.type!=='number')el.select();
  return{ok:true,numberInput:el instanceof HTMLInputElement&&el.type==='number'};
 }
 if(command.operation==='select'){
  if(!(el instanceof HTMLSelectElement)||el.multiple||el.options.length>100)return{ok:false,reason:'PROTOTYPE_CONTROL_UNSUPPORTED'};
  const options=Array.from(el.options),indices=options.map((option,index)=>option.value===command.value?index:-1).filter(index=>index>=0);
  const enabled=(option:HTMLOptionElement)=>!option.disabled&&!(option.parentElement instanceof HTMLOptGroupElement&&option.parentElement.disabled);
  if(indices.length!==1||!enabled(options[indices[0]]))return{ok:false,reason:'PROTOTYPE_SELECT_VALUE_UNAVAILABLE'};
  el.focus();return{ok:true,index:options.filter(enabled).indexOf(options[indices[0]])};
 }
 if(command.operation==='press'){el.focus();return document.activeElement===el?{ok:true}:{ok:false,reason:'PROTOTYPE_FOCUS_UNAVAILABLE'};}
 return{ok:false,reason:'PROTOTYPE_COMMAND_UNSUPPORTED'};
}

export async function runPrototypeAcceptance(input:PrototypeBrowserInput):Promise<PrototypeBrowserResult>{
 if(!app.isReady())throw Error('PROTOTYPE_ELECTRON_NOT_READY');
 if(app.commandLine.hasSwitch('no-sandbox')||process.argv.some(value=>value==='--no-sandbox'||value.startsWith('--no-sandbox=')))throw Error('PROTOTYPE_SANDBOX_REQUIRED');
 const cases=input.cases.map(item=>prototypeAcceptanceCaseSchema.parse(item));
 if(!cases.length||cases.length>LIMITS.cases||new Set(cases.map(item=>item.id)).size!==cases.length||cases.reduce((n,item)=>n+item.steps.length,0)>LIMITS.totalSteps)throw Error('PROTOTYPE_CASE_LIMIT');
 if(input.snapshot.size>LIMITS.files||!safePath(input.entryPath)||!/\.(html?)$/i.test(input.entryPath))throw Error('PROTOTYPE_SNAPSHOT_INVALID');
 const snapshot=new Map<string,{bytes:Buffer;hash:string}>();let bytes=0;
 for(const [key,item] of input.snapshot){
  if(!safePath(key)||!/\.(?:html?|css|m?js|json|svg|png|jpe?g|gif|webp|woff2?|ttf|ico)$/i.test(key)||!Buffer.isBuffer(item.bytes)||!/^[a-f0-9]{64}$/i.test(item.hash))throw Error('PROTOTYPE_SNAPSHOT_INVALID');
  if(bytes+item.bytes.length>LIMITS.bytes)throw Error('PROTOTYPE_SNAPSHOT_HASH_OR_LIMIT');
  const content=Buffer.from(item.bytes);bytes+=content.length;
  if(createHash('sha256').update(content).digest('hex')!==item.hash.toLowerCase())throw Error('PROTOTYPE_SNAPSHOT_HASH_OR_LIMIT');
  const relative=normalize(key);if(snapshot.has(relative))throw Error('PROTOTYPE_SNAPSHOT_INVALID');snapshot.set(relative,{bytes:content,hash:item.hash});
 }
 if(!snapshot.has(normalize(input.entryPath)))throw Error('PROTOTYPE_ENTRY_NOT_IN_SNAPSHOT');
 const result:PrototypeBrowserResult={status:'unknown',cases:[],screenshots:[],notice:PROTOTYPE_ACCEPTANCE_NOTICE,runnerVersion:PROTOTYPE_BROWSER_VERSION};
 let stopReason:string|undefined,terminateCurrent:(reason:string,timerExpired?:boolean)=>void=()=>{},screenshotBytes=0;
 const token=Symbol(),abort=()=>{stopReason='PROTOTYPE_CANCELLED';terminateCurrent(stopReason);};
 activeJobs.set(token,abort);input.signal?.addEventListener('abort',abort,{once:true});
 const timer=setTimeout(()=>{stopReason='PROTOTYPE_TOTAL_TIMEOUT';terminateCurrent(stopReason,true);},LIMITS.timeoutMs);
 const current=()=>{if(input.signal?.aborted)abort();if(stopReason)throw new Stop(stopReason);try{input.assertCurrent?.();}catch{stopReason='PROTOTYPE_AUTHORIZATION_CHANGED';terminateCurrent(stopReason);throw new Stop(stopReason);}};
 try{
  for(const testcase of cases){
   const diagnostics=new PrototypeCaseDiagnosticsRecorder(testcase.steps.length),caseResult:PrototypeCaseResult={caseId:testcase.id,status:'unknown',steps:[],diagnostics:diagnostics.value};result.cases.push(caseResult);
   if(stopReason||input.signal?.aborted){caseResult.reason=stopReason??'PROTOTYPE_CANCELLED';diagnostics.stop(caseResult.reason);caseResult.steps=testcase.steps.map((_step,stepIndex)=>({stepIndex,status:'not_run',reason:caseResult.reason}));continue;}
   const isolated=session.fromPartition('prototype-acceptance-'+randomUUID(),{cache:false}),origin='https://prototype-'+randomUUID()+'.invalid';
   const issues=new Set<string>();let win:BrowserWindow|undefined,stopping=false,rejectGuard:(error:Error)=>void=()=>{},stepTimer:ReturnType<typeof setTimeout>|undefined;
   const guard=new Promise<never>((_resolve,reject)=>{rejectGuard=reject;});void guard.catch(()=>{});
   const terminate=(reason:string,timerExpired=false)=>{if(stopping)return;diagnostics.stop(reason,timerExpired);stopping=true;rejectGuard(new Stop(reason));if(win&&!win.isDestroyed()){try{win.webContents.forcefullyCrashRenderer();}catch{}win.destroy();}};
   terminateCurrent=terminate;
   const bounded=<T>(phase:'initialization'|'viewport'|'step'|'screenshot',action:()=>Promise<T>,stepIndex?:number):Promise<T>=>diagnostics.measure(phase,async()=>{current();stepTimer=setTimeout(()=>terminate('PROTOTYPE_STEP_TIMEOUT',true),phase==='initialization'?INITIALIZATION_MS:STEP_MS);try{const value=await Promise.race([guard,action()]);current();return value;}finally{if(stepTimer)clearTimeout(stepTimer);stepTimer=undefined;}},stepIndex);
   const denyDownload=(event:Electron.Event)=>{issues.add('PROTOTYPE_DOWNLOAD_BLOCKED');event.preventDefault();};
   try{
    current();await isolated.setProxy({mode:'fixed_servers',proxyRules:'127.0.0.1:9',proxyBypassRules:'<-loopback>'});isolated.enableNetworkEmulation({offline:true});
    isolated.setPermissionRequestHandler((_w,_p,callback)=>{issues.add('PROTOTYPE_PERMISSION_BLOCKED');callback(false);});
    isolated.setPermissionCheckHandler(()=>false);isolated.setDevicePermissionHandler(()=>false);isolated.on('will-download',denyDownload);
    const navigationAllowed=(raw:string)=>{try{const url=new URL(raw),relative=decodeURIComponent(url.pathname.slice(1));return url.origin===origin&&safePath(relative)&&/\.html?$/i.test(relative)&&snapshot.has(relative);}catch{return false;}};
    isolated.protocol.handle('https',request=>{
     let url:URL,relative:string;
     try{url=new URL(request.url);relative=decodeURIComponent(url.pathname.slice(1));}catch{issues.add('PROTOTYPE_RESOURCE_BLOCKED');return new Response('',{status:403});}
     if(url.origin!==origin||!['GET','HEAD'].includes(request.method)||!safePath(relative)||!snapshot.has(relative)){issues.add('PROTOTYPE_RESOURCE_BLOCKED');return new Response('',{status:403});}
     const content=snapshot.get(relative)!,extension=path.posix.extname(relative).toLowerCase();
     const mime:Record<string,string>={'.html':'text/html; charset=utf-8','.htm':'text/html; charset=utf-8','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.svg':'image/svg+xml','.gif':'image/gif','.webp':'image/webp','.woff':'font/woff','.woff2':'font/woff2'};
     return new Response(request.method==='HEAD'?null:new Uint8Array(content.bytes),{headers:{'Content-Type':mime[extension]??'application/octet-stream','Content-Security-Policy':"default-src 'self' data:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; frame-src 'none'; child-src 'none'; worker-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'",'X-Content-Type-Options':'nosniff','Cache-Control':'no-store'}});
    });
    isolated.webRequest.onBeforeRequest({urls:['<all_urls>']},(details,callback)=>{let allowed=false;try{const url=new URL(details.url);allowed=url.origin===origin&&safePath(decodeURIComponent(url.pathname.slice(1)))&&snapshot.has(decodeURIComponent(url.pathname.slice(1)));}catch{}if(!allowed)issues.add('PROTOTYPE_RESOURCE_BLOCKED');callback({cancel:!allowed});});
    win=new BrowserWindow({show:false,width:testcase.viewport?.width??1100,height:testcase.viewport?.height??760,...(testcase.viewport?{useContentSize:true}:{}),skipTaskbar:true,webPreferences:{session:isolated,sandbox:true,contextIsolation:true,nodeIntegration:false,nodeIntegrationInWorker:false,nodeIntegrationInSubFrames:false,webviewTag:false,webSecurity:true,allowRunningInsecureContent:false,disableDialogs:true,spellcheck:false,plugins:false,devTools:false,backgroundThrottling:false}});
    windows.add(win);const contents=win.webContents;contents.setAudioMuted(true);contents.setWebRTCIPHandlingPolicy('disable_non_proxied_udp');
    contents.setWindowOpenHandler(()=>{issues.add('PROTOTYPE_NEW_WINDOW_BLOCKED');return{action:'deny'};});
    contents.on('will-navigate',event=>{if(!navigationAllowed(event.url)){issues.add('PROTOTYPE_NAVIGATION_BLOCKED');event.preventDefault();}});
    contents.on('will-frame-navigate',event=>{if(!event.isMainFrame||!navigationAllowed(event.url)){issues.add('PROTOTYPE_NAVIGATION_BLOCKED');event.preventDefault();}});
    contents.on('will-redirect',(event,url,_inPlace,isMainFrame)=>{if(!isMainFrame||!navigationAllowed(url)){issues.add('PROTOTYPE_NAVIGATION_BLOCKED');event.preventDefault();}});
    contents.on('will-attach-webview',event=>{issues.add('PROTOTYPE_NAVIGATION_BLOCKED');event.preventDefault();});
    contents.on('render-process-gone',()=>{if(!stopping)terminate('PROTOTYPE_RENDERER_EXITED');});
    const runtimeError=(description?:unknown)=>{issues.add('PROTOTYPE_RUNTIME_EXCEPTION');diagnostics.runtimeError(sanitizePrototypeRuntimeError(description,origin,new Set(snapshot.keys())));};
    contents.on('console-message',(event,level)=>{if(level===3||(event as unknown as {level?:string}).level==='error')runtimeError();});
    contents.debugger.attach('1.3');
    contents.debugger.on('message',(_event,method,params)=>{
     if(method==='Runtime.exceptionThrown')runtimeError(params.exceptionDetails?.exception?.description);
     if(method==='Runtime.consoleAPICalled'&&params.type==='error'){
      const errors=(Array.isArray(params.args)?params.args:[]).slice(0,3).filter((arg:{type?:string;subtype?:string})=>arg.type==='object'&&arg.subtype==='error');
      if(errors.length)for(const error of errors)runtimeError(error.description);else runtimeError();
     }
     if(method==='Log.entryAdded'&&params.entry?.level==='error'&&['security','network'].includes(params.entry?.source))issues.add('PROTOTYPE_RESOURCE_BLOCKED');
    });
    // A fresh hidden window has no renderer yet. Loading must start before
    // waiting for CDP domain commands, or those commands can wait forever.
    await bounded('initialization',async()=>{await Promise.all([win!.loadURL(origin+'/'+normalize(input.entryPath).split('/').map(encodeURIComponent).join('/')),contents.debugger.sendCommand('Runtime.enable'),contents.debugger.sendCommand('Log.enable')]);});
    const inspect=async(command:Parameters<typeof inspectDom>[0])=>contents.executeJavaScriptInIsolatedWorld(WORLD,[{code:'('+inspectDom.toString()+')('+JSON.stringify(command)+')'}]) as Promise<Record<string,any>>;
    const paint=async(frames=1)=>contents.executeJavaScriptInIsolatedWorld(WORLD,[{code:'new Promise(resolve=>{let n='+frames+';const next=()=>requestAnimationFrame(()=>--n?next():setTimeout(resolve,32));next();})'}]);
    await bounded('viewport',async()=>{
     if(testcase.viewport)await contents.debugger.sendCommand('Emulation.setDeviceMetricsOverride',{...testcase.viewport,deviceScaleFactor:1,mobile:false});
     await paint(2);const actual=await inspect({operation:'viewport'});caseResult.viewport={width:actual.width,height:actual.height};
     if(testcase.viewport&&(actual.width!==testcase.viewport.width||actual.height!==testcase.viewport.height))throw Error('PROTOTYPE_VIEWPORT_UNAVAILABLE');
    });
    if(issues.size)throw Error([...issues][0]);
    const key=async(keyName:string,keyCode:number,code=keyName,modifiers=0)=>{await contents.debugger.sendCommand('Input.dispatchKeyEvent',{type:'keyDown',key:keyName,code,windowsVirtualKeyCode:keyCode,nativeVirtualKeyCode:keyCode,modifiers});await contents.debugger.sendCommand('Input.dispatchKeyEvent',{type:'keyUp',key:keyName,code,windowsVirtualKeyCode:keyCode,nativeVirtualKeyCode:keyCode,modifiers});};
    for(let stepIndex=0;stepIndex<testcase.steps.length;stepIndex++){
     const step=testcase.steps[stepIndex];let stepResult:PrototypeStepResult;
     try{
      stepResult=await bounded('step',async()=>{
       if(step.action==='assert'){
        if(step.assertion==='control-usability'){
         const read=await contents.executeJavaScriptInIsolatedWorld(WORLD,[{code:'('+inspectPrototypeControlUsability.toString()+')('+JSON.stringify(step.selector??'body')+')'}]);
         return{stepIndex,status:!read.ok?'unknown' as const:read.value?'passed' as const:'failed' as const,...(read.ok?{observed:read.value}:{}),...(read.usability?{usability:read.usability}:{}),...(read.reason?{reason:read.reason}:!read.value?{reason:'PROTOTYPE_ASSERTION_MISMATCH'}:{})};
        }
        const assertion=step.assertion,end=Date.now()+STEP_MS-150;let observed:string|number|boolean='',measurements:PrototypeStepResult['measurements'];
        do{
         if(assertion==='url'){const url=new URL(contents.getURL());observed=step.expected.startsWith('#')?url.hash:url.pathname.slice(1)+url.search+url.hash;}
         else{
          const read=await inspect({selector:step.selector,operation:assertion,...('minPixels'in step?{minPixels:step.minPixels}:{})});
          if(!read.ok){if(read.count===0&&Date.now()<end){await new Promise(resolve=>setTimeout(resolve,50));continue;}return{stepIndex,status:'unknown' as const,reason:read.reason};}
          observed=read.value;measurements=read.measurements;
         }
         const expected='expected'in step?step.expected:true;
         const matches=('match'in step&&step.match==='contains')?String(observed).includes(String(expected)):observed===expected;
         if(matches)return{stepIndex,status:'passed' as const,observed,...(measurements?{measurements}:{})};
         await new Promise(resolve=>setTimeout(resolve,50));
        }while(Date.now()<end);
        return{stepIndex,status:'failed' as const,observed,...(measurements?{measurements}:{}),reason:'PROTOTYPE_ASSERTION_MISMATCH'};
       }
       const target=await inspect({selector:step.selector,operation:step.action,...('value'in step?{value:step.value}:{})});
       if(!target.ok)return{stepIndex,status:target.reason==='PROTOTYPE_SELECTOR_NOT_UNIQUE'||target.reason==='PROTOTYPE_CONTROL_UNSUPPORTED'||target.reason==='PROTOTYPE_FOCUS_UNAVAILABLE'?'unknown' as const:'failed' as const,reason:target.reason};
       const navigation=observeInputNavigation(contents);
       try{
       if(step.action==='click'){
        await contents.debugger.sendCommand('Input.dispatchMouseEvent',{type:'mousePressed',x:target.x,y:target.y,button:'left',clickCount:1});
        await contents.debugger.sendCommand('Input.dispatchMouseEvent',{type:'mouseReleased',x:target.x,y:target.y,button:'left',clickCount:1});
       }else if(step.action==='fill'){if(target.numberInput)await key('a',65,'KeyA',2);await contents.debugger.sendCommand('Input.insertText',{text:step.value});}
       else if(step.action==='select'){
        await key('Home',36);for(let index=0;index<target.index;index++)await key('ArrowDown',40);
        const selected=await inspect({selector:step.selector,operation:'value'});
        if(!selected.ok||selected.value!==step.value)return{stepIndex,status:'unknown' as const,reason:'PROTOTYPE_SELECT_NATIVE_UNAVAILABLE'};
       }
       else{const keys={Enter:['Enter',13],Tab:['Tab',9],Escape:['Escape',27],Space:[' ',32]} as const;const selected=keys[step.key];await key(selected[0],selected[1],step.key==='Space'?'Space':step.key);}
       const afterInput=await Promise.race([paint().then(()=>({kind:'paint' as const})),navigation.started]);
       if(afterInput.kind==='failed')throw Error(afterInput.reason);
       if(afterInput.kind==='navigation'){
        const loaded=await navigation.finished;if(loaded.kind==='failed')throw Error(loaded.reason);
        await paint();
       }
       return{stepIndex,status:'passed' as const};
       }finally{navigation.dispose();}
      },stepIndex);
     }catch(error){stepResult={stepIndex,status:'unknown',reason:reasonOf(error)};}
     if(issues.has('PROTOTYPE_RUNTIME_EXCEPTION')&&stepResult.status==='passed')stepResult={...stepResult,status:'unknown',reason:'PROTOTYPE_RUNTIME_EXCEPTION'};
     caseResult.steps.push(stepResult);
     if(stepResult.status!=='passed'||issues.size){
      caseResult.status=issues.size?'unknown':stepResult.status==='failed'?'failed':'unknown';caseResult.reason=[...issues][0]??stepResult.reason;
      diagnostics.stop(caseResult.reason??'PROTOTYPE_EXECUTION_UNAVAILABLE');
      for(let index=stepIndex+1;index<testcase.steps.length;index++)caseResult.steps.push({stepIndex:index,status:'not_run',reason:'PROTOTYPE_PREVIOUS_STEP_STOPPED'});
      break;
     }
    }
    if(caseResult.steps.every(item=>item.status==='passed'))caseResult.status=issues.size?'unknown':'passed';
    if(issues.size){caseResult.status='unknown';caseResult.reason=[...issues][0];diagnostics.stop(caseResult.reason);}
    if(!win.isDestroyed()){
     // Hidden native capture can return display-scaled pixels (e.g. 537 for
     // CSS 390). Preserve those dimensions, then normalize the saved PNG.
     let capture:{sourceWidth:number;sourceHeight:number;cssWidth:number;cssHeight:number;normalized:boolean}|undefined;
     const png=await bounded('screenshot',async()=>{current();await paint(2);const viewport=caseResult.viewport!,original=await contents.capturePage(undefined,{stayHidden:true}),size=original.getSize();capture={sourceWidth:size.width,sourceHeight:size.height,cssWidth:viewport.width,cssHeight:viewport.height,normalized:size.width!==viewport.width||size.height!==viewport.height};const buffer=original.resize({width:viewport.width,height:viewport.height,quality:'best'}).toPNG();current();return buffer;});
     if(!png.length||png.length>LIMITS.screenshotBytes||screenshotBytes+png.length>LIMITS.screenshotsBytes)throw Error('PROTOTYPE_SCREENSHOT_LIMIT');
     screenshotBytes+=png.length;result.screenshots.push({capture,caseId:testcase.id,stepIndex:caseResult.steps.find(item=>item.status!=='passed')?.stepIndex,bytes:png});
    }
    if(issues.size){caseResult.status='unknown';caseResult.reason=[...issues][0];diagnostics.stop(caseResult.reason);}
   }catch(error){caseResult.status='unknown';caseResult.reason=reasonOf(error);diagnostics.stop(caseResult.reason);for(let index=caseResult.steps.length;index<testcase.steps.length;index++)caseResult.steps.push({stepIndex:index,status:'not_run',reason:caseResult.reason});}
   finally{
    stopping=true;if(stepTimer)clearTimeout(stepTimer);terminateCurrent=()=>{};
    if(win){windows.delete(win);if(!win.isDestroyed())win.destroy();}
    isolated.webRequest.onBeforeRequest(null);isolated.removeListener('will-download',denyDownload);isolated.protocol.unhandle('https');
    await isolated.clearStorageData().catch(()=>{});await isolated.clearCache().catch(()=>{});
   }
  }
  try{current();}catch{if(stopReason==='PROTOTYPE_AUTHORIZATION_CHANGED')for(const testcase of result.cases)if(testcase.status==='passed'){testcase.status='unknown';testcase.reason=stopReason;if(testcase.diagnostics)testcase.diagnostics.stopReason='PROTOTYPE_AUTHORIZATION_CHANGED';}}
  result.status=stopReason||result.cases.some(item=>item.status==='unknown')?'unknown':result.cases.some(item=>item.status==='failed')?'failed':'passed';
  return result;
 }finally{clearTimeout(timer);input.signal?.removeEventListener('abort',abort);activeJobs.delete(token);terminateCurrent=()=>{};}
}
