import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {Store} from '../main/store.js';
import {Service} from '../main/service.js';
import {RunInputQueue} from '../main/run-inputs.js';
import type {Run} from '../shared/types.js';

test('Service repeated disposal and Store close finish each queue once, preserving cancellation and unknown receipts',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'slash-service-lifecycle-')),store=new Store(dir),service=new Service(store,()=>'',()=>{});
 t.after(async()=>fs.rm(dir,{recursive:true,force:true}));
 const time=new Date().toISOString(),run:Run={id:randomUUID(),conversationId:'fixture',status:'running',startedAt:time,inputs:[
  {id:randomUUID(),requestId:randomUUID(),text:'尚未送出',delivery:'follow_up',status:'queued',createdAt:time},
  {id:randomUUID(),requestId:randomUUID(),text:'原生提交未确认',delivery:'steer',status:'queued',createdAt:time,submittedAt:time,wireHash:'a'.repeat(64)},
 ]};service.state.runs.push(run);
 let finishes=0;const queue=new RunInputQueue({runId:run.id,read:()=>run.inputs,write:records=>{run.inputs=records;service.save();},assertCurrent:()=>{},prepareUserInput:async text=>text});
 const finish=queue.finish.bind(queue);queue.finish=()=>{finishes++;finish();};
 (service as any).inputQueues.set(run.id,queue);service.dispose();service.dispose();
 assert.equal(finishes,1);assert.deepEqual(store.get<any>('state',{}).runs[0].inputs.map((input:any)=>input.status),['cancelled','unknown']);
 const before=store.eventCursor('global');queue.finish();assert.equal(store.eventCursor('global'),before,'finished queue does not write or emit a second time');
 store.close();assert.doesNotThrow(()=>service.dispose());assert.equal(finishes,2,'explicit repeated queue finish was the only additional call; Store close did not dispose twice');
});

test('disposal does not suppress a queue persistence failure',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'slash-service-disposal-error-')),store=new Store(dir),service=new Service(store,()=>'',()=>{});
 t.after(async()=>{store.close();await fs.rm(dir,{recursive:true,force:true});});
 (service as any).inputQueues.set('fault',{finish:()=>{throw Error('PERSISTENCE_FAILURE');}});
 assert.throws(()=>service.dispose(),/PERSISTENCE_FAILURE/);
});
