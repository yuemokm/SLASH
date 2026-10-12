import assert from 'node:assert/strict';
import test from 'node:test';
import {randomUUID} from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {Store} from '../main/store.js';
import {createAgentSession,DefaultResourceLoader,ModelRuntime,SessionManager,SettingsManager} from '@earendil-works/pi-coding-agent';
import {InMemoryCredentialStore} from '@earendil-works/pi-ai';
import {RunInputQueue,type RunInputRuntime} from '../main/run-inputs.js';
import {recoverRunInputs,RUN_INPUT_LIMITS,runInputEnqueueSchema,type RunInputRecord} from '../shared/run-inputs.js';

function fixture(prepareUserInput:((text:string)=>Promise<string>)=async text=>text){
 let records:RunInputRecord[]=[],allowed=true;const calls:Array<{mode:string;text:string}>=[],pending={steering:[] as string[],followUp:[] as string[]};
 const runtime:RunInputRuntime={isStreaming:false,steer:async text=>{calls.push({mode:'steer',text});pending.steering.push(text);},followUp:async text=>{calls.push({mode:'follow_up',text});pending.followUp.push(text);},clearQueue:()=>{const result={steering:[...pending.steering],followUp:[...pending.followUp]};pending.steering=[];pending.followUp=[];return result;}};
 const queue=new RunInputQueue({runId:'run',read:()=>records,write:value=>{records=structuredClone(value);},assertCurrent:()=>{if(!allowed)throw Error('withdrawn secret');},prepareUserInput,now:()=>new Date('2026-10-07T00:00:00.000Z')});
 const enqueue=(text:string,delivery:'steer'|'follow_up'='steer',requestId=randomUUID())=>queue.enqueue({runId:'run',requestId,text,delivery});
 return{queue,runtime,enqueue,calls,pending,records:()=>structuredClone(records),allow:(value:boolean)=>{allowed=value;},stream:()=>{Object.defineProperty(runtime,'isStreaming',{value:true,configurable:true});}};
}

test('durable acceptance waits for a live native loop; mode routes to public Pi queue APIs and submission is not delivery',async()=>{
 const f=fixture(async text=>'prepared:'+text);const first=f.enqueue('补充','steer'),second=f.enqueue('之后核对','follow_up');assert.equal(first.status,'queued');assert.equal(f.records().length,2);
 await f.queue.flush();assert.equal(f.calls.length,0);f.queue.attach(f.runtime);await f.queue.flush();assert.equal(f.calls.length,0);f.stream();await f.queue.flush();assert.equal(f.calls.length,1);assert.equal(f.records()[1].submittedAt,undefined);await f.queue.flushAtBoundary();
 assert.deepEqual(f.calls.map(call=>call.mode),['steer','follow_up']);assert.match(f.calls[0].text,/prepared:补充$/);assert.equal(f.records()[0].status,'queued');assert.equal(typeof f.records()[0].wireHash,'string');
 const delivered=f.queue.observeUserMessage(f.calls[0].text,100);assert.equal(delivered?.id,first.id);assert.equal(delivered?.status,'delivered');assert.equal(f.records()[0].nativeMessageTimestamp,100);assert.equal(f.records()[1].id,second.id);
});

test('request UUID is idempotent; changed payload, foreign Run and forbidden fields fail before native calls',async()=>{
 const f=fixture(),requestId=randomUUID(),a=f.enqueue('原输入','steer',requestId);assert.equal(f.enqueue('原输入','steer',requestId).id,a.id);assert.equal(f.records().length,1);
 assert.throws(()=>f.enqueue('不同','steer',requestId),/REQUEST_CONFLICT/);assert.throws(()=>f.enqueue('原输入','follow_up',requestId),/REQUEST_CONFLICT/);
 assert.throws(()=>f.queue.enqueue({runId:'other',requestId:randomUUID(),text:'x',delivery:'steer'}),/OTHER_RUN/);
 assert.throws(()=>runInputEnqueueSchema.parse({runId:'run',requestId:randomUUID(),text:'x',delivery:'steer',permissionMode:'full_access'}));assert.equal(f.calls.length,0);
});

test('same text has independent native identity; tampered or model-quoted text cannot acknowledge delivery',async()=>{
 const f=fixture();f.queue.attach(f.runtime);f.stream();const a=f.enqueue('相同'),b=f.enqueue('相同');await f.queue.flush();assert.notEqual(a.id,b.id);assert.notEqual(f.calls[0].text,f.calls[1].text);
 assert.equal(f.queue.observeUserMessage(f.calls[0].text+'篡改',100),undefined);assert.equal(f.queue.observeUserMessage('模型引用 '+f.calls[0].text,100),undefined);assert.equal(f.queue.observeUserMessage(f.calls[0].text,NaN),undefined);
 f.queue.observeUserMessage(f.calls[1].text,101);assert.deepEqual(f.records().map(record=>record.status),['queued','delivered']);f.queue.observeUserMessage(f.calls[1].text,102);assert.equal(f.records()[1].nativeMessageTimestamp,101);
});

