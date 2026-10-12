import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import {createHash} from 'node:crypto';
import {testCaseProposalSchema,parseTestCaseSuite} from '../shared/test-cases.js';
import {bindTestCaseProposal,assertTestCaseBindings,testCaseSourceId,archivedTestCaseReceipts,retainTestCaseReceipts} from '../main/test-cases.js';
import {taskModelSourceId} from '../main/task-acceptance-model-view.js';
import {testCasesToMarkdown,testCasesToXlsx} from '../main/test-case-export.js';
import {qualityCheckForArtifact} from '../main/quality.js';
import type {WorkflowSourceReceipt} from '../shared/types.js';

import {source,proposal} from './test-case-fixture.js';
const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
test('manual schema refuses execution/verification claims, fake states, empty steps and dangling sources',()=>{
 const value=proposal(),suite=bindTestCaseProposal(value,'run',[source]);
 assert.equal(suite.executionStatus,'not_run');assert.equal(suite.businessStatus,'unverified');assert.equal(testCaseSourceId(source),taskModelSourceId(source));
 for(const patch of [{executionStatus:'passed'},{businessStatus:'confirmed'},{status:'passed'}])assert.throws(()=>testCaseProposalSchema.parse({...value,...patch}));
 assert.throws(()=>testCaseProposalSchema.parse({...value,cases:[{...value.cases[0],steps:[]}]}));
 assert.throws(()=>testCaseProposalSchema.parse({...value,cases:[{...value.cases[0],steps:[{action:'提交',expected:''}]}]}));
 assert.throws(()=>testCaseProposalSchema.parse({...value,cases:[value.cases[0],value.cases[0]]}));
 assert.throws(()=>parseTestCaseSuite(JSON.stringify({...suite,executionStatus:'passed'})));
 assert.throws(()=>bindTestCaseProposal(proposal('invented'),'run',[source]),/SOURCE_UNKNOWN/);
 assert.throws(()=>bindTestCaseProposal(value,'run',[{...source,contentStatus:'metadata_only'}]),/SOURCE_UNKNOWN/);
 assert.throws(()=>bindTestCaseProposal(value,'run',[{...source,contentStatus:'spreadsheet_catalog'}]),/SOURCE_UNKNOWN/);
 assert.throws(()=>parseTestCaseSuite(JSON.stringify({...suite,sourceSnapshots:[]})));
 assert(qualityCheckForArtifact({kind:'document',relativePath:value.path},JSON.stringify(suite)).valid);
 assert(!qualityCheckForArtifact({kind:'document',relativePath:value.path},'{}').valid);
});
test('host receipts bind real versions and detect forged provenance and nonexistent requirement rules',()=>{
 const suite=bindTestCaseProposal(proposal(),'run',[{...source,truncated:true}]);
 assert(suite.pendingQuestions.some(q=>q.includes('片段')));
 assertTestCaseBindings(JSON.stringify(suite),()=>[{...source,truncated:true}],[]);
 assert.throws(()=>assertTestCaseBindings(JSON.stringify(suite),()=>[source],[]),/SOURCE_UNVERIFIED/);
 assert.throws(()=>assertTestCaseBindings(JSON.stringify({...suite,sourceSnapshots:[{...suite.sourceSnapshots[0],contentHash:hash('forged')}]}),()=>[source],[]),/SOURCE_UNVERIFIED/);
 suite.cases[0].requirementRefs=[{requirementId:'R1',constraintIds:['C1']}];
 assert.throws(()=>assertTestCaseBindings(JSON.stringify(suite),()=>[{...source,truncated:true}],[]),/REQUIREMENT_UNKNOWN/);
 assert.throws(()=>assertTestCaseBindings(JSON.stringify(suite),()=>[{...source,truncated:true}],[{id:'R1',businessConstraints:[]}]),/REQUIREMENT_UNKNOWN/);
 assertTestCaseBindings(JSON.stringify(suite),()=>[{...source,truncated:true}],[{id:'R1',businessConstraints:[{id:'C1'}]}]);
});
test('Markdown and XLSX contain actual steps, expected results, sources and literal formula-looking text',async()=>{
 const suite=bindTestCaseProposal(proposal(),'run',[source]);
 suite.cases[0].title='=1+1';suite.cases[0].testData=['+SUM(A1:A2)','-1','@客户','<script>alert(1)</script>'];
 const markdown=testCasesToMarkdown(suite);assert.match(markdown,/阻止退回并提示填写原因/);assert.match(markdown,/SHA-256/);assert.match(markdown,/未执行/);assert(!markdown.includes('<script>'));
 const bytes=await testCasesToXlsx(suite),book=new ExcelJS.Workbook();await book.xlsx.load(bytes as any);
 assert.equal(book.worksheets.length,2);const row=book.getWorksheet('测试用例')!.getRow(2);
 assert.equal(row.getCell(3).value,'=1+1');assert.equal(row.getCell(7).value,suite.cases[0].testData.join('\n'));assert.match(String(row.getCell(8).value),/清空退回/);assert.match(String(row.getCell(9).value),/阻止退回/);assert.equal(row.getCell(13).value,'未执行');
 const values=JSON.stringify(book.getWorksheet('来源与说明')!.getSheetValues());assert(values.includes(source.contentHash));assert(values.includes('后台是否需要再次鉴权'));
 for(const sheet of book.worksheets)sheet.eachRow(row=>row.eachCell(cell=>assert.equal(typeof cell.value,'string')));
});
test('Excel limits reject oversized aggregate with case/column identity and preserve boundary strings without truncation',async()=>{
 const suite=bindTestCaseProposal(proposal(),'run',[source]);suite.cases[0].testData=['x'.repeat(32768)];
 assert.throws(()=>parseTestCaseSuite(JSON.stringify(suite)),/单条用例最多30000字符/);
 await assert.rejects(testCasesToXlsx(suite),/TEST_CASE_EXPORT_CELL_LIMIT: 用例 TC-001 \/ 测试数据/);
 suite.cases[0].testData=['x'.repeat(32767)];const book=new ExcelJS.Workbook();await book.xlsx.load(await testCasesToXlsx(suite) as any);assert.equal(String(book.worksheets[0].getCell('G2').value).length,32767);
 const questions=Array.from({length:100},(_,i)=>`待确认${i}`),input={...proposal(),pendingQuestions:questions};const max=bindTestCaseProposal(input,'run',[source]);assert.equal(max.pendingQuestions.length,101);assert.equal(parseTestCaseSuite(JSON.stringify(max)).pendingQuestions.length,101);
});

