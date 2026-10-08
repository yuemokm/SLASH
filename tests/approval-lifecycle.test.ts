import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {CapabilityApprovalBroker,type ApprovalRecord} from '../main/capabilities.js';
import {Service} from '../main/service.js';
import {Store} from '../main/store.js';
import {isApprovalActionable,toolApprovalTimeoutMs} from '../shared/approval.js';
import type {PermissionSettings,PermissionMode,AgentMode} from '../shared/types.js';
import type {RuntimeOptions} from '../main/agent.js';

const permissions=():PermissionSettings=>({workspace_read:'allow',web_read:'ask',connection_config:'ask',process_execute:'ask',external_action:'ask',artifact_write:'ask'});
const input={runId:'run',conversationId:'chat',capability:'web_read' as const,summary:'读取网页'};

function fixture(){
 const policy=permissions(),records:ApprovalRecord[]=[],writes:string[]=[];
 const live={active:true,permissionMode:'standard' as PermissionMode,mode:'build' as AgentMode};
 const broker=new CapabilityApprovalBroker(()=>policy,records,()=>{},(capability,decision)=>{writes.push(`${capability}:${decision}`);policy[capability]=decision;},()=>live.active,()=>live.permissionMode,()=>live.mode);
 return{broker,records,policy,writes,live};
}

test('Full access Run permits every ask capability without creating approvals, preserving deny and Plan restrictions',async()=>{
 const f=fixture();f.live.permissionMode='full_access';let calls=0;
 for(const capability of Object.keys(f.policy) as (keyof PermissionSettings)[])await f.broker.execute({...input,capability},async()=>{calls++;});
 assert.equal(calls,6);assert.equal(f.records.length,0);
 f.policy.workspace_read='deny';await assert.rejects(f.broker.execute({...input,capability:'workspace_read'},async()=>{calls++;}),/PERMISSION_DENIED/);
 f.live.mode='plan';await assert.rejects(f.broker.execute({...input,capability:'artifact_write'},async()=>{calls++;}),/PLAN_TOOL_DENIED/);
 assert.equal(calls,6);assert.equal(f.records.length,0);
});

test('Accept edits only skips artifact ask; standard retains genuine live approvals',async()=>{
 const f=fixture();f.live.permissionMode='accept_edits';await f.broker.authorize({...input,capability:'artifact_write'});assert.equal(f.records.length,0);
 const pending=f.broker.authorize(input);assert.equal(f.broker.list().length,1);const id=f.records[0].id;
 assert.equal(isApprovalActionable(f.records[0],[{id:'run',status:'waiting_user'}]),true);
 assert.equal(f.broker.resolve(id,'allow_once').outcome,'resolved');await pending;
 assert.equal(f.policy.web_read,'ask');assert.equal(isApprovalActionable(f.records[0],[{id:'run',status:'running'}]),false);
});

test('Repeated or conflicting decisions preserve original terminal outcome and cannot remember an old permission',async()=>{
 const f=fixture();let calls=0;const execution=f.broker.execute(input,async()=>{calls++;});const id=f.records[0].id;
 const initial=f.broker.resolve(id,'allow_once');assert.equal(initial.status,'allowed');
 assert.equal(f.broker.resolve(id,'allow').outcome,'already_resolved');assert.equal(f.broker.resolve(id,'deny').status,'allowed');
 await execution;assert.equal(calls,1);assert.deepEqual(f.writes,[]);
 assert.equal(f.broker.list().length,0);assert.equal(f.records.length,1);
});

test('Cancellation wins stale approval click; it never dispatches or persists allow',async()=>{
 const f=fixture();let calls=0;const execution=f.broker.execute(input,async()=>{calls++;});const rejected=assert.rejects(execution,/CANCELLED/);const id=f.records[0].id;
 f.live.active=false;f.broker.cancelRun('run');const result=f.broker.resolve(id,'allow');await rejected;
 assert.equal(result.outcome,'cancelled');assert.equal(result.status,'cancelled');assert.equal(calls,0);assert.deepEqual(f.writes,[]);
});

