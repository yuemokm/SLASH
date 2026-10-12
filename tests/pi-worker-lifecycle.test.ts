import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createInterface} from 'node:readline';
import {createServer} from 'node:http';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs/promises';

const exec=promisify(execFile);
function alive(pid:number){try{process.kill(pid,0);return true;}catch{return false;}}
async function wait(check:()=>boolean,timeout=20000){const deadline=Date.now()+timeout;while(Date.now()<deadline){if(check())return;await new Promise(resolve=>setTimeout(resolve,100));}throw Error('process lifecycle fixture timed out');}
async function children(pid:number):Promise<Array<{pid:number;command:string}>>{
 if(process.platform==='win32'){const {stdout}=await exec('powershell.exe',['-NoProfile','-NonInteractive','-Command',`Get-CimInstance Win32_Process -Filter 'ParentProcessId = ${pid}' | Select-Object ProcessId,CommandLine | ConvertTo-Json -Compress`],{windowsHide:true});const value=JSON.parse(stdout.trim()||'[]');return(Array.isArray(value)?value:[value]).map(row=>({pid:row.ProcessId,command:row.CommandLine??''}));}
 const {stdout}=await exec('ps',['-o','pid=,args=','--ppid',String(pid)]);return stdout.trim().split('\n').filter(Boolean).map(line=>{const match=/^\s*(\d+)\s+(.*)$/.exec(line)!;return{pid:Number(match[1]),command:match[2]};});
}
for(const mode of ['normal_exit','terminated'] as const)test(`real Plan/observability/web workers stop with parent ${mode}; no later exports`,{timeout:60000},async t=>{
 let requests=0;const server=createServer(async(req,res)=>{for await(const _chunk of req){}requests++;res.writeHead(200,{'content-type':'application/json'});res.end('{}');});await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
 const host=spawn(process.execPath,['--import','tsx',path.resolve('tests/pi-orphan-host-fixture.ts')],{cwd:path.resolve('.'),env:{...process.env,SLASH_TEST_OBSERVABILITY_ENDPOINT:`http://127.0.0.1:${(server.address() as any).port}`},windowsHide:true,stdio:['pipe','pipe','pipe']});let stderr='',ready:any;let childRows:Array<{pid:number;command:string}>=[];
 host.stderr.on('data',chunk=>{stderr=(stderr+String(chunk)).slice(-5000);});
 const stages:Array<{stage:string;elapsedMs:number}>=[],started=performance.now(),lines=createInterface({input:host.stdout});
 // Startup already has bounded SDK operations and this test's 60s budget.
 // Listen to the real handshake; a separate 20s polling budget was shorter
 // than the fixture's sequential package initialization. Fail immediately on
 // a dead host rather than turn its failure into a misleading ready timeout.
 const readyEvent=new Promise<void>((resolve,reject)=>{
  const cleanup=()=>{lines.off('line',onLine);host.off('error',onError);host.off('exit',onExit);t.signal.removeEventListener('abort',onAbort);};
  const fail=(reason:string)=>{cleanup();reject(Error(`${reason}; stages=${JSON.stringify(stages)}; stderr=${stderr}`));};
  const onError=(error:Error)=>fail(`host startup error: ${error.message}`);
  const onExit=(code:number|null,signal:NodeJS.Signals|null)=>fail(`host exited before ready: ${code??signal}`);
  const onAbort=()=>fail('test cancelled before worker ready');
  const onLine=(line:string)=>{let value:any;try{value=JSON.parse(line);}catch{return;}if(value.type==='stage')stages.push({stage:value.stage,elapsedMs:Math.round(performance.now()-started)});if(value.type==='ready'){ready=value;cleanup();resolve();}};
  lines.on('line',onLine);host.once('error',onError);host.once('exit',onExit);t.signal.addEventListener('abort',onAbort,{once:true});if(t.signal.aborted)onAbort();
 });
 try{
  await readyEvent;t.diagnostic(`worker ready after ${Math.round(performance.now()-started)}ms; ${JSON.stringify(stages)}`);childRows=(await children(ready.pid)).filter(row=>row.command.includes('host.mjs')||row.command.includes('mcp-cli.js'));assert.equal(childRows.length,3,JSON.stringify(childRows));assert.equal(childRows.filter(row=>row.command.includes('host.mjs')).length,2,'real Plan and Langfuse helper processes');assert.equal(childRows.filter(row=>row.command.includes('mcp-cli.js')).length,1,'real pi-web-access stdio server');
  await wait(()=>requests>0);assert.equal((await fetch(ready.reviewUrl)).status,200);assert(childRows.every(row=>alive(row.pid)));
  const exit=new Promise<void>(resolve=>host.once('exit',()=>resolve()));if(mode==='normal_exit')host.stdin.write('exit\n');else host.kill();await exit;
  await wait(()=>childRows.every(row=>!alive(row.pid)),5000);const stoppedCount=requests;await new Promise(resolve=>setTimeout(resolve,1500));assert.equal(requests,stoppedCount,'no exporter requests after all owned workers exited');await assert.rejects(fetch(ready.reviewUrl));
 }finally{
  lines.close();host.kill();for(const row of childRows)if(alive(row.pid))try{process.kill(row.pid);}catch{}server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));if(ready?.webDirectory){const directory=path.resolve(ready.webDirectory);assert.equal(path.dirname(directory),os.tmpdir());assert(path.basename(directory).startsWith('slash-orphan-web-'));await fs.rm(directory,{recursive:true,force:true,maxRetries:5,retryDelay:100});}
 }
 assert(!stderr.includes('UnhandledPromiseRejection'),stderr);
});
