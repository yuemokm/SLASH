import test from 'node:test';
import assert from 'node:assert/strict';
import {requestSchema} from '../shared/types.js';

test('副本处理IPC使用唯一type分支，文本提取与隔离脚本都可解析',()=>{
 assert.deepEqual(requestSchema.parse({type:'processProcessingCopy',id:'copy-1',operation:'extract_text'}),{type:'processProcessingCopy',id:'copy-1',operation:'extract_text'});
 assert.deepEqual(requestSchema.parse({type:'processProcessingCopy',id:'copy-1',operation:'script',script:'return input.text;'}),{type:'processProcessingCopy',id:'copy-1',operation:'script',script:'return input.text;'});
});

test('隔离脚本IPC拒绝遗漏/空白正文、无效operation与额外字段',()=>{
 for(const input of [
  {operation:'script'},
  {operation:'script',script:'   '},
  {operation:'script',script:'x'.repeat(65537)},
  {operation:'unknown'},
  {operation:'extract_text',script:'return "unexpected";'},
  {operation:'script',script:'return input.text;',sourcePath:'original.txt'},
 ])assert.equal(requestSchema.safeParse({type:'processProcessingCopy',id:'copy-1',...input}).success,false);
});

test('基础state和modelUpsert IPC仍可解析，不受副本operation扩展影响',()=>{
 assert.deepEqual(requestSchema.parse({type:'state'}),{type:'state'});
 const request=requestSchema.parse({type:'modelUpsert',model:{provider:'custom',name:'fixture',baseUrl:'https://models.example/v1',modelId:'fixture-model'}});
 assert.equal(request.type,'modelUpsert');if(request.type==='modelUpsert')assert.equal(request.model.protocol,'openai-completions');
});
