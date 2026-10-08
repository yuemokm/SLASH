import assert from 'node:assert/strict';
import test from 'node:test';
import {RuntimeEventObserver} from '../main/runtime-events.js';

const observer=()=>new RuntimeEventObserver(text=>text.replaceAll('fake-secret','[REDACTED]'),()=>new Date('2026-10-07T00:00:00Z'));
test('retry events preserve actual attempt, configured bound, delay and scrubbed diagnostic without fake progress',()=>{
 const events=observer();const waiting=events.observe({type:'auto_retry_start',attempt:2,maxAttempts:3,delayMs:4000,errorMessage:'network fake-secret'});assert.equal(waiting?.activity,'retry_wait');assert.deepEqual(waiting?.retry,{attempt:2,maxAttempts:3,delayMs:4000,status:'waiting',error:'network [REDACTED]'});
 const done=events.observe({type:'auto_retry_end',attempt:2,success:false,finalError:'fake-secret unavailable'});assert.equal(done?.retry?.status,'failed');assert.equal(done?.retry?.attempt,2);assert.equal(done?.retry?.maxAttempts,3);assert.equal(JSON.stringify(done).includes('fake-secret'),false);
 assert.equal(events.observe({type:'auto_retry_start',attempt:-1,maxAttempts:3,delayMs:NaN}),undefined);assert.equal(events.snapshot()?.retry?.attempt,2);
});
test('compaction success/failure/cancellation and summary retries come from explicit native events',()=>{
 const events=observer();assert.equal(events.observe({type:'compaction_start',reason:'overflow'})?.compaction?.status,'running');
 events.observe({type:'summarization_retry_scheduled',attempt:1,maxAttempts:2,delayMs:1000,errorMessage:'fake-secret'});assert.equal(events.observe({type:'summarization_retry_attempt_start',source:'compaction'})?.summaryRetry?.status,'running');
 assert.equal(events.observe({type:'summarization_retry_finished'})?.summaryRetry?.status,'completed');
 const done=events.observe({type:'compaction_end',reason:'overflow',result:{summary:'private summary not to expose'},aborted:false,willRetry:true});assert.equal(done?.compaction?.status,'completed');assert.equal(done?.compaction?.willRetry,true);assert.equal(JSON.stringify(done).includes('private summary'),false);
 assert.equal(events.observe({type:'compaction_end',reason:'threshold',aborted:false,willRetry:false,errorMessage:'fake-secret'})?.compaction?.status,'failed');
 assert.equal(events.observe({type:'compaction_end',reason:'manual',aborted:true,willRetry:false})?.compaction?.status,'cancelled');
});
test('estimated context uses Pi numbers; unknown post-compaction context stays null and over-capacity is not clamped',()=>{
 const events=observer();assert.deepEqual(events.observeContext({tokens:70000,contextWindow:65536,percent:106.8})?.context,{tokens:70000,contextWindow:65536,percent:106.8,source:'pi-estimate'});
 assert.deepEqual(events.observeContext({tokens:null,contextWindow:65536,percent:null})?.context,{tokens:null,contextWindow:65536,percent:null,source:'pi-estimate'});
 assert.equal(events.observeContext({tokens:1,contextWindow:0,percent:1}),undefined);assert.equal(events.observeContext({tokens:NaN,contextWindow:65536,percent:NaN}),undefined);assert.equal(events.snapshot()?.context?.tokens,null);
});
test('whitelist ignores thinking/body/key/queue content; assistant numeric usage alone crosses the boundary',()=>{
 const events=observer();assert.equal(events.observe({type:'message_update',assistantMessageEvent:{type:'thinking_delta',delta:'fake-secret'}}),undefined);assert.equal(events.observe({type:'queue_update',steering:['fake-secret'],followUp:[]}),undefined);
 const message={role:'assistant',usage:{input:4,output:7,cacheRead:3,cacheWrite:0,totalTokens:14,cost:{total:999}},get content(){throw Error('must not inspect private content');},model:'fake-secret',errorMessage:'fake-secret'};
 const result=events.observe({type:'message_end',message});assert.deepEqual(result?.lastUsage,{input:4,output:7,cacheRead:3,cacheWrite:0,totalTokens:14});assert.equal(JSON.stringify(result).includes('fake-secret'),false);assert.equal(JSON.stringify(result).includes('cost'),false);
 assert.equal(events.observe({type:'message_end',message:{role:'assistant',usage:{input:1,output:NaN}}}),undefined);assert.equal(events.observe({type:'message_end',message:{role:'user',usage:message.usage}}),undefined);
});
test('snapshots are detached and native activity transitions do not claim task completion',()=>{
 const events=observer();events.observe({type:'agent_start'});assert.equal(events.observe({type:'tool_execution_start'})?.activity,'tool');assert.equal(events.observe({type:'tool_execution_end'})?.activity,'model');const snapshot=events.observe({type:'agent_settled'});assert.equal(snapshot?.activity,'settled');assert.equal('succeeded'in snapshot!,false);snapshot!.activity='model';assert.equal(events.snapshot()?.activity,'settled');
});
