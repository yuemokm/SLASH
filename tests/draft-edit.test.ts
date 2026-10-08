import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {withFileMutationQueue} from '@earendil-works/pi-coding-agent';
import {DraftEditDomain,type DraftEditHost} from '../main/draft-edit.js';
import {Files,hash} from '../main/files.js';
import type {Change,Mount} from '../shared/types.js';

async function fixture(t:test.TestContext,content='alpha\nbeta\ngamma\n'){
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'slash-edit-')),mount={id:'out',name:'成果',path:dir,enabled:true,write:true} as Mount;
 t.after(()=>fs.rm(dir,{recursive:true,force:true,maxRetries:4}));
 const changes:Change[]=[],controller=new AbortController();const flags={plan:false,read:true,write:true,active:true,special:false};
 const files=new Files(()=>[mount]);await fs.writeFile(path.join(dir,'index.html'),content);
 const host:DraftEditHost={files,changes:()=>changes,signal:()=>controller.signal,assertAllowed:(_,write)=>{if(flags.plan)throw Error('PLAN_TOOL_DENIED');if(!flags.active||controller.signal.aborted)throw Error('CANCELLED');if(!flags.read||write&&!flags.write)throw Error('PERMISSION_DENIED');},assertOrdinaryChange:()=>{if(flags.special)throw Error('DRAFT_SPECIAL_TOOL_REQUIRED');},transaction:(_,__,operation)=>withFileMutationQueue(path.join(dir,'transaction'),operation),commit:c=>{const old=changes.find(x=>x.id===c.id);if(old)Object.assign(old,c);else changes.unshift(c);}};
 const domain=new DraftEditDomain(host),target={mountId:'out',path:'index.html'};
 const edit=async(oldText:string,newText:string)=>{const read=await domain.read('run',target);return domain.edit('run',{...target,changeId:read.changeId,expectedContentHash:read.contentHash,oldText,newText});};
 return{dir,mount,changes,controller,flags,files,host,domain,target,edit};
}
test('native Pi edit preserves BOM/CRLF and two edits reuse the same pending card and original before',async t=>{
 const f=await fixture(t,'\uFEFFalpha\r\nbeta\r\ngamma\r\n'),base=hash('\uFEFFalpha\r\nbeta\r\ngamma\r\n');
 const first=await f.edit('alpha','one'),second=await f.edit('beta','two');
 assert.equal(first.changeId,second.changeId);assert.equal(f.changes.length,1);assert.equal(f.changes[0].before,base);assert.equal(f.changes[0].content,'\uFEFFone\r\ntwo\r\ngamma\r\n');assert.match(second.diff,/two/);assert.equal(await fs.readFile(path.join(f.dir,'index.html'),'utf8'),'\uFEFFalpha\r\nbeta\r\ngamma\r\n');
});
test('native Pi rejects duplicate, missing and overlapping matches without any pending draft',async t=>{
 const f=await fixture(t,'same\nsame\n');await assert.rejects(f.edit('same','new'));await assert.rejects(f.edit('absent','new'));
 await assert.rejects(f.domain.edit('run',{...f.target,expectedContentHash:hash('same\nsame\n'),edits:[{oldText:'same\nsame',newText:'a'},{oldText:'same\nsame\n',newText:'b'}]}));assert.equal(f.changes.length,0);
});
test('Pi native normalization matches curly quotes and whitespace, returns actual diff',async t=>{
 const f=await fixture(t,'<p>“hello”</p>   \n');const result=await f.edit('<p>"hello"</p>','<p>changed</p>');assert.equal(f.changes[0].content,'<p>changed</p>\n');assert.match(result.diff,/changed/);
});
test('edits are matched against one original, not sequential replacements',async t=>{
 const f=await fixture(t);const read=await f.domain.read('run',f.target);
 await assert.rejects(f.domain.edit('run',{...f.target,expectedContentHash:read.contentHash,edits:[{oldText:'alpha',newText:'new'},{oldText:'new',newText:'later'}]}));assert.equal(f.changes.length,0);
});
test('stale hash and stale changeId reject; a write_draft appended after editing becomes the latest',async t=>{
 const f=await fixture(t),old=await f.domain.read('run',f.target);const result=await f.edit('alpha','one');
 await assert.rejects(f.domain.edit('run',{...f.target,changeId:result.changeId,expectedContentHash:old.contentHash,oldText:'beta',newText:'two'}),/VERSION_CONFLICT/);
 const appended=await f.files.draft('out','index.html','newest\n','run');f.changes.unshift(appended);const current=await f.domain.read('run',f.target);assert.equal(current.changeId,appended.id);assert.equal(current.content,'newest\n');
 await assert.rejects(f.domain.edit('run',{...f.target,changeId:result.changeId,expectedContentHash:result.contentHash,oldText:'one',newText:'ignored'}),/VERSION_CONFLICT/);
});
test('bounded read is explicit about unread pages and returns whole host hash',async t=>{
 const f=await fixture(t,'abcdefghij'),first=await f.domain.read('run',{...f.target,limit:3}),next=await f.domain.read('run',{...f.target,offset:first.nextOffset,limit:3});assert.equal(first.content,'abc');assert.equal(first.total,10);assert.equal(first.truncated,true);assert.equal(first.nextOffset,3);assert.equal(next.content,'def');assert.equal(first.contentHash,hash('abcdefghij'));
});

