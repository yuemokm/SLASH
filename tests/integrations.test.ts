import {test} from 'node:test';
import assert from 'node:assert/strict';
import {classifyReceipt} from '../main/integrations.js';

test('远端回执只有明确终态才判成功',()=>{
 assert.equal(classifyReceipt({success:true,data:{status:'completed',documentId:'doc-17'}}).status,'succeeded');
 assert.equal(classifyReceipt({ok:true,data:{status:'pending'}}).status,'outcome_unknown');
 assert.equal(classifyReceipt({ok:true,data:{status:'processing'}}).status,'outcome_unknown');
 assert.equal(classifyReceipt({success:true,data:{status:'partial_success'}}).status,'outcome_unknown');
 assert.equal(classifyReceipt({ok:true,data:{status:'commit_unknown'}}).status,'outcome_unknown');
});

test('远端明确拒绝与缺少业务状态分别判失败和待核对',()=>{
 assert.equal(classifyReceipt({success:false,status:'rejected',error:'permission denied'}).status,'failed');
 assert.equal(classifyReceipt({isError:true,content:[{type:'text',text:'invalid request'}]}).status,'failed');
 assert.equal(classifyReceipt({ok:true,data:{id:'doc-18'}}).status,'succeeded');
 assert.equal(classifyReceipt({data:{id:'doc-19'}}).status,'outcome_unknown');
});
