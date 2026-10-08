import {app,BrowserWindow,session} from 'electron';
import {Buffer} from 'node:buffer';
import {randomUUID} from 'node:crypto';

export const REFERENCE_SCRIPT_LIMITS={inputBytes:16*1024*1024,scriptBytes:64*1024,outputBytes:2*1024*1024,timeoutMs:8000} as const;
export type ReferenceScriptInput={contentBase64:string;fileName:string;script:string;signal?:AbortSignal};

/**
 * Runs an async JavaScript function body with input={bytes:Uint8Array,
 * text:string (UTF-8 decoding),fileName:string (basename only)}. The caller must
 * obtain these bytes from a registered processing copy. A primitive string is
 * the only result; the caller, not this renderer, controls output persistence.
 * No source path, preload, Node integration or application IPC is provided.
 * Chromium's sandbox remains a dependency, not a claim of perfect isolation.
 * https://www.electronjs.org/docs/latest/tutorial/sandbox
 * https://www.electronjs.org/docs/latest/tutorial/security
 */
export async function runReferenceScript(input:ReferenceScriptInput):Promise<string>{
 if(app.commandLine.hasSwitch('no-sandbox')||process.argv.some(value=>value==='--no-sandbox'||value.startsWith('--no-sandbox=')))throw Error('REFERENCE_SCRIPT_SANDBOX_REQUIRED: 应用禁用了Chromium沙箱，不能执行副本脚本');
 if(!app.isReady())throw Error('REFERENCE_SCRIPT_NOT_READY: 请在Electron就绪后执行副本脚本');
 if(input.signal?.aborted)throw Error('REFERENCE_SCRIPT_CANCELLED: 副本脚本已取消');
 if(typeof input.contentBase64!=='string'||input.contentBase64.length>Math.ceil(REFERENCE_SCRIPT_LIMITS.inputBytes/3)*4||input.contentBase64.length%4!==0)throw Error('REFERENCE_SCRIPT_INPUT_LIMIT: 副本数据须为不超过16MiB的Base64');
 const bytes=Buffer.from(input.contentBase64,'base64');
 if(bytes.length>REFERENCE_SCRIPT_LIMITS.inputBytes)throw Error('REFERENCE_SCRIPT_INPUT_LIMIT: 副本数据超过16MiB');
 if(bytes.toString('base64')!==input.contentBase64)throw Error('REFERENCE_SCRIPT_INPUT_LIMIT: 副本数据不是有效的Base64');
 if(typeof input.script!=='string'||!input.script.trim()||Buffer.byteLength(input.script)>REFERENCE_SCRIPT_LIMITS.scriptBytes)throw Error('REFERENCE_SCRIPT_SCRIPT_LIMIT: 脚本须为不超过64KiB的JavaScript函数正文');
 const fileName=String(input.fileName).split(/[\\/]/).pop()?.replace(/[\u0000-\u001f\u007f]/g,'').slice(0,255)||'处理副本';
 const isolated=session.fromPartition(`reference-script-${randomUUID()}`,{cache:false});
 // webRequest alone does not cover WebRTC sockets. Disable direct UDP, put
 // this session offline, and provide no working proxy for proxied transports.
 await isolated.setProxy({mode:'fixed_servers',proxyRules:'127.0.0.1:9',proxyBypassRules:'<-loopback>'});
 isolated.enableNetworkEmulation({offline:true});
 isolated.setPermissionRequestHandler((_contents,_permission,callback)=>callback(false));
 isolated.setPermissionCheckHandler(()=>false);
 isolated.setDevicePermissionHandler(()=>false);
 const denyDownload=(event:Electron.Event)=>event.preventDefault();
 isolated.on('will-download',denyDownload);
 const csp="default-src 'none'; script-src 'unsafe-inline'; connect-src 'none'; img-src 'none'; media-src 'none'; font-src 'none'; style-src 'none'; frame-src 'none'; child-src 'none'; worker-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";
 const page='data:text/html;charset=utf-8,'+encodeURIComponent(`<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><title>副本脚本</title>`);
 isolated.webRequest.onBeforeRequest({urls:['<all_urls>']},(details,callback)=>callback({cancel:details.url!==page}));
 const win=new BrowserWindow({show:false,width:1,height:1,skipTaskbar:true,webPreferences:{session:isolated,sandbox:true,contextIsolation:true,nodeIntegration:false,nodeIntegrationInWorker:false,nodeIntegrationInSubFrames:false,webviewTag:false,webSecurity:true,allowRunningInsecureContent:false,disableDialogs:true,spellcheck:false,plugins:false,devTools:false,backgroundThrottling:false}});
 const contents=win.webContents;
 contents.setWebRTCIPHandlingPolicy('disable_non_proxied_udp');
 contents.setWindowOpenHandler(()=>({action:'deny'}));
 contents.on('will-navigate',event=>event.preventDefault());
 contents.on('will-frame-navigate',event=>event.preventDefault());
 contents.on('will-redirect',event=>event.preventDefault());
 contents.on('will-attach-webview',event=>event.preventDefault());
 let stopping=false,timer:ReturnType<typeof setTimeout>|undefined,rejectGuard:(error:Error)=>void=()=>{};
 const terminate=(error:Error)=>{if(stopping)return;stopping=true;rejectGuard(error);try{if(!contents.isDestroyed())contents.forcefullyCrashRenderer();}finally{if(!win.isDestroyed())win.destroy();}};
 const abort=()=>terminate(Error('REFERENCE_SCRIPT_CANCELLED: 副本脚本已取消'));
 const guard=new Promise<never>((_resolve,reject)=>{rejectGuard=reject;timer=setTimeout(()=>terminate(Error('REFERENCE_SCRIPT_TIMEOUT: 副本脚本超过8秒执行上限')),REFERENCE_SCRIPT_LIMITS.timeoutMs);});
 input.signal?.addEventListener('abort',abort,{once:true});
 const crashed=()=>{if(!stopping)rejectGuard(Error('REFERENCE_SCRIPT_RENDERER_EXITED: 副本脚本进程已终止'));};
 contents.on('render-process-gone',crashed);
 const inputSlot='__copyInput_'+randomUUID().replace(/-/g,''),receiverSlot='__copyResult_'+randomUUID().replace(/-/g,'');
 // The script and data are JSON literals, never a file:// navigation or host
 // eval. An inline script element works with a CSP that does not allow eval.
 const code=`(() => new Promise((resolve,reject) => {
  const encode=TextEncoder.prototype.encode.bind(new TextEncoder());
  for(const name of ['RTCPeerConnection','webkitRTCPeerConnection','RTCIceGatherer','WebTransport'])Object.defineProperty(globalThis,name,{value:undefined,writable:false,configurable:false});
  const data=${JSON.stringify({contentBase64:input.contentBase64,fileName})};
  const bytes=Uint8Array.from(atob(data.contentBase64),character=>character.charCodeAt(0));
  const value=Object.freeze({bytes,text:new TextDecoder().decode(bytes),fileName:data.fileName});
  Object.defineProperty(globalThis,${JSON.stringify(inputSlot)},{value});
  Object.defineProperty(globalThis,${JSON.stringify(receiverSlot)},{value:async result=>{
   try{const output=await result;if(typeof output!=='string')throw Error('REFERENCE_SCRIPT_RESULT_TYPE: 脚本只能返回字符串');if(encode(output).byteLength>${REFERENCE_SCRIPT_LIMITS.outputBytes})throw Error('REFERENCE_SCRIPT_OUTPUT_LIMIT: 输出超过2MiB');resolve(output);}catch(error){reject(error);}
  }});
  addEventListener('error',event=>reject(Error('REFERENCE_SCRIPT_EXECUTION: '+event.message)),{once:true});
  const element=document.createElement('script');
  element.textContent='globalThis['+${JSON.stringify(JSON.stringify(receiverSlot))}+']((async function(input){\\n'+${JSON.stringify(input.script)}+'\\n})(globalThis['+${JSON.stringify(JSON.stringify(inputSlot))}+']));';
  document.head.append(element);
 }))()`;
 try{
  if(input.signal?.aborted)abort();
  const result=await Promise.race([guard,(async()=>{await win.loadURL(page);return contents.executeJavaScript(code,false);})()]);
  if(typeof result!=='string')throw Error('REFERENCE_SCRIPT_RESULT_TYPE: 脚本只能返回字符串');
  if(Buffer.byteLength(result)>REFERENCE_SCRIPT_LIMITS.outputBytes)throw Error('REFERENCE_SCRIPT_OUTPUT_LIMIT: 输出超过2MiB');
  return result;
 }finally{
  stopping=true;if(timer)clearTimeout(timer);input.signal?.removeEventListener('abort',abort);
  contents.removeListener('render-process-gone',crashed);
  if(!win.isDestroyed())win.destroy();
  isolated.webRequest.onBeforeRequest(null);isolated.removeListener('will-download',denyDownload);
  await isolated.clearStorageData().catch(()=>{});await isolated.clearCache().catch(()=>{});
 }
}
