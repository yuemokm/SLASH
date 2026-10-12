import test from 'node:test';
import assert from 'node:assert/strict';
import {testCaseListEntries} from '../src/test-cases-list.js';
import type {Change,Mount} from '../shared/types.js';

const mounts:Mount[]=[{id:'output',path:'E:/project/成果',name:'成果',enabled:true,write:true},{id:'revoked',path:'E:/old',name:'旧目录',enabled:false,write:false}];
const change=(id:string,status:Change['status'],path='审批.testcases.json',mountId='output'):Change=>({id,runId:'run',mountId,path,status,before:null,content:'{}',createdAt:'2026-10-09T01:00:00.000Z'});
test('test case list keeps actual saved file and all unresolved draft identities, excludes duplicate applied history',()=>{
  const file={mountId:'output',path:'审批.testcases.json',size:100};
  const entries=testCaseListEntries([file,file,{...file,path:'目录/回归.TESTCASES.JSON'},{...file,path:'无关.json'}],[change('pending','pending'),change('conflict','conflict'),change('version-1','applied'),change('version-2','applied')],mounts);
  assert.equal(entries.length,4);
  assert.equal(entries.filter(entry=>!entry.change).length,2);
  assert.deepEqual(new Set(entries.filter(entry=>entry.change).map(entry=>entry.change!.id)),new Set(['pending','conflict']));
  assert(!entries.some(entry=>entry.key.includes('version-')));
});
test('test case list excludes disabled and other-project mount identities for files and drafts',()=>{
  const entries=testCaseListEntries([{mountId:'revoked',path:'旧.testcases.json',size:10},{mountId:'other-project',path:'其他.testcases.json',size:10}],[change('revoked','pending','旧.testcases.json','revoked'),change('other','conflict','其他.testcases.json','other-project'),change('unrelated','pending','原型.html')],mounts);
  assert.deepEqual(entries,[]);
});
