// Actual app observer for isolated profiles; never loads a user's workspace.
const {app,BrowserWindow,ipcMain,dialog}=require('electron');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
globalThis.startupEvidence={windows:[],dialogs:[],stateRequested:false};
let releaseDialog,stateFailed=false,loadFailed=false;
const stateWaiters=[];
globalThis.startupHoldState=process.env.STARTUP_FIXTURE_MODE==='normal';
globalThis.startupReleaseState=()=>{globalThis.startupHoldState=false;stateWaiters.splice(0).forEach(resolve=>resolve());};
globalThis.startupReleaseDialog=()=>releaseDialog?.({response:0,checkboxChecked:false});
app.on('browser-window-created',(_event,win)=>globalThis.startupEvidence.windows.push({id:win.id}));
const originalLoad=BrowserWindow.prototype.loadFile;
BrowserWindow.prototype.loadFile=function(...args){
 if(process.env.STARTUP_FIXTURE_MODE==='load-failure'&&!loadFailed){loadFailed=true;return Promise.reject(Error('Synthetic page load failure'));}
 return originalLoad.apply(this,args);
};
const originalHandle=ipcMain.handle.bind(ipcMain);
ipcMain.handle=(channel,listener)=>originalHandle(channel,async(event,...args)=>{
 if(channel==='pm:request'&&args[0]?.type==='state'){
  globalThis.startupEvidence.stateRequested=true;
  if(process.env.STARTUP_FIXTURE_MODE==='state-failure'&&!stateFailed){stateFailed=true;return{ok:false,error:'Synthetic initial state failure'};}
  if(globalThis.startupHoldState)await new Promise(resolve=>stateWaiters.push(resolve));
 }
 return listener(event,...args);
});
dialog.showMessageBox=async(win,options)=>{
 globalThis.startupEvidence.dialogs.push({options:options??win,visible:win instanceof BrowserWindow?win.isVisible():null,windowCount:BrowserWindow.getAllWindows().length});
 return await new Promise(resolve=>{releaseDialog=resolve;});
};
app.whenReady().then(()=>import(pathToFileURL(path.join(__dirname,'../dist/main/main.js')).href)).catch(error=>{console.error(error);app.exit(1);});
