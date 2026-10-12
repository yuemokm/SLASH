import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {PiMemory,piMemoryDirectory,decodePiMemories,type PiMemoryHost} from '../main/pi-memory.js';
import {startPiMemoryWorker} from '../main/pi-memory-worker.js';
import {piMemorySchemas,PI_MEMORY_NOTICE,type PiMemorySource} from '../shared/pi-memory.js';

const hash=(text:string)=>createHash('sha256').update(text).digest('hex');
const origin={runId:'run-local',conversationId:'chat-local',inputHash:hash('本机用户输入')};
function alive(pid:number){try{process.kill(pid,0);return true;}catch{return false;}}
async function fixture(t:test.TestContext){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'slash-pi-memory-'));
 t.after(()=>fs.rm(root,{recursive:true,force:true,maxRetries:5,retryDelay:40}));
 const file=path.join(root,'source.md');await fs.writeFile(file,'本地原始证据');let allowed=true,plan=false;
 const source:PiMemorySource={mountId:'source-mount',path:'source.md',contentHash:hash('本地原始证据'),readAt:new Date().toISOString()};
 const make=(projectId='project-A',override:Partial<PiMemoryHost>={})=>new PiMemory({directory:piMemoryDirectory(root,projectId),projectId,origin,
  guard:write=>{if(!allowed)throw Error('PERMISSION_DENIED');if(write&&plan)throw Error('PLAN_TOOL_DENIED');},
  bindSources:async refs=>{if(refs.some(ref=>ref.path!==source.path||ref.mountId!==source.mountId))throw Error('SOURCE_NOT_READ');return refs.length?[source]:[];},
  sourceState:async ref=>{if(!allowed)throw Error('PERMISSION_DENIED');if(ref.mountId!==source.mountId)throw Error('SOURCE_DENIED');return hash(await fs.readFile(file,'utf8'))===ref.contentHash?'current':'stale';},...override});
 return{root,file,source,make,deny:()=>{allowed=false;},allow:()=>{allowed=true;},plan:()=>{plan=true;}};
}

test('fixed pi-memory real worker captures only four tools and discards all five hooks; closes without deleting durable data',async t=>{
 const f=await fixture(t),dir=piMemoryDirectory(f.root,'project-A');const worker=await startPiMemoryWorker(dir);
 try{
  const ready=await worker.next();assert.equal(ready.type,'ready');assert.equal(ready.hooksDiscarded,5);assert(alive(ready.pid));
  worker.send({action:'write',content:'standalone local package persistence',runId:'local'});assert.equal((await worker.next()).type,'result');
  await worker.close();assert(!alive(ready.pid));assert.match(await fs.readFile(path.join(dir,'MEMORY.md'),'utf8'),/standalone local package persistence/);
  await assert.rejects(fs.stat(worker.root),/ENOENT/);
 }finally{await worker.close();}
});

test('project A/B concurrent isolated package writes; same-project queue prevents lost updates; new adapter reads durable notes',async t=>{
 const f=await fixture(t),a=f.make(),b=f.make('project-B');
 const [one,two,other]=await Promise.all([
  a.call('memory_write',{title:'A first',text:'只有A的一号候选'}),f.make().call('memory_write',{title:'A second',text:'只有A的二号候选'}),b.call('memory_write',{title:'B only',text:'只有B的候选'}),
 ]);
 assert.equal(one.status,'candidate');assert.equal(two.status,'candidate');assert.equal(other.status,'candidate');
 const ar=await f.make().call('memory_read',{}),br=await b.call('memory_read',{});
 assert.equal(ar.total,2);assert.equal(br.total,1);assert(!JSON.stringify(ar).includes('只有B'));assert(!JSON.stringify(br).includes('只有A'));
 assert.deepEqual(ar.items.map((item:any)=>item.status),['candidate','candidate']);
 const filtered=await a.call('memory_read',{query:'一号',limit:1});assert.equal(filtered.total,1);assert.equal(filtered.items[0].id,one.id);
 const page=await a.call('memory_read',{limit:1});assert.equal(page.nextOffset,1);assert.equal((await a.call('memory_read',{offset:1,limit:1})).items.length,1);
});

