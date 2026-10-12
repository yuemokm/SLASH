import test from 'node:test';
import assert from 'node:assert/strict';
import {runOperationViews} from '../src/run-operation-view.js';

const operation=(tool:string,state:string,result='')=>({id:tool+state,tool,state,result,createdAt:'2026-10-08T00:00:00Z'});
test('execution record exposes safe Chinese schema and native matching failures without done state',()=>{
 const entries=runOperationViews([
  operation('edit_draft','failed',JSON.stringify({code:'DRAFT_INPUT_INVALID',validation:{reason:'missing_replacement',unknown:'PRIVATE'}})),
  operation('edit_draft','failed',JSON.stringify({code:'DRAFT_INPUT_INVALID',validation:{reason:'mixed_replacement'}})),
  operation('read_draft','failed',JSON.stringify({code:'DRAFT_INPUT_INVALID',validation:{reason:'schema_invalid'}})),
  operation('edit_draft','failed','Error: DRAFT_MATCH_NOT_FOUND: '+JSON.stringify({failedEditIndex:7,totalEdits:21,path:'PRIVATE',notice:'PRIVATE',oldText:'PRIVATE'})),
  operation('edit_draft','failed','DRAFT_MATCH_AMBIGUOUS: '+JSON.stringify({failedEditIndex:0,totalEdits:1})),
  operation('read_draft','cancelled','PRIVATE'),operation('edit_draft','failed','SECRET_UNKNOWN_ERROR <script>PRIVATE</script>'),
 ]);
 assert.equal(entries.length,7);assert.equal(entries.some(entry=>entry.state==='done'),false);
 assert.match(entries[0].text,/参数被拒绝：缺少/);assert.match(entries[1].text,/单项修改与批量修改同时提供/);assert.match(entries[2].text,/参数格式不正确/);assert.match(entries[3].text,/第 8 项修改未找到匹配原文/);assert.match(entries[4].text,/原文匹配多处/);assert.equal(entries[5].text,'读取草稿已取消');assert.match(entries[6].text,/操作失败/);
 assert.doesNotMatch(JSON.stringify(entries),/PRIVATE|SECRET|oldText|script|DRAFT_MATCH|DRAFT_INPUT/);
});
test('success labels and source receipt semantics are preserved; untrusted or malformed failure details remain generic',()=>{
 const entries=runOperationViews([operation('write_draft','succeeded'),operation('read_file','applied'),operation('search_files','completed'),operation('read_workflow_sources','succeeded'),operation('other','failed','PRIVATE'),operation('read_draft','executing'),operation('edit_draft','failed','Error: DRAFT_MATCH_NOT_FOUND: {broken PRIVATE}')]);
 assert.deepEqual(entries.map(entry=>entry.text),['已生成修改草稿','已读取文件','已检索授权资料','修改草稿未完成：未找到匹配原文；本次未改动草稿，请重新读取后缩小修改范围']);
 assert.deepEqual(entries.map(entry=>entry.state),['done','done','done','failed']);assert.doesNotMatch(JSON.stringify(entries),/PRIVATE/);
 const malicious=runOperationViews([operation('edit_draft','failed','DRAFT_MATCH_NOT_FOUND: '+JSON.stringify({failedEditIndex:999,totalEdits:1000}))]);assert.doesNotMatch(malicious[0].text,/1000|999|第/);
});