test('host receipt archive is bounded, workspace/run isolated and retains exact snapshots without document text',()=>{
 const entries=new Map<string,unknown>(),store={get:<T>(k:string,f:T):T=>(entries.get(k)??f) as T,set:(k:string,v:unknown)=>{entries.set(k,structuredClone(v));}};
 const actual={...source,documentText:'THIS MUST NEVER BE RETAINED'};retainTestCaseReceipts(store,'workspace','run',[actual]);retainTestCaseReceipts(store,'workspace','run',[actual]);assert.equal(archivedTestCaseReceipts(store,'workspace','run').length,1);
 assert(!JSON.stringify([...entries.values()]).includes('THIS MUST'));assert.equal(archivedTestCaseReceipts(store,'other','run').length,0);assert.equal(archivedTestCaseReceipts(store,'workspace','other').length,0);
 for(let n=1;n<100;n++)retainTestCaseReceipts(store,'workspace','run',[{...source,readAt:new Date(Date.parse(source.readAt)+n*1000).toISOString()}]);
 assert.equal(archivedTestCaseReceipts(store,'workspace','run').length,100);
 assert.throws(()=>retainTestCaseReceipts(store,'workspace','run',[{...source,readAt:'2027-01-01T00:00:00.000Z'}]),/SOURCE_ARCHIVE_LIMIT/);assert.equal(archivedTestCaseReceipts(store,'workspace','run').length,100);
});
