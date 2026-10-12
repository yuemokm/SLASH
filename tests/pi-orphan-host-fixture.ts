import {createInterface} from 'node:readline';
import os from 'node:os';
import fs from 'node:fs/promises';
import path from 'node:path';
import type {ExtensionAPI,ExtensionContext} from '@earendil-works/pi-coding-agent';
import {createPiObservabilityExtension} from '../main/pi-observability.js';
import {startPiPlanReview} from '../main/pi-plan-review.js';
import {PiWebAccess} from '../main/pi-web-access.js';

// Genuine package processes, no cloud models, credentials or project files.
const stage=(name:string)=>process.stdout.write(JSON.stringify({type:'stage',stage:name})+'\n');
stage('fixture_loaded');
const handlers=new Map<string,(event:unknown,context:ExtensionContext)=>Promise<void>>();
const observation=createPiObservabilityExtension({enabled:true,baseUrl:process.env.SLASH_TEST_OBSERVABILITY_ENDPOINT!,publicKey:'pk-local-orphan-fixture',secretKey:'sk-local-orphan-fixture',mode:'metadata'});
await observation({on:(name:string,handler:any)=>handlers.set(name,handler)} as unknown as ExtensionAPI);
if(!handlers.has('session_start'))throw Error('OBSERVABILITY_NOT_READY');
stage('observability_ready');
const context={hasUI:false,cwd:'[fixture]',model:{id:'local-fixture',provider:'local-fixture'},sessionManager:{getSessionId:()=> 'orphan-fixture'}} as unknown as ExtensionContext;
await handlers.get('session_start')?.({},context);
const emitRun=async()=>{await handlers.get('before_agent_start')?.({prompt:'public fixture plan'},context);await handlers.get('message_end')?.({message:{role:'assistant',stopReason:'stop',model:'local-fixture',usage:{input:2,output:1,cost:{input:0,output:0,total:0}}}},context);await handlers.get('agent_settled')?.({},context);};
await emitRun();setInterval(()=>{void emitRun();},500);
const plan=await startPiPlanReview('# 方案 1：仅评阅公开夹具',{runId:'orphan-fixture',mode:'plan',openReview:async()=>{},onFeedback:async()=>{}});
stage('plan_ready');
const webDirectory=await fs.mkdtemp(path.join(os.tmpdir(),'slash-orphan-web-')),web=new PiWebAccess({directory:webDirectory});
try{await web.call('get_search_content',{responseId:'missing-fixture-result'});}catch(error){
 // A genuine missing-result response proves the MCP server answered. A
 // startup/transport failure must not emit a false ready handshake.
 if(!(error instanceof Error)||!error.message.startsWith('PI_WEB_TOOL_FAILED:'))throw error;
}
stage('web_ready');
process.stdout.write(JSON.stringify({type:'ready',pid:process.pid,reviewUrl:plan.url,webDirectory})+'\n');
createInterface({input:process.stdin}).on('line',line=>{if(line==='exit')process.exit(0);});
