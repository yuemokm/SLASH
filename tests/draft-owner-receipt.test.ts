import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {DraftEditDomain,type DraftEditHost} from '../main/draft-edit.js';
import {PrototypeAcceptanceDomain} from '../main/prototype-acceptance.js';
import {Store} from '../main/store.js';
import {Files,hash} from '../main/files.js';
import type {Change} from '../shared/types.js';
import type {DraftReadReceipt,DraftEditReceipt} from '../shared/draft-edit.js';

async function fixture(t:test.TestContext){
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'slash-draft-owner-')),root=path.join(dir,'project');await fs.mkdir(root);
 const store=new Store(path.join(dir,'profile')),files=new Files(()=>[{id:'out',name:'out',path:root,enabled:true,write:true}]),changes:Change[]=[];
 const pending=(file:string,content:string)=>{const change:Change={id:file,runId:'owner',originRunId:'origin',mountId:'out',path:file,before:null,content,status:'pending',createdAt:'now'};changes.push(change);return change;};
 const entry=pending('index.html','<!doctype html><html><body>one<script src="app.js"></script></body></html>'),dependency=pending('app.js','window.ready=true;');
 const allowed=(runId:string,c:Change)=>runId===c.runId||runId==='resumed'&&c.runId==='owner';
 const host:DraftEditHost={files,changes:()=>changes,assertAllowed:()=>{},assertOrdinaryChange:()=>{},canUsePending:allowed,transaction:async(_target,_run,operation)=>operation(),commit:c=>{const old=changes.find(item=>item.id===c.id);if(old)Object.assign(old,c);else changes.push(c);}};
 const drafts=new DraftEditDomain(host),prototypes=new PrototypeAcceptanceDomain({store,files,root:()=>root,authorization:()=> 'unchanged-authority',assertRead:()=>{},assertWrite:()=>{},changes:()=>changes,runActive:()=>true,assertRunAccess:id=>{if(!['owner','resumed'].includes(id))throw Error('PERMISSION_DENIED');},assertDraftAccess:(c,runId)=>{if(!runId||!allowed(runId,c))throw Error('PERMISSION_DENIED');}});
 const target={mountId:'out',path:'index.html'},ctx={mode:'build' as const,runId:'resumed'};
 const ref=(receipt:DraftReadReceipt|DraftEditReceipt)=>({changeId:receipt.changeId!,expectedContentHash:receipt.contentHash,parentRunId:receipt.parentRunId!});
 t.after(async()=>{prototypes.dispose();store.close();assert.equal(path.dirname(dir),os.tmpdir());await fs.rm(dir,{recursive:true,force:true,maxRetries:5,retryDelay:30});});
 return{root,entry,dependency,drafts,prototypes,target,ctx,ref};
}

test('pending read exposes actual owner instead of resumed caller/origin and its receipt can bind prototype draft',async t=>{
 const f=await fixture(t),read=await f.drafts.read('resumed',f.target);
 assert.equal(read.parentRunId,'owner');assert.notEqual(read.parentRunId,f.ctx.runId);assert.notEqual(read.parentRunId,f.entry.originRunId);assert.equal(f.entry.runId,'owner','reading does not transfer ownership');
 const snapshot=await f.prototypes.snapshotForTask({...f.target,draft:{...f.ref(read)}},f.ctx);assert.equal(snapshot.content,f.entry.content);
 await assert.rejects(f.prototypes.snapshotForTask({...f.target,draft:{...f.ref(read),parentRunId:f.ctx.runId}},f.ctx),/归属不一致/);
 await assert.rejects(f.drafts.read('resumed',{...f.target,parentRunId:'resumed'} as any),/parentRunId/);
 await assert.rejects(f.drafts.edit('resumed',{...f.target,changeId:read.changeId,expectedContentHash:read.contentHash,parentRunId:'resumed',oldText:'one',newText:'forged-owner'} as any),/parentRunId/);assert.equal(f.entry.runId,'owner');assert.equal(f.entry.content,read.content);
 await assert.rejects(f.drafts.read('unrelated',f.target),/DRAFT_OTHER_RUN/);
});

test('resumption edit receipt returns new committed owner; stale owner and mixed dependency owner guesses still reject',async t=>{
 const f=await fixture(t),read=await f.drafts.read('resumed',f.target),dependencyRead=await f.drafts.read('resumed',{mountId:'out',path:'app.js'});
 const edited=await f.drafts.edit('resumed',{...f.target,changeId:read.changeId,expectedContentHash:read.contentHash,oldText:'one',newText:'two'});
 assert.equal(edited.parentRunId,'resumed');assert.equal(edited.parentRunId,f.entry.runId);assert.equal(f.entry.originRunId,'origin');assert.equal(edited.changeId,read.changeId);assert.equal((await f.drafts.read('resumed',f.target)).parentRunId,'resumed');
 await assert.rejects(f.prototypes.snapshotForTask({...f.target,draft:{...f.ref(edited),parentRunId:read.parentRunId!}},f.ctx),/归属不一致/);
 await assert.rejects(f.prototypes.snapshotForTask({...f.target,draft:{...f.ref(edited),dependencies:[{changeId:dependencyRead.changeId!,expectedContentHash:dependencyRead.contentHash}]}},f.ctx),/归属不一致/);
 const snapshot=await f.prototypes.snapshotForTask({...f.target,draft:{...f.ref(edited),dependencies:[f.ref(dependencyRead)]}},f.ctx);
 assert.equal(snapshot.manifest.find(item=>item.path==='app.js')?.draft?.parentRunId,'owner');assert.equal(f.dependency.runId,'owner');assert.equal(snapshot.content,f.entry.content);await assert.rejects(fs.stat(path.join(f.root,'index.html')),/ENOENT/);
});

test('applied read omits parentRunId and first edit returns actual new pending owner without a fabricated ancestor',async t=>{
 const f=await fixture(t),target={mountId:'out',path:'formal.md'};await fs.writeFile(path.join(f.root,target.path),'formal body');
 const read=await f.drafts.read('resumed',target);assert.equal(read.source,'applied');assert.equal(Object.hasOwn(read,'changeId'),false);assert.equal(Object.hasOwn(read,'parentRunId'),false);
 const edited=await f.drafts.edit('resumed',{...target,expectedContentHash:read.contentHash,oldText:'formal',newText:'pending'});
 assert.equal(edited.parentRunId,'resumed');assert.equal(edited.baseHash,hash('formal body'));assert.equal((await f.drafts.read('resumed',target)).parentRunId,'resumed');assert.equal(await fs.readFile(path.join(f.root,target.path),'utf8'),'formal body');
});