test('read_draft offset/limit按UTF16字符计数且默认8000，用nextOffset可读取完整文件',async t=>{
 const f=await fixture(t,'😀A\nB'),first=await f.domain.read('run',{...f.target,limit:2}),next=await f.domain.read('run',{...f.target,offset:first.nextOffset,limit:16000});assert.equal(first.content,'😀');assert.equal(first.total,5);assert.equal(first.nextOffset,2);assert.equal(next.content,'A\nB');assert.equal(next.nextOffset,undefined);
 const text='a'.repeat(8001);await fs.writeFile(path.join(f.dir,'index.html'),text);const block=await f.domain.read('run',f.target),tail=await f.domain.read('run',{...f.target,offset:block.nextOffset});assert.equal(block.content.length,8000);assert.equal(block.nextOffset,8000);assert.equal(block.content+tail.content,text);assert.equal(tail.nextOffset,undefined);assert.equal((await f.domain.read('run',{...f.target,limit:1})).content,'a');
});
test('original changed, revoked mount, Plan, missing read/write authority, other run and template drafts reject',async t=>{
 const f=await fixture(t);await f.edit('alpha','one');await fs.writeFile(path.join(f.dir,'index.html'),'external');await assert.rejects(f.edit('one','two'),/VERSION_CONFLICT/);
 await fs.writeFile(path.join(f.dir,'index.html'),'alpha\nbeta\ngamma\n');f.mount.enabled=false;await assert.rejects(f.domain.read('run',f.target),/PERMISSION_DENIED/);f.mount.enabled=true;
 f.flags.plan=true;await assert.rejects(f.edit('one','two'),/PLAN_TOOL_DENIED/);f.flags.plan=false;
 f.flags.read=false;await assert.rejects(f.edit('one','two'),/PERMISSION_DENIED/);f.flags.read=true;f.flags.write=false;await assert.rejects(f.edit('one','two'),/PERMISSION_DENIED/);f.flags.write=true;
 await assert.rejects(f.domain.read('other',f.target),/DRAFT_OTHER_RUN/);f.flags.special=true;await assert.rejects(f.edit('one','two'),/DRAFT_SPECIAL_TOOL_REQUIRED/);assert.equal(f.changes.length,1);
});
test('reference original, binary extension, invalid UTF8, NUL, and template metadata cannot be edited',async t=>{
 const f=await fixture(t);f.mount.write=false;await assert.rejects(f.domain.read('run',f.target),/PERMISSION_DENIED/);f.mount.write=true;
 const cases:[string,Buffer][]=[['bad.xlsx',Buffer.from('text')],['bad.txt',Buffer.from([0xff,0xfe])],['nul.txt',Buffer.from('a\0b')],['template.json',Buffer.from(JSON.stringify({schemaVersion:1,sections:[]}))],['AGENTS.md',Buffer.from('rules')]];
 for(const [file,bytes] of cases){await fs.writeFile(path.join(f.dir,file),bytes);await assert.rejects(f.domain.read('run',{mountId:'out',path:file}),/DRAFT_TEXT_ONLY|DRAFT_SPECIAL_TOOL_REQUIRED/);}assert.equal(f.changes.length,0);
 const protectedFiles=new Files(()=>[f.mount],()=>[f.dir]),protectedDomain=new DraftEditDomain({...f.host,files:protectedFiles});await assert.rejects(protectedDomain.read('run',f.target),/REFERENCE_READ_ONLY/);
});
test('cancellation, original update and grant revocation after native staging leave no new draft',async t=>{
 for(const action of ['cancel','change','revoke'] as const){
  const f=await fixture(t);const original=f.files.resolve.bind(f.files);let count=0;
  f.files.resolve=async(...args)=>{if(++count===3){if(action==='cancel')f.controller.abort();if(action==='change')await fs.writeFile(path.join(f.dir,'index.html'),'external');if(action==='revoke')f.mount.enabled=false;}return original(...args);};
  await assert.rejects(f.domain.edit('run',{...f.target,expectedContentHash:hash('alpha\nbeta\ngamma\n'),oldText:'alpha',newText:'one'}),/CANCELLED|VERSION_CONFLICT|PERMISSION_DENIED/);assert.equal(f.changes.length,0);
 }
});
test('same-version competing edits serialize and reject the second stale update; separate files keep both drafts',async t=>{
 const f=await fixture(t),input={...f.target,expectedContentHash:hash('alpha\nbeta\ngamma\n'),oldText:'alpha'};const results=await Promise.allSettled([f.domain.edit('run',{...input,newText:'one'}),f.domain.edit('run',{...input,newText:'two'})]);assert.equal(results.filter(x=>x.status==='fulfilled').length,1);assert.equal(f.changes.length,1);
 await fs.writeFile(path.join(f.dir,'other.html'),'other');await Promise.all([f.edit('beta','next'),f.domain.edit('run',{mountId:'out',path:'other.html',expectedContentHash:hash('other'),oldText:'other',newText:'changed'})]);assert.equal(f.changes.length,2);assert.match(f.changes.find(x=>x.path==='index.html')!.content,/next/);
});