test('Approval followed immediately by cancellation still cannot dispatch a tool',async()=>{
 const f=fixture();let calls=0;const execution=f.broker.execute(input,async()=>{calls++;});const rejected=assert.rejects(execution,/CANCELLED/);
 f.broker.resolve(f.records[0].id,'allow_once');f.live.active=false;f.broker.cancelRun('run');await rejected;assert.equal(calls,0);
});

test('Deadline and ended Run are checked synchronously before remember even when timeout callback has not run',async()=>{
 for(const ended of [false,true]){
  const f=fixture();const pending=f.broker.authorize(input);const rejected=assert.rejects(pending,ended?/CANCELLED/:/APPROVAL_TIMEOUT/);const record=f.records[0];
  if(ended)f.live.active=false;else record.createdAt=new Date(Date.now()-toolApprovalTimeoutMs-1).toISOString();
  const result=f.broker.resolve(record.id,'allow');await rejected;assert.equal(result.outcome,ended?'cancelled':'expired');assert.deepEqual(f.writes,[]);
 }
});

test('Restart expires orphan approvals and old snapshots cannot grant permissions',()=>{
 const record:ApprovalRecord={id:'old',...input,status:'pending',createdAt:new Date().toISOString()};let writes=0;
 const broker=new CapabilityApprovalBroker(permissions,[record],()=>{},()=>{writes++;},()=>true,()=> 'full_access');
 assert.equal(broker.list().length,0);assert.equal(broker.resolve('old','allow').outcome,'expired');assert.equal(writes,0);
 assert.throws(()=>broker.resolve('missing','allow'),/APPROVAL_UNAVAILABLE.*没有执行操作或更改权限/);
 assert.equal(isApprovalActionable({...record,status:'pending'},[{id:'run',status:'interrupted'}]),false);
 assert.equal(isApprovalActionable({...record,status:'pending'},[{id:'run',status:'cancelling'}]),false);
 assert.equal(isApprovalActionable({...record,status:'pending'},[]),false);
});

test('Service restart retains approval audit but returns no stale pending records to either UI endpoint',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'slash-restart-')),store=new Store(path.join(dir,'profile'));
 t.after(async()=>{store.close();await fs.rm(dir,{recursive:true,force:true});});
 const createdAt=new Date().toISOString(),record:ApprovalRecord={id:'old',...input,status:'pending',createdAt};
 store.set('state',{root:'',mounts:[],conversations:[],changes:[],runs:[{id:'run',conversationId:'chat',status:'waiting_user',mode:'build',permissionMode:'full_access',startedAt:createdAt}],connections:[],model:{baseUrl:'https://example.com/v1',id:'fixture',hasKey:false},permissions:permissions(),pendingApprovals:[record]});
 const service=new Service(store,()=>'',()=>{});assert.equal(service.state.runs[0].status,'interrupted');assert.equal(service.state.pendingApprovals?.[0].status,'expired');assert.equal(service.stateSnapshot().pendingApprovals.length,0);assert.equal(service.listPendingApprovals().length,0);
 assert.equal(service.resolveApproval('old','allow').outcome,'expired');assert.equal(service.state.permissions?.web_read,'ask');assert.equal(store.get<{pendingApprovals:ApprovalRecord[]}>('state',{pendingApprovals:[]}).pendingApprovals[0].status,'expired');
});

test('Permission changes wake allowed calls and denied calls cannot be restored by a stale allow click',async()=>{
 const allowed=fixture();const pending=allowed.broker.authorize(input);allowed.policy.web_read='allow';allowed.broker.policyChanged('web_read');await pending;assert.equal(allowed.records[0].status,'allowed');
 const denied=fixture();const blocked=denied.broker.authorize(input);const rejected=assert.rejects(blocked,/PERMISSION_DENIED/);denied.policy.web_read='deny';denied.broker.policyChanged('web_read');await rejected;
 assert.equal(denied.broker.resolve(denied.records[0].id,'allow').status,'denied');assert.deepEqual(denied.writes,[]);
});

