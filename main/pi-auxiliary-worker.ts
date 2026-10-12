import {spawn,type ChildProcessWithoutNullStreams} from 'node:child_process';
import {createRequire} from 'node:module';
import {createInterface} from 'node:readline';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {piPackageRoot as registeredPiPackageRoot,PI_PACKAGES,type PiPackageId} from './pi-packages.js';

const require=createRequire(import.meta.url);
export function piPackageRoot(name:string){const id=(Object.keys(PI_PACKAGES) as PiPackageId[]).find(id=>PI_PACKAGES[id].name===name);if(!id)throw Error('PI_PACKAGE_UNTRUSTED');return registeredPiPackageRoot(id);}
export function isolatedPiEnvironment(root:string):NodeJS.ProcessEnv {
 const env:NodeJS.ProcessEnv={};
 for(const key of ['PATH','Path','SystemRoot','WINDIR','COMSPEC','PATHEXT','TEMP','TMP'])if(process.env[key])env[key]=process.env[key];
 return {...env,HOME:root,USERPROFILE:root,ELECTRON_RUN_AS_NODE:'1',PI_CODING_AGENT_DIR:path.join(root,'agent'),LANGFUSE_TRACING_ENABLED:'false',LANGFUSE_MEDIA_UPLOAD_ENABLED:'false',PI_LENS_DISABLE_LSP_INSTALL:'1',PI_LENS_DISABLE_TOOL_INSTALL:'1',PI_LENS_HOME:path.join(root,'lens'),PILENS_DATA_DIR:path.join(root,'lens-data'),PI_LENS_CONFIG_PATH:path.join(root,'lens.json'),PLANNOTATOR_DATA_DIR:path.join(root,'plan-data'),PLANNOTATOR_REMOTE:'false',PLANNOTATOR_BROWSER:'none'};
}
export type AuxiliaryWorker={root:string;child:ChildProcessWithoutNullStreams;send:(value:unknown)=>void;close:()=>Promise<void>;next:(timeoutMs?:number)=>Promise<any>};
/** Published TS-only packages run through Pi's jiti loader in a separate Node process. */
export async function startAuxiliaryWorker(source:string,env:NodeJS.ProcessEnv={},root?:string):Promise<AuxiliaryWorker>{
 const dir=root??await fs.mkdtemp(path.join(os.tmpdir(),'slash-pi-'));
 await fs.mkdir(dir,{recursive:true});
 const worker=path.join(dir,'host.mjs');
 await fs.writeFile(worker,`import {createRequire} from 'node:module';
// Parent ownership is independent of package event queues or exporter timeouts.
// A closed host pipe or a vanished host must terminate this disposable worker.
const ownerPid=process.ppid;let ownerClosed=false;
const exitWithOwner=()=>{if(ownerClosed)return;ownerClosed=true;process.exit(0);};
process.stdin.once('end',exitWithOwner);process.stdin.once('close',exitWithOwner);process.stdin.once('error',exitWithOwner);
process.stdout.on('error',exitWithOwner);
const ownerWatch=setInterval(()=>{if(process.ppid!==ownerPid)return exitWithOwner();try{process.kill(ownerPid,0);}catch(error){if(error.code==='ESRCH')exitWithOwner();}},500);ownerWatch.unref();
const require=createRequire(${JSON.stringify(require.resolve('jiti'))});
const {createJiti}=require('jiti');
const jiti=createJiti(import.meta.url);
const emit=value=>{if(!ownerClosed)process.stdout.write(JSON.stringify(value)+'\\n');};
${source}`);
 const child=spawn(process.execPath,[worker],{cwd:dir,env:{...isolatedPiEnvironment(dir),...env},windowsHide:true,stdio:['pipe','pipe','pipe']});
 let stderr='';child.stderr.on('data',chunk=>{stderr=(stderr+String(chunk)).slice(-3000);});
 const queued:any[]=[],waiters:Array<{resolve:(v:any)=>void;reject:(e:Error)=>void}>=[];
 let cleanupPromise:Promise<void>|undefined;let exited=false;
 createInterface({input:child.stdout}).on('line',line=>{try{const value=JSON.parse(line);const pending=waiters.shift();if(pending)pending.resolve(value);else queued.push(value);}catch{}});
 const fail=(error:Error)=>{exited=true;for(const waiter of waiters.splice(0))waiter.reject(error);};
 child.stdin.on('error',error=>fail(error));
 child.on('error',fail);child.on('exit',code=>fail(Error(`PI_PACKAGE_WORKER_EXIT: ${code??'signal'} ${stderr}`)));
 return{root:dir,child,send:value=>{if(exited)throw Error('PI_PACKAGE_WORKER_CLOSED');child.stdin.write(JSON.stringify(value)+'\n');},next:(timeoutMs=30000)=>queued.length?Promise.resolve(queued.shift()):exited?Promise.reject(Error('PI_PACKAGE_WORKER_CLOSED')):new Promise((resolve,reject)=>{const timer=timeoutMs>0?setTimeout(()=>{const index=waiters.findIndex(w=>w.resolve===done);if(index>=0)waiters.splice(index,1);reject(Error('PI_PACKAGE_WORKER_TIMEOUT'));},timeoutMs):undefined;const done=(v:any)=>{clearTimeout(timer);resolve(v);};waiters.push({resolve:done,reject:error=>{clearTimeout(timer);reject(error);}});}),close:()=>{if(cleanupPromise)return cleanupPromise;cleanupPromise=(async()=>{if(!exited){child.kill();await new Promise<void>(resolve=>{const timer=setTimeout(resolve,2000);child.once('exit',()=>{clearTimeout(timer);resolve();});});}await fs.rm(dir,{recursive:true,force:true,maxRetries:5,retryDelay:150});})();return cleanupPromise;}};
}
