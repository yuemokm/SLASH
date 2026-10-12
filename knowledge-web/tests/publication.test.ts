import {test} from 'node:test';
import assert from 'node:assert/strict';
import {receiptMatches,receiptMatchesOperation} from '../lib/publication';
test('operation回执须匹配知识库/版本/清单/动作，不能复用UUID误报成功',()=>{
 const receipt={action:'publish',kb_id:'kb',index_id:'v1',manifest_hash:'manifest'},intent={action:'publish' as const,kbId:'kb',indexId:'v1',manifestHash:'manifest'};
 assert.equal(receiptMatches(receipt,intent),true);
 for(const change of [{action:'revoke' as const},{kbId:'other'},{indexId:'v2'},{manifestHash:'changed'}])assert.equal(receiptMatches(receipt,{...intent,...change}),false);
 assert.equal(receiptMatches({...receipt,action:'revoke'},{action:'revoke',kbId:'kb'}),true);
 assert.equal(receiptMatches({...receipt,member_ids:['a'],expected_active:null},{...intent,memberIds:['b'],expectedActive:null}),false);
 assert.equal(receiptMatches({...receipt,member_ids:['a'],expected_active:'v0'},{...intent,memberIds:['a'],expectedActive:'changed'}),false);
});
test('HTTP成功仍须核对operation；缺失或损坏回执不得确认',()=>{
 const intent={action:'publish' as const,kbId:'kb',indexId:'v1',manifestHash:'manifest',memberIds:['a'],expectedActive:null};
 const receipt={operation_id:'operation',action:'publish',kb_id:'kb',index_id:'v1',manifest_hash:'manifest',member_ids:['a'],expected_active:null};
 assert.equal(receiptMatchesOperation(receipt,'operation',intent),true);
 assert.equal(receiptMatchesOperation(receipt,'other-operation',intent),false);
 assert.equal(receiptMatchesOperation(null as unknown as typeof receipt,'operation',intent),false);
 assert.equal(receiptMatches({...receipt,member_ids:'a' as unknown as string[]},intent),false);
});
