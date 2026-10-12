import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {captureUnfinishedProductionStep} from '../scripts/production-agent-trial.mjs';

async function setup(t:any,status:string){
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'slash-production-cleanup-'));t.after(()=>fs.rm(dir,{recursive:true,force:true,maxRetries:3}));const caseDir=path.join(dir,'cases','QE01');await fs.mkdir(caseDir,{recursive:true});const startPath=path.join(caseDir,'production-start.json');await fs.writeFile(startPath,JSON.stringify({caseId:'QE01',modelConfiguration:{id:'fixture-model'}}));const start={path:startPath,sha256:createHash('sha256').update(await fs.readFile(startPath)).digest('hex')};const run:any={id:'actual-run',status,startedAt:new Date().toISOString(),reasoning:{effectiveLevel:'off'},modelRoute:{entryId:'fixture-model',modelId:'fixture',provider:'fixture',fallbackUsed:false},runtimeStatus:{context:{contextWindow:65536},requestDiagnostics:{source:'pi-on-payload',thinkingType:'disabled',reasoningEffort:'absent'}}};const state={runs:[run],changes:[],models:[{id:'fixture-model',provider:'fixture',modelId:'fixture',protocol:'openai-completions'}]};return{start,run,state,caseDir};
}

test('timeout cleanup observes true cancellation and retains original failure separately',async t=>{
 const f=await setup(t,'running'),requests:string[]=[],receipt:any={status:'failed',reason:'EVALUATION_REAL_TASK_TIMEOUT'};
 const call=async(input:any)=>{requests.push(input.type);if(input.type==='cancel'){f.run.status='cancelling';return;}if(input.type==='state'){if(f.run.status==='cancelling'){f.run.status='cancelled';f.run.finishedAt=new Date().toISOString();}return f.state;}if(input.type==='runCheckpoint')return{completedOperations:[]};if(input.type==='operations')return[];throw Error('UNEXPECTED_REQUEST');};
 receipt.productionCleanup=await captureUnfinishedProductionStep({start:f.start,call,runId:f.run.id,index:1,observeMs:100,pollMs:1});const body=JSON.parse(await fs.readFile(receipt.productionCleanup.evidence.path,'utf8'));
 assert.equal(receipt.reason,'EVALUATION_REAL_TASK_TIMEOUT');assert.equal(receipt.status,'failed');assert.equal(body.run.status,'cancelled');assert.equal(body.terminationObservation.observation.status,'terminal');assert.equal(body.effectiveParameters.maxOutputTokens,'provider_default_observed_omission');assert.ok(requests.every(type=>['cancel','state','runCheckpoint','operations'].includes(type)));
});

test('unexpected approval preserves waiting status and unknown finish when bounded cancellation cannot complete',async t=>{
 const f=await setup(t,'waiting_user'),receipt:any={status:'failed',reason:'EVALUATION_UNEXPECTED_APPROVAL'};const call=async(input:any)=>input.type==='state'?f.state:input.type==='runCheckpoint'?{completedOperations:[]}:input.type==='operations'?[]:undefined;
 const began=Date.now();receipt.productionCleanup=await captureUnfinishedProductionStep({start:f.start,call,runId:f.run.id,index:1,observeMs:20,pollMs:5,requestMs:20});const body=JSON.parse(await fs.readFile(receipt.productionCleanup.evidence.path,'utf8'));
 assert.equal(receipt.reason,'EVALUATION_UNEXPECTED_APPROVAL');assert.equal(body.run.status,'waiting_user');assert.equal(body.run.finishedAt,'unknown');assert.equal(body.terminationObservation.observation.status,'non_terminal');assert.ok(Date.now()-began<1000);assert.equal(body.firstDraft,'unknown');
});

test('cancel failure is retained while actual nonterminal identity remains available',async t=>{
 const f=await setup(t,'running');const call=async(input:any)=>{if(input.type==='cancel')throw Error('ACTUAL_CANCEL_FAILURE');if(input.type==='state')return f.state;if(input.type==='runCheckpoint')return{completedOperations:[]};if(input.type==='operations')return[];throw Error('UNEXPECTED_REQUEST');};const result=await captureUnfinishedProductionStep({start:f.start,call,runId:f.run.id,index:1,observeMs:0});
 assert.equal(result.cancellation.status,'failed');assert.equal(result.cancellation.error,'ACTUAL_CANCEL_FAILURE');const body=JSON.parse(await fs.readFile(result.evidence.path,'utf8'));assert.equal(body.run.status,'running');assert.equal(body.run.finishedAt,'unknown');assert.equal(body.terminationObservation.cancellation.error,'ACTUAL_CANCEL_FAILURE');
 await assert.rejects(fs.writeFile(result.evidence.path,'replacement',{flag:'wx'}),/EEXIST/);
});

test('unresponsive cleanup request is bounded and cannot fabricate a captured Run',async t=>{
 const f=await setup(t,'running');const result=await captureUnfinishedProductionStep({start:f.start,runId:f.run.id,index:1,observeMs:20,requestMs:10,call:async()=>new Promise(()=>{})});assert.equal(result.cancellation.error,'PRODUCTION_EVIDENCE_REQUEST_TIMEOUT');assert.equal(result.observation.status,'unavailable');assert.equal(result.evidence,undefined);assert.equal(result.error,'PRODUCTION_EVIDENCE_REQUEST_TIMEOUT');
});