test('Deleting a conversation preserves broker record identity and new approvals survive save and workspace switches',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'slash-approvals-')),store=new Store(path.join(dir,'profile'));
 t.after(async()=>{store.close();await fs.rm(dir,{recursive:true,force:true});});
 const service=new Service(store,()=>'',()=>{});await service.workspace(path.join(dir,'one'));const removed=service.conversation(),records=service.state.pendingApprovals;
 service.conversation(removed,undefined,true);service.deleteConversation(removed);assert.equal(service.state.pendingApprovals,records);
 const conversation=service.conversation();const run={id:'live',conversationId:conversation,status:'running',mode:'build' as const,permissionMode:'standard' as const,startedAt:new Date().toISOString()};service.state.runs.unshift(run);
 const broker=(service as unknown as {capabilityBroker:CapabilityApprovalBroker}).capabilityBroker;
 const pending=broker.authorize({...input,runId:'live',conversationId:conversation});assert.equal(service.state.pendingApprovals?.length,1);assert.equal(run.status,'waiting_user');
 const persisted=store.get<{pendingApprovals:ApprovalRecord[]}>('state',{pendingApprovals:[]});assert.equal(persisted.pendingApprovals[0].id,records![0].id);
 service.resolveApproval(records![0].id,'allow_once');await pending;run.status='succeeded';service.save();assert.equal(service.stateSnapshot().pendingApprovals.length,0);assert.equal(service.state.pendingApprovals?.length,1);assert.equal(store.get<{pendingApprovals:ApprovalRecord[]}>('state',{pendingApprovals:[]}).pendingApprovals[0].status,'allowed');await service.workspace(path.join(dir,'two'));
 assert.equal(service.listPendingApprovals().length,0);assert.equal(isApprovalActionable(records![0],service.state.runs),false);
 assert.equal(service.resolveApproval(records![0].id,'allow').outcome,'already_resolved');assert.equal(service.state.permissions?.web_read,'ask');
 await service.workspace(path.join(dir,'one'));assert.equal(service.state.runs.find(item=>item.id==='live')?.status,'succeeded');assert.equal(service.state.pendingApprovals,records);
});

test('New Full access send persists its permission snapshot and normal write tools do not wait for standard ask',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'slash-full-access-')),store=new Store(path.join(dir,'profile'));let options:RuntimeOptions|undefined,calls=0;
 t.after(async()=>{store.close();await fs.rm(dir,{recursive:true,force:true});});
 const service=new Service(store,()=> 'fixture-key',()=>{},async runtime=>{options=runtime;return{messages:[{role:'assistant',stopReason:'stop'}],prompt:async()=>{await runtime.log('write_draft',{},async()=>{calls++;return true;});runtime.delta('已生成草稿');},abort:async()=>{},dispose:()=>{},sessionFile:undefined} as any;});
 await service.workspace(path.join(dir,'workspace'));service.setPermission('artifact_write','ask');const conversation=service.conversation();const id=await service.send(conversation,'生成成果','build','full_access');
 const deadline=Date.now()+3000;while(Date.now()<deadline&&['queued','running','waiting_user'].includes(service.state.runs.find(run=>run.id===id)!.status))await new Promise(resolve=>setTimeout(resolve,10));
 assert.equal(service.state.runs.find(run=>run.id===id)?.status,'succeeded');assert.equal(options?.permissionMode,'full_access');assert.equal(calls,1);assert.equal(service.state.pendingApprovals?.length,0);
 assert.equal(store.get<{runs:{id:string;permissionMode:string}[]}>('state',{runs:[]}).runs.find(run=>run.id===id)?.permissionMode,'full_access');assert.equal(service.state.permissions?.artifact_write,'ask');
 const originalRoot=path.join(dir,'originals');await fs.mkdir(originalRoot);await fs.writeFile(path.join(originalRoot,'source.md'),'original');const mount=await service.mount(originalRoot,false);
 await assert.rejects(service.files.resolve(mount.id,'source.md',true),/PERMISSION_DENIED|只读/);assert.equal(await fs.readFile(path.join(originalRoot,'source.md'),'utf8'),'original');
});
