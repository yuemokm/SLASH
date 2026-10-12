import test,{type TestContext} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {Files} from '../main/files.js';
import {exportMarkdownToWord,markdownToDocx,packageHtmlProject,writeAuthorizedBuffer} from '../main/artifacts.js';
import {exportAcceptedPrototype} from '../main/prototype-export.js';
import type {Mount} from '../shared/types.js';

const digest=(bytes:string|Buffer)=>createHash('sha256').update(bytes).digest('hex');
async function fixture(t:TestContext){
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'slash-delivery-adapter-'));t.after(()=>fs.rm(directory,{recursive:true,force:true}));
 const mounts:Mount[]=[{id:'mount',name:'Test',path:directory,enabled:true,write:true}];return{directory,files:new Files(()=>mounts),source:{mountId:'mount',path:'input.md'},output:{mountId:'mount',path:'existing.docx'}};
}
test('Word prewrite gate sees the converted source hash and rejection preserves existing target',async t=>{
 const f=await fixture(t),original='# 需求\n\n审批必须由经理确认。';await fs.writeFile(path.join(f.directory,'input.md'),original);await fs.writeFile(path.join(f.directory,'existing.docx'),'USER EXISTING');let seen='';
 await assert.rejects(exportMarkdownToWord(f.files,{source:f.source,output:f.output,overwrite:true,beforeWrite:async hash=>{seen=hash;await fs.writeFile(path.join(f.directory,'input.md'),'changed after conversion');throw Error('TASK_DELIVERY_STALE');}}),/TASK_DELIVERY_STALE/);
 assert.equal(seen,digest(original));assert.equal(await fs.readFile(path.join(f.directory,'existing.docx'),'utf8'),'USER EXISTING');assert.deepEqual((await fs.readdir(f.directory)).filter(name=>name.endsWith('.tmp')),[]);
});
test('copy and Excel byte writers reject immediately before commit without damaging a user file',async t=>{
 const f=await fixture(t);for(const name of ['copy.md','cases.xlsx']){await fs.writeFile(path.join(f.directory,name),'USER EXISTING');let calls=0;await assert.rejects(writeAuthorizedBuffer(f.files,{mountId:'mount',path:name},Buffer.from('new bytes'),true,async()=>{calls++;throw Error('TASK_DELIVERY_BLOCKED');}),/TASK_DELIVERY_BLOCKED/);assert.equal(calls,1);assert.equal(await fs.readFile(path.join(f.directory,name),'utf8'),'USER EXISTING');}assert.deepEqual((await fs.readdir(f.directory)).filter(name=>name.endsWith('.tmp')),[]);
});
test('existing Word input keeps raw container identity separate from extracted conversion text',async t=>{
 const f=await fixture(t),document=await markdownToDocx('# 需求\n\n经理审批。');await fs.writeFile(path.join(f.directory,'input.docx'),document.buffer);
 const rawHash=digest(document.buffer),textHash=digest(await f.files.read('mount','input.docx'));assert.notEqual(rawHash,textHash);let checked=false;
 await exportMarkdownToWord(f.files,{source:{mountId:'mount',path:'input.docx'},output:f.output,beforeWrite:async conversionHash=>{assert.equal(conversionHash,textHash);assert.equal(digest(await fs.readFile(path.join(f.directory,'input.docx'))),rawHash);checked=true;}});assert.equal(checked,true);assert.equal((await fs.readFile(path.join(f.directory,'existing.docx'))).subarray(0,2).toString(),'PK');
});
test('changing the authorized output mount during precommit never writes the former path',async t=>{
 const f=await fixture(t),alternate=path.join(f.directory,'alternate');await fs.mkdir(alternate);await fs.writeFile(path.join(f.directory,'existing.md'),'ORIGINAL');let current=f.directory;
 const files=new Files(()=>[{id:'mount',name:'Test',path:current,enabled:true,write:true}]);await assert.rejects(writeAuthorizedBuffer(files,{mountId:'mount',path:'existing.md'},Buffer.from('NEW'),true,async()=>{current=alternate;}),/VERSION_CONFLICT/);assert.equal(await fs.readFile(path.join(f.directory,'existing.md'),'utf8'),'ORIGINAL');assert.deepEqual(await fs.readdir(alternate),[]);assert.deepEqual((await fs.readdir(f.directory)).filter(name=>name.endsWith('.tmp')),[]);
});
test('ZIP gate receives immutable captured entries and a rejected check preserves target',async t=>{
 const f=await fixture(t);await fs.mkdir(path.join(f.directory,'project'));await fs.writeFile(path.join(f.directory,'project/index.html'),'<h1>审批规则</h1>');await fs.writeFile(path.join(f.directory,'project/rules.txt'),'captured');await fs.writeFile(path.join(f.directory,'existing.zip'),'USER EXISTING');let entry='';
 await assert.rejects(packageHtmlProject(f.files,{source:{mountId:'mount',path:'project'},output:{mountId:'mount',path:'existing.zip'},overwrite:true,beforeWrite:async entries=>{entry=entries.get('index.html')!.toString();await fs.writeFile(path.join(f.directory,'project/index.html'),'changed');throw Error('TASK_DELIVERY_STALE');}}),/TASK_DELIVERY_STALE/);assert.equal(entry,'<h1>审批规则</h1>');assert.equal(await fs.readFile(path.join(f.directory,'existing.zip'),'utf8'),'USER EXISTING');assert.deepEqual((await fs.readdir(f.directory)).filter(name=>name.endsWith('.tmp')),[]);
});
for(const format of ['copy','zip'] as const)test(`accepted prototype ${format} repeats the gate after staging and keeps existing target`,async t=>{
 const f=await fixture(t),bytes=Buffer.from('<button>审批</button>'),name=format==='zip'?'existing.zip':'existing.html';await fs.writeFile(path.join(f.directory,name),'USER EXISTING');let calls=0;
 await assert.rejects(exportAcceptedPrototype(f.files,{output:{mountId:'mount',path:name},format,entryPath:'index.html',snapshot:new Map([['index.html',{bytes,hash:digest(bytes)}]]),assertCurrent:async()=>{if(++calls===2)throw Error('TASK_DELIVERY_STALE');}}),/TASK_DELIVERY_STALE/);assert.equal(calls,2);assert.equal(await fs.readFile(path.join(f.directory,name),'utf8'),'USER EXISTING');assert.deepEqual((await fs.readdir(f.directory)).filter(entry=>entry.endsWith('.tmp')),[]);
});
