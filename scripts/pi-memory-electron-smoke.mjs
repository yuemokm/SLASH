import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createJiti} from 'jiti';

if(!process.versions.electron){
 const require=createRequire(import.meta.url);
 const result=spawnSync(require('electron'),[fileURLToPath(import.meta.url),...process.argv.slice(2)],{cwd:process.cwd(),env:{...process.env,ELECTRON_RUN_AS_NODE:'1'},windowsHide:true,encoding:'utf8',timeout:60000});
 process.stdout.write(result.stdout??'');process.stderr.write(result.stderr??'');if(result.error)throw result.error;process.exit(result.status??1);
}
const directory=await fs.mkdtemp(path.join(os.tmpdir(),'slash-memory-electron-'));
try{
 const source=process.argv.includes('--source'),jiti=createJiti(import.meta.url,{fsCache:false});
 // Default exercises exactly the compiled module used by the desktop app.
 // --source is an explicit no-build diagnostic, never the delivery assertion.
 const {PiMemory,piMemoryDirectory}=source?await jiti.import(path.resolve('main/pi-memory.ts')):await import(pathToFileURL(path.resolve('dist/main/pi-memory.js')).href);
 const host={directory:piMemoryDirectory(directory,'electron-project'),projectId:'electron-project',origin:{runId:'electron-local',conversationId:'electron-chat',inputHash:createHash('sha256').update('本机验收').digest('hex')},guard:()=>{},bindSources:async()=>[],sourceState:async()=> 'current'};
 const memory=new PiMemory(host),saved=await memory.call('memory_write',{title:'Electron真实包',text:'同项目跨会话候选备忘'});
 assert.equal(saved.status,'candidate');const read=await new PiMemory(host).call('memory_read',{});assert.equal(read.items[0].id,saved.id);
 const removed=await memory.call('memory_forget',{id:saved.id});assert.equal((await memory.call('memory_read',{})).total,0);
 await memory.call('memory_restore',{recoveryId:removed.recoveryId});assert.equal((await new PiMemory(host).call('memory_read',{})).total,1);
 console.log(JSON.stringify({status:'passed',package:'pi-memory',version:'0.4.2',electron:process.versions.electron,node:process.versions.node,compiled:!source,checks:['real-package-write','cross-instance-persistence','real-package-forget','real-package-restore','candidate-only'],cloudExecuted:false,built:false}));
}finally{await fs.rm(directory,{recursive:true,force:true,maxRetries:5,retryDelay:40});}
