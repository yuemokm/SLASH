// Test-only independent host process; never production registered.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {Service} from '../../main/service.ts';
import {Store} from '../../main/store.ts';
import {createPiMcpSession} from '../../main/pi-mcp-runtime.ts';
const fixture=JSON.parse(await fs.readFile(process.argv[2],'utf8'));
const loader=pathToFileURL(createRequire(import.meta.url).resolve('tsx')).href;
const store=new Store(fixture.profile);let service,phaseEvidence,closed=false;
let before,after,result,noCreateTool=false;
try{
 service=new Service(store,()=> 'SYNTHETIC_NO_MODEL',()=>{},async()=>{throw Error('MODEL_NOT_AUTHORIZED');},{fetchModelMetadata:async()=>{throw Error('OFFLINE');},prototypePublicationTarget:()=>({adapterId:fixture.adapterId,siteId:'fixture-site',factory:async input=>{
  assert.equal(input.configuration.version,'netlify-static-recovery-v1');
  assert.equal('files' in input.configuration,false);assert.equal('token' in input.configuration,false);
  const configPath=path.join(fixture.dir,'recovery-worker-phase.json'),evidencePath=configPath+'.pid';
  await fs.writeFile(configPath,JSON.stringify({...input,configuration:input.configuration,origin:fixture.origin,fixtureOrigin:fixture.origin,token:'SYNTHETIC_NO_ACCOUNT',hostPid:process.pid,evidencePath}));
  const session=await createPiMcpSession({command:process.execPath,args:['--import',loader,path.join(fixture.candidate,'scripts/netlify-static-phase-stdio.mjs'),configPath],cwd:fixture.candidate,beforeDispatch:input.beforeDispatch});
  assert.deepEqual(session.names(),['static_status']);
  await assert.rejects(session.call('static_create',{}),/MCP_TOOL_NOT_DECLARED/);noCreateTool=true;
  return{call:session.call,close:async()=>{await session.close();phaseEvidence=JSON.parse(await fs.readFile(evidencePath,'utf8'));let alive=true;try{process.kill(phaseEvidence.pid,0);}catch{alive=false;}assert.equal(alive,false);phaseEvidence={...phaseEvidence,alive,closed:true};}};
 }})},()=>undefined);
 before=store.operationsForRun(fixture.runId).find(o=>o.id===fixture.operationId).result;
 assert.equal(before,fixture.originalResult,'constructor preserves exact original JSON bytes');
 assert.equal(service.listExternalActions().find(a=>a.id===fixture.proposalId).status,'outcome_unknown');
 result=await service.executePrototypePublication(fixture.proposalId,fixture.operationId,'status');
 assert.equal(result.status,'succeeded');after=store.operationsForRun(fixture.runId).find(o=>o.id===fixture.operationId).result;
}finally{
 service?.dispose();if(service)await Promise.allSettled([...service.agentIndex.queues.values()]);store.close();closed=true;
 await fs.writeFile(fixture.resultPath,JSON.stringify({workerPid:process.pid,parentPid:process.ppid,before,after,result,phaseEvidence,noCreateTool,storeClosed:closed,modelCalls:0,scope:'synthetic_local_http_actual_Store_Service_Pi_stdio',cloud:false,compiledElectron:false,crash:false},null,2));
}