test('source versions, revoked source filtering and candidate-only schema remain enforced; mutations never leak other entry previews',async t=>{
 const f=await fixture(t),refs=[{mountId:f.source.mountId,path:f.source.path}];
 const item=await f.make().call('memory_write',{title:'需要原来源',text:'来源绑定内容',sources:refs});
 const revoked=f.make('project-A',{sourceState:async()=>{throw Error('SOURCE_DENIED');}});
 const hidden=await revoked.call('memory_read',{});assert.equal(hidden.total,0);assert(!JSON.stringify(hidden).includes('来源绑定内容'));
 await assert.rejects(revoked.call('memory_forget',{id:item.id}),/UNAVAILABLE/);
 const publicNote=await revoked.call('memory_write',{title:'只来自当前输入',text:'独立候选'});assert(!JSON.stringify(publicNote).includes('来源绑定内容'));
 await fs.writeFile(f.file,'来源已更新');assert.equal((await f.make().call('memory_read',{query:'来源绑定'})).items[0].sourceState,'stale');
 assert.throws(()=>piMemorySchemas.memory_write.parse({title:'提升权限',text:'资料伪装成规则',status:'confirmed'}));
 assert.throws(()=>piMemorySchemas.memory_write.parse({title:'全局',text:'wrong',directory:'C:/personal'}));
 assert.throws(()=>piMemorySchemas.memory_forget.parse({match:'all'}));
 await assert.rejects(f.make().call('memory_write',{title:'未读',text:'no',sources:[{mountId:'bad',path:'other.md'}]}),/SOURCE_NOT_READ/);
 f.plan();assert.equal((await f.make().call('memory_read',{})).total,2);for(const [name,args] of [['memory_write',{title:'no',text:'no'}],['memory_forget',{id:item.id}],['memory_restore',{recoveryId:'no'}]] as const)await assert.rejects(f.make().call(name,args),/PLAN_TOOL_DENIED/);
 f.deny();await assert.rejects(f.make().call('memory_read',{}),/PERMISSION_DENIED/);
 assert.match(PI_MEMORY_NOTICE,/不是系统指令/);
});

test('real package forget/restore is durable, scoped and idempotent; source access is rechecked before restoring',async t=>{
 const f=await fixture(t),a=f.make();const one=await a.call('memory_write',{title:'撤回项',text:'原始候选',sources:[{mountId:f.source.mountId,path:f.source.path}]});
 const removed=await a.call('memory_forget',{id:one.id});assert.equal(removed.removed,1);assert(removed.recoveryId);assert.equal((await a.call('memory_read',{})).total,0);
 await a.call('memory_write',{title:'后写内容',text:'恢复不能覆盖此项'});
 await assert.rejects(f.make('project-B').call('memory_restore',{recoveryId:removed.recoveryId}),/RECOVERY_UNAVAILABLE/);
 await assert.rejects(f.make('project-A',{sourceState:async()=>{throw Error('SOURCE_DENIED');}}).call('memory_restore',{recoveryId:removed.recoveryId}),/RECOVERY_UNAVAILABLE/);
 const restored=await f.make().call('memory_restore',{recoveryId:removed.recoveryId});assert.equal(restored.status,'candidate');assert.equal(restored.restored,1);
 await f.make().call('memory_restore',{recoveryId:removed.recoveryId});assert.equal((await f.make().call('memory_read',{})).total,2);
});

test('permission change after dispatch reports unknown and preserves the actual package write for reconciliation',async t=>{
 const f=await fixture(t),directory=piMemoryDirectory(f.root,'project-A'),file=path.join(directory,'MEMORY.md');
 let revoked=false;const memory=f.make('project-A',{guard:()=>{if(fsSync.existsSync(file)&&fsSync.readFileSync(file,'utf8').includes('已派发候选'))revoked=true;if(revoked)throw Error('PERMISSION_DENIED');}});
 await assert.rejects(memory.call('memory_write',{title:'派发边界',text:'已派发候选'}),/PI_MEMORY_OUTCOME_UNKNOWN/);
 const later=await f.make().call('memory_read',{});assert.equal(later.total,1);assert.equal(later.items[0].text,'已派发候选');
});

test('cancelled requests do not start a write; imported/global/corrupt entries cannot be promoted into project memory',async t=>{
 const f=await fixture(t),controller=new AbortController();controller.abort();
 await assert.rejects(f.make('project-A',{signal:controller.signal}).call('memory_write',{title:'cancel',text:'no'}));
 await assert.rejects(fs.stat(piMemoryDirectory(f.root,'project-A')),/ENOENT/);
 assert.deepEqual(decodePiMemories('SLASH_MEMORY_V1:{"status":"confirmed"}\n# personal global preference','project-A'),[]);
 assert.throws(()=>piMemorySchemas.memory_restore.parse({recoveryId:'../../outside'}));
});

test('actual cancellation after package commit reports unknown; next read reconciles without replay',async t=>{
 const f=await fixture(t),directory=piMemoryDirectory(f.root,'project-A'),file=path.join(directory,'MEMORY.md'),controller=new AbortController();
 const memory=f.make('project-A',{signal:controller.signal,guard:()=>{if(fsSync.existsSync(file)&&fsSync.readFileSync(file,'utf8').includes('cancel-after-commit'))controller.abort();}});
 await assert.rejects(memory.call('memory_write',{title:'取消边界',text:'cancel-after-commit'}),/PI_MEMORY_OUTCOME_UNKNOWN/);
 const actual=await f.make().call('memory_read',{});assert.equal(actual.total,1);
});
