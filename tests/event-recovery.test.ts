import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {Store} from '../main/store.js';

test('事件日志按 stream 分配单调 sequence，并可从游标补读和去重',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'pm-events-'));const store=new Store(dir);t.after(()=>{store.close();return fs.rm(dir,{recursive:true,force:true});});
 const first=store.appendEvent({type:'state'});const second=store.appendEvent({type:'state'});const run=store.appendEvent({type:'delta',runId:'run-1',streamId:'run:run-1',text:'增量'});
 assert.equal(first.streamId,'global');assert.equal(first.sequence,1);assert.equal(second.sequence,2);assert.equal(run.streamId,'run:run-1');assert.equal(run.sequence,1);assert.notEqual(first.eventId,second.eventId);
 const page=store.replayEvents('global',0,10);assert.equal(page.gap,false);assert.equal(page.latestSequence,2);assert.deepEqual(page.events.map(item=>item.sequence),[1,2]);
 const after=store.replayEvents('global',1,10);assert.deepEqual(after.events.map(item=>item.eventId),[second.eventId]);assert.equal(store.eventCursor('run:run-1'),1);
});

test('事件补读窗口丢失时显式报告 gap，避免把不完整增量当作完整状态',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'pm-event-gap-'));const store=new Store(dir);t.after(()=>{store.close();return fs.rm(dir,{recursive:true,force:true});});
 // Retention is intentionally bounded; inserting 5,001 events leaves the
 // first sequence outside the reconnect window.
 for(let i=0;i<5002;i++)store.appendEvent({type:'status',text:String(i)});
 const replay=store.replayEvents('global',0,5);assert.equal(replay.gap,true);assert.ok(replay.earliestSequence>1);assert.equal(replay.events.length,5);assert.equal(replay.events[0]?.sequence,replay.earliestSequence);
});

test('旧数据库只含 kv/operations 时自动创建事件表并保持可读',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'pm-events-legacy-'));const first=new Store(dir);first.set('legacy',{ok:true});first.close();
 const store=new Store(dir);t.after(()=>{store.close();return fs.rm(dir,{recursive:true,force:true});});assert.deepEqual(store.get('legacy',{ok:false}),{ok:true});const event=store.appendEvent({type:'state'});assert.equal(event.sequence,1);assert.equal(store.replayEvents('global').events.length,1);
});
