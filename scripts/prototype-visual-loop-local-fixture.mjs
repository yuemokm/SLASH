// Prepare by default; --run --prepared-dir <dir> explicitly launches the compiled app modules.
// Fixed loopback SSE responses verify plumbing, never cloud model quality.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import electronPath from 'electron';

const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),testRoot=path.join(repo,'.test-data');
const args=process.argv.slice(2),run=args.includes('--run'),index=args.indexOf('--prepared-dir');
const sha=value=>createHash('sha256').update(value).digest('hex');
const inside=(root,target)=>{const relative=path.relative(root,target);return Boolean(relative)&&!path.isAbsolute(relative)&&relative!=='..'&&!relative.startsWith('..'+path.sep);};
await fs.mkdir(testRoot,{recursive:true});
const output=index>=0?path.resolve(args[index+1]??''):await fs.mkdtemp(path.join(testRoot,'prototype-visual-loop-local-'));
if(!inside(testRoot,output))throw Error('FIXTURE_OUTPUT_OUTSIDE_TEST_ROOT');
const manifestPath=path.join(output,'manifest.json');
if(!run){
 await fs.mkdir(path.join(output,'profile'),{recursive:true});
 const sourceFiles=['main/service.ts','main/agent.ts','main/prototype-browser.ts','main/prototype-usability.ts','main/prototype-visual-review.ts','main/task-acceptance.ts','main/task-completion.ts','shared/prototype-visual-review.ts'];
 const sourceHashes={};for(const file of sourceFiles)sourceHashes[file]=sha(await fs.readFile(path.join(repo,file)));
 await fs.writeFile(manifestPath,JSON.stringify({schemaVersion:1,repo,output,profile:path.join(output,'profile'),workspace:path.join(output,'workspace'),host:path.join(repo,'scripts','prototype-visual-loop-local-host.mjs'),sourceHashes,cases:['repair_once_then_unverified','persistent_candidate_capped_at_two','vision_unsupported_no_images','plan_no_images'],cloudExecuted:false,preparedOnly:true},null,2),{flag:'wx'});
 console.log(JSON.stringify({status:'prepared_not_executed',output,manifest:manifestPath,requiresCompiledModules:true,cloudExecuted:false}));
}else{
 if(index<0)throw Error('FIXTURE_PREPARED_DIRECTORY_REQUIRED');
 const manifest=JSON.parse(await fs.readFile(manifestPath,'utf8'));
 if(manifest.repo!==repo||manifest.output!==output||manifest.cloudExecuted!==false)throw Error('FIXTURE_MANIFEST_INVALID');
 const lock=await fs.open(path.join(output,'execution.lock'),'wx');await lock.close();
 const env={...process.env};for(const key of Object.keys(env))if(/API_KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL/i.test(key)||['ELECTRON_RUN_AS_NODE','PM_SLASH_DEV_SERVER_URL','VITE_DEV_SERVER_URL','ELECTRON_RENDERER_URL'].includes(key))delete env[key];
 let timedOut=false;
 const code=await new Promise((resolve,reject)=>{
  const child=spawn(electronPath,[manifest.host,manifestPath],{cwd:repo,env,windowsHide:true,stdio:'ignore'});
  const timer=setTimeout(()=>{timedOut=true;child.kill();},180000);
  child.once('error',()=>{clearTimeout(timer);reject(Error('FIXTURE_ELECTRON_START_FAILED'));});
  child.once('exit',value=>{clearTimeout(timer);resolve(value);});
 });
 if(timedOut){console.log(JSON.stringify({status:'failed',error:'FIXTURE_PARENT_TIMEOUT',output,cloudExecuted:false}));process.exitCode=1;}
 else{const report=JSON.parse(await fs.readFile(path.join(output,'report.json'),'utf8'));console.log(JSON.stringify({status:report.status,checks:report.checks.length,cases:report.cases.map(item=>({label:item.label,status:item.status,repairRounds:item.repairRounds,imageRequests:item.imageRequests})),output,error:report.error,cloudExecuted:false}));if(code!==0||report.status!=='passed')process.exitCode=1;}
}
