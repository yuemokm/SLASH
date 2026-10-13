// Actual BAT -> npm -> compile -> Vite -> Electron in a private source copy.
// Default: only fixture dist/cache/profile are written. --root-bat deliberately
// runs the real root's required main/preload tsc and needs explicit authorization.
// Installed dependencies are reused; no install, renderer build, user cache purge.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createServer} from 'node:net';
import {spawn} from 'node:child_process';

const root=process.cwd(),rootBat=process.argv.includes('--root-bat'),output=path.join(root,'.test-data',`startup-profile${rootBat?'-root':''}-${Date.now()}`),fixture=rootBat?root:path.join(output,'fixture');
await fs.mkdir(output,{recursive:true});
await fs.mkdir(fixture,{recursive:true});
const files=['package.json','package-lock.json','index.html','vite.config.ts','tsconfig.json','tsconfig.node.json','双击启动开发环境.bat'];
const sourceDirectories=['src','shared','main','scripts','public'];
const cacheDir=rootBat?path.join(root,'node_modules/.vite'):path.join(output,'vite-cache');
if(!rootBat){
 for(const name of [...sourceDirectories,...files])await fs.cp(path.join(root,name),path.join(fixture,name),{recursive:true});
 await fs.symlink(path.join(root,'node_modules'),path.join(fixture,'node_modules'),'junction');
 await fs.rename(path.join(fixture,'vite.config.ts'),path.join(fixture,'vite.snapshot.ts'));
 await fs.writeFile(path.join(fixture,'vite.config.ts'),`import original from './vite.snapshot';\nexport default {...original,cacheDir:${JSON.stringify(cacheDir)}};\n`);
}
const result={output,fixture,cacheDir,startedAt:new Date().toISOString(),cases:[],errors:[],scope:rootBat?'actual original root BAT with expressly authorized main/preload tsc; existing Vite cache retained; fresh private profile; no renderer build':'actual copied BAT; only isolated fixture dist written; fresh application profiles; cold then retained Vite cache; Windows filesystem cache not cleared'};
async function hashes(base,names=[...sourceDirectories,...files]){
 const values={};
 async function walk(relative){const stat=await fs.stat(path.join(base,relative));if(stat.isDirectory()){for(const name of (await fs.readdir(path.join(base,relative))).sort())await walk(path.join(relative,name));}else values[relative.replaceAll('\\','/')]=createHash('sha256').update(await fs.readFile(path.join(base,relative))).digest('hex');}
 for(const relative of names)await walk(relative);return values;
}
result.sourceHashes=await hashes(root);
result.rootDistHashes=await hashes(root,['dist']);
const fixtureHashes=await hashes(fixture);
assert.deepEqual(rootBat?fixtureHashes:{...fixtureHashes,'vite.config.ts':createHash('sha256').update(await fs.readFile(path.join(fixture,'vite.snapshot.ts'))).digest('hex')},result.sourceHashes);
result.fixtureSourceHashes=fixtureHashes;
const kill=child=>new Promise(resolve=>{
 if(!child||child.exitCode!==null)return resolve();
 const ownKiller=spawn('taskkill',['/pid',String(child.pid),'/t','/f'],{windowsHide:true,stdio:'ignore'});ownKiller.once('error',resolve);ownKiller.once('exit',resolve);
});
async function port(){const server=createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const value=server.address().port;await new Promise(resolve=>server.close(resolve));return value;}
function stages(item,evidence){
 const event=name=>Date.parse(evidence.events.find(event=>event.name===name)?.at);
 const origin=Date.parse(item.startedAt),windowAt=event('browser-window-created'),loadedAt=event('did-finish-load');
 const diagnostic=evidence.ready?.diagnostic,reactAt=diagnostic?.timeOrigin+diagnostic?.firstReactAt;
 const ipcAt=diagnostic?.timeOrigin+evidence.ready?.ipcFinishedAt;
 return {batToWindowMs:windowAt-origin,windowToDidFinishMs:loadedAt-windowAt,batToDidFinishMs:loadedAt-origin,batToFirstReactMs:reactAt-origin,windowToFirstReactMs:reactAt-windowAt,batToDiagnosticIpcMs:ipcAt-origin,diagnosticStateIpcMs:evidence.ready?.ipcFinishedAt-evidence.ready?.ipcStartedAt};
}
let child;
try{
 for(const name of rootBat?['root-bat']:['cold','warm']){
  const profile=rootBat?path.join(output,'profile'):path.join(fixture,'.test-data',`${name}-profile`);await fs.mkdir(profile,{recursive:true});
  const env={...process.env};for(const key of ['NODE_OPTIONS','ELECTRON_RUN_AS_NODE','PM_SLASH_DEV_SERVER_URL','PM_SLASH_DEV_SERVER_PORT','PM_SLASH_DEV_PORT'])delete env[key];
  Object.assign(env,{PM_SLASH_DATA_DIR:profile,PM_SLASH_TEST_HIDDEN:'1',PM_SLASH_DEV_PORT:String(await port()),NODE_OPTIONS:`--require "${path.join(fixture,'scripts/dev-startup-profile-observer.cjs').replaceAll('\\','/')}"`,DEBUG:'vite:deps,vite:hmr,vite:transform,vite:time',NO_COLOR:'1'});
  const item={name,profile,port:Number(env.PM_SLASH_DEV_PORT),startedAt:new Date().toISOString(),logEvents:[]},started=performance.now();result.cases.push(item);
  assert(name!=='cold'||!(await fs.stat(cacheDir).catch(()=>null)),'cold cache must not exist');
  child=spawn(process.env.ComSpec||'cmd.exe',['/d','/c','双击启动开发环境.bat'],{cwd:fixture,env,windowsHide:true,stdio:['ignore','pipe','pipe']});item.launcherPid=child.pid;
  let log='';const capture=chunk=>{const text=chunk.toString();log+=text;item.logEvents.push({elapsedMs:Math.round(performance.now()-started),text});};child.stdout.on('data',capture);child.stderr.on('data',capture);
  const timeout=setTimeout(()=>void kill(child),190000);
  item.exit=await new Promise(resolve=>{child.once('error',error=>resolve({error:String(error)}));child.once('exit',(code,signal)=>resolve({code,signal}));});clearTimeout(timeout);
  item.totalMs=Math.round(performance.now()-started);item.finishedAt=new Date().toISOString();await fs.writeFile(path.join(output,`${name}.log`),log);
  const evidence=JSON.parse(await fs.readFile(path.join(profile,'startup-evidence.json'),'utf8'));
  item.evidence=path.join(profile,'startup-evidence.json');item.stages=stages(item,evidence);item.stageTimingLines=log.split(/\r?\n/).filter(line=>line.startsWith('[dev]'));
  item.hmrReloadLines=log.split(/\r?\n/).filter(line=>/page reload|full-reload|re-optimizing|optimized dependencies changed/i.test(line));
  assert.equal(item.exit.code,0);assert.equal(evidence.status,'passed');assert.deepEqual(evidence.errors,[]);assert.deepEqual(evidence.cloudRequests,[]);assert.equal(evidence.actualAppPath,fixture);assert.equal(evidence.actualProfile,profile);
  assert.equal(item.hmrReloadLines.length,0,'isolation must have no source reload or reoptimization');assert(evidence.ready.diagnostic?.firstReactAt!==undefined,'early renderer marker installed');
  console.log(JSON.stringify({name,totalMs:item.totalMs,stages:item.stages,stageTimingLines:item.stageTimingLines}));
 }
 result.sourceHashesAfter=await hashes(root);const withoutScripts=values=>Object.fromEntries(Object.entries(values).filter(([name])=>!name.startsWith('scripts/')));assert.deepEqual(withoutScripts(result.sourceHashesAfter),withoutScripts(result.sourceHashes),'root product source changed during sampling');
 result.rootDistHashesAfter=await hashes(root,['dist']);result.rootDistChangedPaths=[...new Set([...Object.keys(result.rootDistHashes),...Object.keys(result.rootDistHashesAfter)])].filter(name=>result.rootDistHashes[name]!==result.rootDistHashesAfter[name]);
 if(rootBat){assert(!result.rootDistChangedPaths.some(name=>name.startsWith('dist/renderer/')),'development compilation must retain production renderer');if(result.rootDistChangedPaths.length)result.rootDistChangeReason='Authorized actual BAT tsc refreshed main/shared and their historical TypeScript imports; no renderer build.';}else assert.deepEqual(result.rootDistHashesAfter,result.rootDistHashes,'root dist changed during sampling');
 result.fixtureSourceHashesAfter=await hashes(fixture);assert.deepEqual(rootBat?withoutScripts(result.fixtureSourceHashesAfter):result.fixtureSourceHashesAfter,rootBat?withoutScripts(result.fixtureSourceHashes):result.fixtureSourceHashes,'fixture source changed during sampling');
 result.status='passed';
}catch(error){result.status='failed';result.errors.push(error.stack||String(error));process.exitCode=1;}
finally{await kill(child);result.spawnedProcessTreesClosed=true;await fs.writeFile(path.join(output,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({status:result.status,output,errors:result.errors}));}
