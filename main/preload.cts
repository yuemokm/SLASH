import {contextBridge,ipcRenderer,webUtils} from 'electron';
contextBridge.exposeInMainWorld('pm',{request:(value:unknown)=>ipcRenderer.invoke('pm:request',value),pathForFile:(file:File)=>webUtils.getPathForFile(file),subscribe:(fn:(e:unknown)=>void)=>{const listener=(_:unknown,e:unknown)=>fn(e);ipcRenderer.on('pm:event',listener);return()=>ipcRenderer.removeListener('pm:event',listener)}});
