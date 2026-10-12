import fs from 'node:fs/promises';
import path from 'node:path';
import {dialog,type BrowserWindow} from 'electron';

/** Keep a failed initial navigation or renderer crash recoverable without rebuilding the app. */
export function installStartupRecovery(win:BrowserWindow,options:{dataDir:string;redact:(value:string)=>string;load:()=>Promise<unknown>}){
 let prompting=false,closing=false;
 const logPath=path.join(options.dataDir,'startup.log');
 async function record(message:string){
  const safe=options.redact(message).slice(0,4000);
  console.error('[startup] '+safe);
  await fs.mkdir(options.dataDir,{recursive:true}).then(()=>fs.appendFile(logPath,`${new Date().toISOString()} ${safe}\n`)).catch(()=>{});
 }
 async function recover(message:string){
  if(closing||win.isDestroyed())return;
  await record(message);
  if(prompting)return;
  prompting=true;
  try{
   const choice=await dialog.showMessageBox(win,{type:'error',title:'Slash 启动遇到问题',message:'工作台未能正常加载',detail:`可以重试加载。若问题仍然出现，请保留启动窗口中的报错。\n诊断日志：${logPath}\n\n${options.redact(message).slice(0,500)}`,buttons:['重新加载','退出'],defaultId:0,cancelId:1,noLink:true});
   if(closing||win.isDestroyed())return;
   if(choice.response===1){win.close();return;}
  }finally{prompting=false;}
  await load();
 }
 async function load(){
  if(closing||win.isDestroyed())return;
  try{await options.load();}catch(error){await recover(`页面加载失败：${options.redact(String(error))}`);}
 }
 win.once('closed',()=>{closing=true;});
 win.webContents.on('render-process-gone',(_event,details)=>{void recover(`界面进程退出：${details.reason} (code ${details.exitCode})`);});
 win.webContents.on('console-message',(_event,_level,message)=>{if(message.startsWith('[slash-startup]'))void record(message);});
 return{load};
}