test('async preparation is serialized and cancellation while loading prevents submission',async()=>{
 let release!:(text:string)=>void,started!:()=>void;const began=new Promise<void>(resolve=>{started=resolve;});
 const f=fixture(async()=>{started();return await new Promise<string>(resolve=>{release=resolve;});});f.queue.attach(f.runtime);f.stream();f.enqueue('读取技能');const pumping=f.queue.flush();await began;
 assert.equal(f.queue.flush(),pumping);f.queue.clearQueued();release('expanded');await pumping;assert.equal(f.calls.length,0);assert.equal(f.records()[0].status,'cancelled');
});

test('permissions are checked again after async preparation; revoked input never enters Pi',async()=>{
 let release!:(text:string)=>void,started!:()=>void;const began=new Promise<void>(resolve=>{started=resolve;});const f=fixture(async()=>{started();return await new Promise<string>(resolve=>{release=resolve;});});
 f.queue.attach(f.runtime);f.stream();f.enqueue('补充');const pumping=f.queue.flush();await began;f.allow(false);release('prepared');await pumping;assert.equal(f.calls.length,0);assert.equal(f.records()[0].status,'cancelled');assert.equal(f.records()[0].reason,'RUN_INPUT_PREPARATION_UNAVAILABLE');assert.equal(JSON.stringify(f.records()).includes('secret'),false);
 assert.throws(()=>f.enqueue('新输入'),/withdrawn/);
});

test('clearing native pending entries cancels them while delivered entries remain delivered',async()=>{
 const f=fixture();f.queue.attach(f.runtime);f.stream();f.enqueue('已送达');f.enqueue('尚未送达','follow_up');await f.queue.flushAtBoundary();f.queue.observeUserMessage(f.calls[0].text,100);f.queue.clearQueued();
 assert.deepEqual(f.records().map(record=>record.status),['delivered','cancelled']);await f.queue.flush();assert.equal(f.calls.length,2);assert.deepEqual(f.pending,{steering:[],followUp:[]});
});

test('a native submission rejection is unknown and is never retried; a later real user event can resolve it',async()=>{
 const f=fixture();let attempts=0;f.runtime.steer=async()=>{attempts++;throw Error('sensitive-provider-error');};f.queue.attach(f.runtime);f.stream();f.enqueue('输入');await f.queue.flush();assert.equal(f.records()[0].status,'unknown');
 await f.queue.flush();assert.equal(attempts,1);assert.equal(JSON.stringify(f.records()).includes('sensitive'),false);
});

test('native disappearance without a user event is unknown, never inferred delivered or silently requeued',async()=>{
 const f=fixture();f.queue.attach(f.runtime);f.stream();f.enqueue('输入');await f.queue.flush();f.runtime.clearQueue=()=>({steering:[],followUp:[]});f.queue.clearQueued();assert.equal(f.records()[0].status,'unknown');await f.queue.flush();assert.equal(f.calls.length,1);
 assert.equal(f.queue.observeUserMessage(f.calls[0].text,200)?.status,'delivered');
});

test('message/count/aggregate budgets remain bounded even after cancellation, and expanded skill wire has its own bound',async()=>{
 const f=fixture();assert.throws(()=>f.enqueue('x'.repeat(RUN_INPUT_LIMITS.messageCharacters+1)));for(let i=0;i<RUN_INPUT_LIMITS.messages;i++)f.enqueue('x');f.queue.clearQueued();assert.throws(()=>f.enqueue('extra'),/BUDGET_EXCEEDED/);
 const total=fixture();for(let i=0;i<5;i++)total.enqueue('x'.repeat(20_000));assert.throws(()=>total.enqueue('x'),/BUDGET_EXCEEDED/);
 const expanded=fixture(async()=> 'x'.repeat(RUN_INPUT_LIMITS.wireCharacters));expanded.queue.attach(expanded.runtime);expanded.stream();expanded.enqueue('技能');await expanded.queue.flush();assert.equal(expanded.calls.length,0);assert.equal(expanded.records()[0].reason,'RUN_INPUT_PREPARED_BUDGET_EXCEEDED');
});

test('real SQLite restart preserves delivery receipts; all unconfirmed queue states become unknown without replay',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'slash-run-inputs-'));let store=new Store(dir);t.after(async()=>{store.close();await fs.rm(dir,{recursive:true,force:true});});
 const f=fixture();f.queue.attach(f.runtime);f.stream();f.enqueue('delivered');f.enqueue('submitted');await f.queue.flush();f.queue.observeUserMessage(f.calls[0].text,100);f.enqueue('not submitted');store.set('queue',f.records());store.close();store=new Store(dir);
 const recovered=recoverRunInputs(store.get('queue',[]));assert.deepEqual(recovered.map(record=>record.status),['delivered','unknown','unknown']);store.set('queue',recovered);let calls=0;
 const queue=new RunInputQueue({runId:'run',read:()=>store.get('queue',[]),write:records=>store.set('queue',records),assertCurrent:()=>{},prepareUserInput:async text=>text});queue.attach({isStreaming:true,steer:async()=>{calls++;},followUp:async()=>{calls++;},clearQueue:()=>({steering:[],followUp:[]})});await queue.flush();assert.equal(calls,0);assert.equal(store.get<RunInputRecord[]>('queue',[])[0].nativeMessageTimestamp,100);
});

