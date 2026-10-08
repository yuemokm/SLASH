import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const port=parsePort(process.env.PM_SLASH_DEV_PORT);
const host='127.0.0.1';
const devServerUrl=`http://${host}:${port}`;
const nodeCommand=process.execPath;
const viteCli=path.join(root,'node_modules','vite','bin','vite.js');
const tscCli=path.join(root,'node_modules','typescript','bin','tsc');
const electronCli=path.join(root,'node_modules','electron','cli.js');

let buildProcess;
let rendererProcess;
let electronProcess;
let stopping=false;

function parsePort(value){
 const parsed=Number(value||5173);
 if(!Number.isInteger(parsed)||parsed<1024||parsed>65535)throw new Error(`PM_SLASH_DEV_PORT must be an integer between 1024 and 65535 (received ${value})`);
 return parsed;
}

function start(command,args,options={}){
 const child=spawn(command,args,{cwd:root,stdio:'inherit',windowsHide:false,shell:false,...options});
 child.once('error',error=>{if(!stopping)console.error(`[dev] ${command} failed: ${error.message}`);});
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
 console.log('[dev] compiling Electron main/preload…');
 buildProcess=start(nodeCommand,[viteCli,'build']);
 let result=await waitForExit(buildProcess,'vite build');
 buildProcess=undefined;
 if(result.code!==0)throw new Error(`vite build exited with code ${result.code??'unknown'}`);
 buildProcess=start(nodeCommand,[tscCli,'-p','tsconfig.node.json']);
 result=await waitForExit(buildProcess,'tsc');
 buildProcess=undefined;
 if(result.code!==0)throw new Error(`tsc exited with code ${result.code??'unknown'}`);
 const entry=path.join(root,'dist','main','main.js');
 if(!existsSync(entry))throw new Error(`build completed but Electron entry is missing: ${entry}`);
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

async function waitForRenderer(child){
 const deadline=Date.now()+30_000;
 while(Date.now()<deadline){
  if(child.exitCode!==null)throw new Error(`renderer exited before readiness (code ${child.exitCode??'unknown'})`);
  try{
   const response=await fetch(devServerUrl,{signal:AbortSignal.timeout(750)});
   if(response.ok)return;
  }catch{}
  await delay(100);
 }
 throw new Error(`renderer did not become ready at ${devServerUrl}`);
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
 await Promise.all([stopProcess(electronProcess),stopProcess(rendererProcess),stopProcess(buildProcess)]);
 process.exitCode=code;
}

process.once('SIGINT',()=>{void shutdown(0);});
process.once('SIGTERM',()=>{void shutdown(0);});

try{
 await assertPortAvailable();
 await compileMain();
 rendererProcess=start(nodeCommand,[viteCli,'--host',host,'--port',String(port),'--strictPort'],{env:{...process.env,PM_SLASH_DEV_SERVER_PORT:String(port)}});
 await waitForRenderer(rendererProcess);
 console.log(`[dev] renderer ready at ${devServerUrl}`);
 electronProcess=start(nodeCommand,[electronCli,'.'],{env:{...process.env,PM_SLASH_DEV_SERVER_URL:devServerUrl,PM_SLASH_DEV_SERVER_PORT:String(port)}});
 const result=await waitForExit(electronProcess,'Electron');
 electronProcess=undefined;
 await shutdown(result.code??0);
}catch(error){
 console.error(`[dev] ${error instanceof Error?error.message:String(error)}`);
 await shutdown(1);
}
