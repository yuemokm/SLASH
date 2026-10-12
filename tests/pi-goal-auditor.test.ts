import test from 'node:test';
import assert from 'node:assert/strict';
import {createPiGoalAuditor,PI_GOAL_AUDITOR_TOOL_NAMES,type PiGoalAuditorOptions,type PiGoalAuditRequest} from '../main/pi-goal-auditor.js';
import type {ToolDefinition} from '@earendil-works/pi-coding-agent';
const request={ctx:{},goal:{},detailedSummary:'fixture'} as PiGoalAuditRequest;
function options(patch:Partial<PiGoalAuditorOptions>={}):PiGoalAuditorOptions{return{runId:'parent',cwd:'.',agentDir:'.',modelRuntime:{} as PiGoalAuditorOptions['modelRuntime'],model:{} as PiGoalAuditorOptions['model'],tools:[],deadlineAt:Date.now()+30_000,assertCurrent:()=>{},onUsage:()=>{},acceptCompletion:async()=>true,...patch};}
test('goal auditor rejects missing parent/deadline and duplicate gateway tools',()=>{
 assert.throws(()=>createPiGoalAuditor(options({runId:''}),async()=>({approved:true,disapproved:false,output:'x'})),/INVALID_PARENT/);
 assert.throws(()=>createPiGoalAuditor(options({deadlineAt:Infinity}),async()=>({approved:true,disapproved:false,output:'x'})),/INVALID_PARENT/);
 const tool={name:'read_file'} as ToolDefinition;assert.throws(()=>createPiGoalAuditor(options({tools:[tool,tool]}),async()=>({approved:true,disapproved:false,output:'x'})),/DUPLICATE_TOOLS/);
 for(const forbidden of ['bash','powershell','read','write_draft','edit_draft','delegate_readonly','configure_connection','propose_external_action'])assert.equal(PI_GOAL_AUDITOR_TOOL_NAMES.has(forbidden),false);
});
test('pre-aborted parent and expired deadline never call upstream or discover credentials',async()=>{
 let calls=0;const run=async()=>{calls++;return{approved:true,disapproved:false,output:'x'};};
 const controller=new AbortController();controller.abort();assert.equal((await createPiGoalAuditor(options({signal:controller.signal}),run)(request)).error,'CANCELLED');
 assert.equal((await createPiGoalAuditor(options({deadlineAt:Date.now()-1}),run)(request)).error,'TIME_BUDGET_EXCEEDED');assert.equal(calls,0);
});
test('live parent permission and unknown outcome guards are enforced before upstream',async()=>{
 let calls=0;const run=async()=>{calls++;return{approved:true,disapproved:false,output:'x'};};
 for(const reason of ['PERMISSION_DENIED','SIDE_EFFECT_UNKNOWN','TOOL_BUDGET_EXCEEDED']){const result=await createPiGoalAuditor(options({assertCurrent:()=>{throw Error(reason);}}),run)(request);assert.equal(result.approved,false);assert.equal(result.error,reason);}
 assert.equal(calls,0);
});
test('upstream verdict without a real completed auditor session cannot approve',async()=>{
 const result=await createPiGoalAuditor(options(),async args=>{assert.equal(args.settings?.auditorProjectResources,false);assert.ok(args.createSession);return{approved:true,disapproved:false,output:'<approved/>'};})(request);
 assert.equal(result.approved,false);assert.equal(result.error,'PI_GOAL_AUDITOR_RESPONSE_INCOMPLETE');
});
