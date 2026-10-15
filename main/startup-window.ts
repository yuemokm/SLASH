import fs from 'node:fs/promises';
import path from 'node:path';
import {dialog,type BrowserWindow} from 'electron';

/** Keep failed navigation and renderer crashes recoverable; the main window is already visible. */
export function installStartupRecovery(win:BrowserWindow,options:{dataDir:string;redact:(value:string)=>string;load:()=>Promise<unknown>;hidden?:boolean;timeoutMs?:number}){
 let prompting=false,closing=false,programmaticLoad=false,attempt=0;
 let timer:ReturnType<typeof setTimeout>|undefined;
 const logPath=path.join(options.dataDir,'startup.log');
 function stopTimer(){clearTimeout(timer);timer=undefined;}
 async function record(message:string){
  const safe=options.redact(message).slice(0,4000);
  console.error('[startup] '+safe);
  await fs.mkdir(options.dataDir,{recursive:true}).then(()=>fs.appendFile(logPath,`${new Date().toISOString()} ${safe}\n`)).catch(()=>{});
 }
 async function recover(message:string){
  if(closing||win.isDestroyed())return;
  stopTimer();
  await record(message);
  if(prompting||closing||win.isDestroyed()||options.hidden)return;
  prompting=true;
  try{
   if(!win.isVisible())win.show();
   const choice=await dialog.showMessageBox(win,{type:'error',title:'slash 启动遇到问题',message:'slash 未能正常加载',detail:`可以重新加载。若问题仍然出现，请保留诊断日志。\n诊断日志：${logPath}\n\n${options.redact(message).slice(0,500)}`,buttons:['重新加载','退出'],defaultId:0,cancelId:1,noLink:true});
   if(closing||win.isDestroyed())return;
   if(choice.response===1){win.close();return;}
  }finally{prompting=false;}
  await load();
 }
 function begin(){
  stopTimer();const current=++attempt;
  timer=setTimeout(()=>{if(current===attempt)void recover('页面加载超时。');},options.timeoutMs??60_000);timer.unref?.();
  void record('开始加载');
 }
 async function load(){
  if(closing||win.isDestroyed())return;
  begin();const current=attempt;programmaticLoad=true;
  try{await options.load();}catch(error){if(current===attempt)await recover(`页面加载失败：${options.redact(String(error))}`);}
  finally{if(current===attempt)programmaticLoad=false;}
 }
 function close(){if(closing)return;closing=true;stopTimer();}
 win.once('closed',close);
 win.webContents.on('did-start-navigation',(_event,_url,inPlace,mainFrame)=>{if(mainFrame&&!inPlace&&!closing&&!programmaticLoad)begin();});
 win.webContents.on('did-finish-load',()=>{stopTimer();void record('页面加载完成');});
 win.webContents.on('did-fail-load',(_event,code,description,_url,mainFrame)=>{if(mainFrame&&code!==-3&&!programmaticLoad)void recover(`页面加载失败：${code} ${description}`);});
 win.webContents.on('render-process-gone',(_event,details)=>{void recover(`界面进程退出：${details.reason} (code ${details.exitCode})`);});
 win.webContents.on('console-message',details=>{
  const message=details.message;
  if(details.frame!==win.webContents.mainFrame||!message.startsWith('[slash-startup]'))return;
  if(/Renderer entry failed|React workbench failed|Initial application data failed/.test(message)){void recover(message);return;}
  void record(message);
 });
 return{load,close};
}
