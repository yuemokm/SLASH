import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {TestCasesPreview} from '../src/TestCasesPreview.js';
import {TaskAcceptanceStatus} from '../src/TaskAcceptanceStatus.js';
import {testCaseExportIdentity} from '../src/test-case-export-request.js';
import {bindTestCaseProposal} from '../main/test-cases.js';
import {hash} from '../main/files.js';
import {source,proposal} from './test-case-fixture.js';
import type {Change} from '../shared/types.js';

test('PM preview shows readable steps, expected results, source versions and unexecuted status; invalid JSON is explicit',()=>{
 const suite=bindTestCaseProposal(proposal(),'run',[source]);
 const html=renderToStaticMarkup(React.createElement(TestCasesPreview,{content:JSON.stringify(suite),onRevealSource:async()=>{}}));
 for(const text of ['客户审批测试用例','TC-001','前置条件','清空退回原因并点击退回','阻止退回并提示填写原因','全部未执行','定位来源文件','PRD/module.md',source.contentHash,'后台是否需要再次鉴权'])assert(html.includes(text),text);
 assert(!html.includes('"schemaVersion"'));
 const invalid=renderToStaticMarkup(React.createElement(TestCasesPreview,{content:'{"cases":'}));assert(invalid.includes('role="alert"'));assert(invalid.includes('不是有效JSON'));assert(invalid.includes('不能保存或导出'));
 suite.cases[0].title='<script>unsafe</script>';const safe=renderToStaticMarkup(React.createElement(TestCasesPreview,{content:JSON.stringify(suite)}));assert(!safe.includes('<script>'));assert(safe.includes('&lt;script&gt;'));
 const status=renderToStaticMarkup(React.createElement(TaskAcceptanceStatus,{run:{id:'run',workflow:{kind:'test_cases',sources:[],receipts:[]},acceptance:{status:'passed',outputCount:1}} as any,call:async()=>undefined}));assert(status.includes('尚未执行'));assert(status.includes('业务预期仍待核对'));assert(!status.includes('测试通过'));
});
test('UI pending preview identity is changeId plus exact preview hash, never a missing disk file or silently changed card',async()=>{
 const content=JSON.stringify(bindTestCaseProposal(proposal(),'run',[source])),file={mountId:'output',path:'审批.testcases.json'},change:Change={...file,id:'change-1',runId:'run',before:null,content,status:'pending',createdAt:new Date().toISOString()};
 assert.deepEqual(await testCaseExportIdentity(change.id,file,[change],content),{changeId:change.id,expectedContentHash:hash(content)});
 assert.deepEqual(await testCaseExportIdentity(hash(content),file,[],content),{expectedContentHash:hash(content)});
 await assert.rejects(testCaseExportIdentity(change.id,file,[{...change,content:content+' '}],content),/预览后已变化/);
 await assert.rejects(testCaseExportIdentity(change.id,file,[{...change,status:'applied'}],content),/身份已失效/);
 await assert.rejects(testCaseExportIdentity(change.id,{...file,mountId:'other'},[change],content),/身份已失效/);
});
