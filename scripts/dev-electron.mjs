import {spawn} from 'node:child_process';
import {appendFileSync,copyFileSync,existsSync,statSync,writeFileSync} from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {waitForRenderer} from './renderer-readiness.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const port=parsePort(process.env.PM_SLASH_DEV_PORT);
const host='127.0.0.1';
const devServerUrl=`http://${host}:${port}`;
const nodeCommand=process.execPath;
const viteCli=path.join(root,'node_modules','vite','bin','vite.js');
const tscCli=path.join(root,'node_modules','typescript','bin','tsc');
const electronCli=path.join(root,'node_modules','electron','cli.js');
const diagnosticPath=path.join(root,'dev-startup.log');
let diagnosticWarning=false;

// Synchronous, bounded stage records survive a native launcher termination.
// Never include environment values, CLI arguments or application contents.
function diagnose(message,visible=false){
 const line=`[dev] ${message}`;
 if(visible)console.log(line);
 try{
  if(existsSync(diagnosticPath)&&statSync(diagnosticPath).size>262144){
   copyFileSync(diagnosticPath,path.join(root,'dev-startup.previous.log'));
   writeFileSync(diagnosticPath,'');
  }
  appendFileSync(diagnosticPath,`${new Date().toISOString()} launcher=${process.pid} ${line}\n`);
 }catch(error){
  if(!diagnosticWarning){diagnosticWarning=true;console.error(`[dev] could not write startup diagnostics: ${error.code??'unknown error'}`);}
 }
}

function exitDescription(code,signal){
 const hex=Number.isInteger(code)&&Math.abs(code)>255?` (0x${(code>>>0).toString(16).toUpperCase().padStart(8,'0')})`:'';
 return `code ${code??'none'}${hex}, signal ${signal??'none'}`;
}

let buildProcess;
let rendererProcess;
let electronProcess;
let stopping=false;
const startupController=new AbortController();

function parsePort(value){
 const parsed=Number(value||5173);
 if(!Number.isInteger(parsed)||parsed<1024||parsed>65535)throw new Error(`PM_SLASH_DEV_PORT must be an integer between 1024 and 65535 (received ${value})`);
 return parsed;
}

function start(command,args,label,options={}){
 startupController.signal.throwIfAborted();
 diagnose(`starting ${label}`,true);
 const child=spawn(command,args,{cwd:root,stdio:'inherit',windowsHide:false,shell:false,...options});
 diagnose(`${label} spawned pid=${child.pid??'none'}`);
 child.once('error',error=>{diagnose(`${label} failed to start: ${error.code??'unknown error'}`,!stopping);});
 child.once('exit',(code,signal)=>{diagnose(`${label} exited: ${exitDescription(code,signal)}; stopping=${stopping}`,!stopping&&code!==0);});
 return child;
}

function waitForExit(child,label){
 return new Promise((resolve,reject)=>{
  const onError=error=>{cleanup();reject(new Error(`${label} failed to start: ${error.message}`));};
  const onExit=(code,signal)=>{cleanup();resolve({code,signal});};
  const cleanup=()=>{child.off('error',onError);child.off('exit',onExit);};
  child.once('error',onError);
  child.once('exit',onExit);
 });
}

async function compileMain(){
 diagnose('compiling Electron main/preload…',true);
 // Development loads the Vite URL; compiling its production renderer first
 // repeats frontend work and writes assets the development window never reads.
 const started=performance.now();
 buildProcess=start(nodeCommand,[tscCli,'-p','tsconfig.node.json'],'TypeScript compiler');
 const result=await waitForExit(buildProcess,'tsc');
 buildProcess=undefined;
 if(result.code!==0)throw new Error(`tsc exited with code ${result.code??'unknown'}`);
 const entry=path.join(root,'dist','main','main.js');
 if(!existsSync(entry))throw new Error(`build completed but Electron entry is missing: ${entry}`);
 diagnose(`main/preload ready in ${Math.round(performance.now()-started)}ms`,true);
}

function delay(milliseconds){return new Promise(resolve=>setTimeout(resolve,milliseconds));}

async function assertPortAvailable(){
 const server=net.createServer();
 try{
  await new Promise((resolve,reject)=>{
   server.once('error',reject);
   server.listen(port,host,resolve);
  });
 }catch(error){
  throw new Error(`development port ${port} is unavailable: ${error instanceof Error?error.message:String(error)}`);
 }finally{
  if(server.listening)await new Promise(resolve=>server.close(resolve));
 }
}

async function stopProcess(child){
 if(!child||child.exitCode!==null)return;
 if(process.platform==='win32'){
  await new Promise(resolve=>{
   const killer=spawn('taskkill',['/pid',String(child.pid),'/t','/f'],{stdio:'ignore',windowsHide:true});
   killer.once('error',resolve);
   killer.once('exit',resolve);
  });
 }else{
  child.kill('SIGTERM');
  await Promise.race([waitForExit(child,'child').catch(()=>undefined),delay(2_000)]);
  if(child.exitCode===null)child.kill('SIGKILL');
 }
}

async function shutdown(code=0){
 if(stopping)return;
 stopping=true;
 diagnose(`shutdown requested: code ${code}`);
 startupController.abort();
 await Promise.all([stopProcess(electronProcess),stopProcess(rendererProcess),stopProcess(buildProcess)]);
 process.exitCode=code;
}

process.once('SIGINT',()=>{void shutdown(0);});
process.once('SIGTERM',()=>{void shutdown(0);});

try{
 diagnose(`launcher started: Node ${process.version}; platform ${process.platform}/${process.arch}; stdin=${process.stdin.isTTY?'TTY':'pipe'} stdout=${process.stdout.isTTY?'TTY':'pipe'}; diagnostics=${diagnosticPath}`,true);
 await assertPortAvailable();
 await compileMain();
 startupController.signal.throwIfAborted();
 const rendererStarted=performance.now();
 rendererProcess=start(nodeCommand,[viteCli,'--host',host,'--port',String(port),'--strictPort'],'Vite renderer',{env:{...process.env,PM_SLASH_DEV_SERVER_PORT:String(port)}});
 await waitForRenderer(rendererProcess,devServerUrl,{signal:startupController.signal});
 startupController.signal.throwIfAborted();
 diagnose(`renderer HTML ready at ${devServerUrl} in ${Math.round(performance.now()-rendererStarted)}ms`,true);
 electronProcess=start(nodeCommand,[electronCli,'.'],'Electron desktop',{env:{...process.env,PM_SLASH_DEV_SERVER_URL:devServerUrl,PM_SLASH_DEV_SERVER_PORT:String(port)}});
 const result=await waitForExit(electronProcess,'Electron');
 electronProcess=undefined;
 await shutdown(result.code??0);
}catch(error){
 if(!stopping)diagnose(error instanceof Error?error.message:String(error),true);
 await shutdown(1);
}
