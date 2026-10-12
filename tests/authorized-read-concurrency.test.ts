import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createAuthorizedReadTool} from '../main/authorized-read.js';
import {Files,hash} from '../main/files.js';
import type {WorkflowSourceReceipt} from '../shared/types.js';

async function fixture(t:test.TestContext){
 const parent=path.resolve('.test-data/authorized-read-concurrency-tests');
 await fs.mkdir(parent,{recursive:true});const root=await fs.mkdtemp(path.join(parent,'fixture-'));
 t.after(async()=>{const resolved=await fs.realpath(root);if(!resolved.startsWith(parent+path.sep))throw Error('CLEANUP_SCOPE');await fs.rm(resolved,{recursive:true,force:true});});
 const text=Array.from({length:300},(_,i)=>`line ${i+1}: immutable business source`).join('\n');
 await fs.writeFile(path.join(root,'source.txt'),text);
 const files=new Files(()=>[{id:'readonly',name:'source',path:root,enabled:true,write:false}]);
 const receipts:WorkflowSourceReceipt[]=[];
 const tool=createAuthorizedReadTool(files,path.join(root,'virtual'),async(_name,_input,fn)=>fn(),undefined,receipt=>{receipts.push(receipt);});
 const read=(offset:number,expectedContentHash?:string)=>tool.execute('same-call-id',{mountId:'readonly',path:'source.txt',offset,limit:10,...(expectedContentHash?{expectedContentHash}:{})});
 return{root,text,files,receipts,read};
}

for(const withHash of [true,false])test(`concurrent pages of the same file preserve source receipts ${withHash?'with':'without'} expected hash`,async t=>{
 const f=await fixture(t),sourceHash=hash(f.text),offsets=[1,21,41,61];
 const result=await Promise.all(offsets.map(offset=>f.read(offset,withHash?sourceHash:undefined)));
 for(let i=0;i<result.length;i++){const body=result[i].content.filter(item=>item.type==='text').map(item=>item.type==='text'?item.text:'').join('\n');assert.ok(body.startsWith(f.text.split('\n').slice(offsets[i]-1,offsets[i]+9).join('\n')));}
 assert.equal(f.receipts.length,offsets.length);
 assert.deepEqual(f.receipts.map(item=>item.locator).sort(),offsets.map(offset=>`lines:${offset}-${offset+9}`).sort());
 for(const receipt of f.receipts){assert.equal(receipt.contentHash,sourceHash);assert.equal(receipt.versionId,'read:'+sourceHash);assert.equal(receipt.characters,f.text.length);assert.ok(receipt.includedCharacters>0);assert.equal(receipt.truncated,true);}
 assert.equal(await fs.readFile(path.join(f.root,'source.txt'),'utf8'),f.text);
});

test('a conflicting concurrent page rejects only that page and cannot damage a valid read or later read',async t=>{
 const f=await fixture(t),sourceHash=hash(f.text);
 const outcomes=await Promise.allSettled([f.read(1,hash('old source')),f.read(21,sourceHash)]);
 assert.equal(outcomes[0].status,'rejected');if(outcomes[0].status==='rejected')assert.match(String(outcomes[0].reason),/VERSION_CONFLICT/);
 assert.equal(outcomes[1].status,'fulfilled');assert.equal(f.receipts.length,1);assert.equal(f.receipts[0].locator,'lines:21-30');assert.equal(f.receipts[0].contentHash,sourceHash);
 await f.read(41,sourceHash);assert.equal(f.receipts.length,2);assert.equal(f.receipts[1].locator,'lines:41-50');assert.equal(f.receipts[1].characters,f.text.length);
});