test('preparation failures retain only actionable categories, never the credential/path/error body',async()=>{
 for(const [code,expected] of [['SKILL_NOT_FOUND','RUN_INPUT_SKILL_NOT_FOUND'],['SKILL_VERSION_CONFLICT','RUN_INPUT_SKILL_CHANGED'],['PERMISSION_DENIED','RUN_INPUT_AUTHORIZATION_CHANGED'],['CANCELLED','RUN_INPUT_CANCELLED'],['RUN_INPUT_NOT_ACTIVE','RUN_INPUT_RUN_ENDED']]){
  const f=fixture(async()=>{throw Error(code+': private-value-secret');});f.queue.attach(f.runtime);f.stream();f.enqueue('输入');await f.queue.flush();assert.equal(f.records()[0].reason,expected);assert.equal(JSON.stringify(f.records()).includes('private-value'),false);assert.equal(f.calls.length,0);
 }
});

test('run termination clears submitted queues and unsent inputs instead of leaving queued state for a future Run',async()=>{
 const f=fixture();f.queue.attach(f.runtime);f.stream();f.enqueue('submitted');await f.queue.flush();f.enqueue('not yet submitted');f.queue.finish();assert.deepEqual(f.records().map(record=>record.status),['cancelled','cancelled']);assert.ok(f.records().every(record=>record.reason==='RUN_INPUT_RUN_ENDED'));await f.queue.flush();assert.equal(f.calls.length,1);
});

test('installed Pi 0.86.1 public steer/followUp clearQueue returns exact mode arrays with no model request',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'slash-native-queue-api-'));let session:Awaited<ReturnType<typeof createAgentSession>>['session']|undefined;
 t.after(async()=>{session?.dispose();await fs.rm(dir,{recursive:true,force:true});});
 const runtime=await ModelRuntime.create({credentials:new InMemoryCredentialStore(),modelsPath:null,refreshOnCreate:false});
 runtime.registerProvider('offline',{baseUrl:'http://127.0.0.1:9/v1',api:'openai-completions',models:[{id:'offline',name:'offline',reasoning:false,input:['text'],contextWindow:65536,maxTokens:12000,cost:{input:0,output:0,cacheRead:0,cacheWrite:0}}]});await runtime.setRuntimeApiKey('offline','offline-placeholder');
 const settings=SettingsManager.inMemory({retry:{enabled:false},compaction:{enabled:false}}),loader=new DefaultResourceLoader({cwd:dir,agentDir:dir,settingsManager:settings,noExtensions:true,noSkills:true,noPromptTemplates:true,noThemes:true,noContextFiles:true});await loader.reload();
 session=(await createAgentSession({cwd:dir,agentDir:dir,modelRuntime:runtime,model:runtime.getModel('offline','offline')!,settingsManager:settings,sessionManager:SessionManager.inMemory(dir),resourceLoader:loader,noTools:'all',tools:[]})).session;
 let queueEvents=0;session.subscribe(event=>{if(event.type==='queue_update')queueEvents++;});await session.steer('first');await session.followUp('later');assert.equal(session.pendingMessageCount,2);assert.deepEqual(session.clearQueue(),{steering:['first'],followUp:['later']});assert.equal(session.pendingMessageCount,0);assert.equal(session.messages.length,0);assert.equal(session.isStreaming,false);assert.equal(queueEvents,3);
});

test('clear during async native submission fences new inputs and removes the late queue insertion without replay',async()=>{
 const f=fixture();let release!:()=>void,started!:()=>void;const began=new Promise<void>(resolve=>{started=resolve;});
 f.runtime.steer=async text=>{f.calls.push({mode:'steer',text});started();await new Promise<void>(resolve=>{release=resolve;});f.pending.steering.push(text);};
 f.queue.attach(f.runtime);f.stream();f.enqueue('late');const pumping=f.queue.flush();await began;f.queue.clearQueued();assert.equal(f.records()[0].status,'unknown');assert.throws(()=>f.enqueue('new while clearing'),/CLEAR_PENDING/);
 release();await pumping;assert.equal(f.records()[0].status,'cancelled');assert.deepEqual(f.pending.steering,[]);assert.equal(f.calls.length,1);f.enqueue('allowed after clear');assert.equal(f.records()[1].status,'queued');
});

test('finish while native submission awaits clears the old session even after it has been detached',async()=>{
 const f=fixture();let release!:()=>void,started!:()=>void;const began=new Promise<void>(resolve=>{started=resolve;});
 f.runtime.steer=async text=>{started();await new Promise<void>(resolve=>{release=resolve;});f.pending.steering.push(text);};f.queue.attach(f.runtime);f.stream();f.enqueue('late');const pumping=f.queue.flush();await began;f.queue.finish();assert.throws(()=>f.enqueue('new'),/NOT_ACTIVE/);release();await pumping;assert.equal(f.records()[0].status,'cancelled');assert.deepEqual(f.pending.steering,[]);
});
