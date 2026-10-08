import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {Store} from '../main/store.js';
import {Service} from '../main/service.js';
import {CapabilityApprovalBroker} from '../main/capabilities.js';
import type {RuntimeOptions} from '../main/agent.js';

function fakeRuntimeFactory(calls:{options?:RuntimeOptions;toolCalls:number}): (options:RuntimeOptions)=>Promise<any>{
 return async options=>{calls.options=options;return{messages:[{role:'assistant',stopReason:'stop'}],prompt:async()=>{if(options.mode==='plan')options.delta('方案 1：快速验证\n步骤：先做核心流程\n取舍：交付快但范围小\n\n方案 2：完整方案\n步骤：覆盖全部场景\n取舍：周期更长');else options.delta('Build 已按批准输入执行。')},abort:async()=>{},dispose:()=>{},sessionFile:undefined};};
}

const waitFor=async(predicate:()=>boolean)=>{const until=Date.now()+3000;while(Date.now()<until){if(predicate())return;await new Promise(resolve=>setTimeout(resolve,10));}throw Error('等待任务状态超时');};

test('Plan reads project rules and index while preserving the read-only proposal until confirmation',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'slash-plan-'));const store=new Store(path.join(dir,'db'));t.after(async()=>{store.close();await fs.rm(dir,{recursive:true,force:true});});
 const calls={toolCalls:0} as {options?:RuntimeOptions;toolCalls:number};const service=new Service(store,()=> 'secret',()=>{},fakeRuntimeFactory(calls));await service.workspace(path.join(dir,'workspace'));await fs.writeFile(path.join(service.state.root,'AGENTS.md'),'# 产品工作规则\n手工要求不得提升权限\n');const conversation=service.conversation();
 const planId=await service.send(conversation,'设计审批原型','plan','standard');await waitFor(()=>service.state.runs.find(run=>run.id===planId)?.status==='awaiting_plan');const plan=service.state.runs.find(run=>run.id===planId);assert.equal(plan?.mode,'plan');assert.equal(plan?.status,'awaiting_plan');assert.equal(plan?.proposal?.status,'pending');assert.equal(calls.options?.mode,'plan');assert.match(calls.options?.workspaceRules??'',/产品工作规则/);assert.match(calls.options?.agentIndex??'',/已应用项目结构/);assert.equal(calls.options?.permissionMode,'standard');assert.equal(calls.toolCalls,0);
 const buildId=await service.confirmPlan(planId,['option-2'],'请先实现登录页面','full_access');await waitFor(()=>service.state.runs.find(run=>run.id===buildId)?.status==='succeeded');assert.equal(service.state.runs.find(run=>run.id===planId)?.proposal?.approvedInput,'方案 2：完整方案\n步骤：覆盖全部场景\n取舍：周期更长\n\n请先实现登录页面');assert.equal(service.state.runs.find(run=>run.id===buildId)?.sourcePlanRunId,planId);assert.equal(await service.confirmPlan(planId,['option-2'],'请先实现登录页面','full_access'),buildId);
});

test('Full access does not override explicit deny and Plan broker rejects write tools',async()=>{
 const records:any[]=[];const broker=new CapabilityApprovalBroker(()=>({workspace_read:'deny',web_read:'ask',connection_config:'ask',process_execute:'ask',external_action:'ask',artifact_write:'ask'}),records,()=>{},undefined,()=>true,()=> 'full_access',()=> 'plan');
 await assert.rejects(broker.execute({runId:'r',conversationId:'c',capability:'process_execute',summary:'run'},async()=>1),/PLAN_TOOL_DENIED/);
 const buildBroker=new CapabilityApprovalBroker(()=>({workspace_read:'deny',web_read:'ask',connection_config:'ask',process_execute:'ask',external_action:'ask',artifact_write:'ask'}),records,()=>{},undefined,()=>true,()=> 'full_access',()=> 'build');
 await assert.rejects(buildBroker.execute({runId:'r',conversationId:'c',capability:'workspace_read',summary:'read'},async()=>1),/PERMISSION_DENIED/);
});
