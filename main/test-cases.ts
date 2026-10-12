import type {WorkflowSourceReceipt} from '../shared/types.js';
import {parseTestCaseSuite,testCaseProposalSchema,testCaseSourceSchema,testCaseSuiteSchema,type TestCaseSource,type TestCaseSuite} from '../shared/test-cases.js';
import {createHash} from 'node:crypto';

export {taskModelSourceId as testCaseSourceId} from './task-acceptance-model-view.js';
import {taskModelSourceId as testCaseSourceId} from './task-acceptance-model-view.js';
type ReceiptStorage={get<T>(key:string,fallback:T):T;set(key:string,value:unknown):void};
const archiveKey=(workspace:string,runId:string)=>'test-case-host-reads:v1:'+createHash('sha256').update(workspace+'\0'+runId).digest('hex');
/** Host-only metadata archive. No document text or model-supplied metadata is stored. */
export function archivedTestCaseReceipts(store:ReceiptStorage,workspace:string,runId:string):WorkflowSourceReceipt[]{
 const value=store.get<unknown>(archiveKey(workspace,runId),[]),sources=testCaseSourceSchema.array().max(100).parse(value);
 if(JSON.stringify(sources).length>1000000||sources.some(s=>s.runId!==runId))throw Error('TEST_CASE_SOURCE_ARCHIVE_INVALID');
 return sources.map(({id:_,runId:__,...source})=>({...source,characters:source.includedCharacters}));
}
export function retainTestCaseReceipts(store:ReceiptStorage,workspace:string,runId:string,receipts:WorkflowSourceReceipt[]){
 const sources=archivedTestCaseReceipts(store,workspace,runId).map(r=>testCaseSource(runId,r)!);
 for(const receipt of receipts){const source=testCaseSource(runId,receipt);if(!source)throw Error('TEST_CASE_SOURCE_UNVERIFIED');if(!sources.some(s=>JSON.stringify(s)===JSON.stringify(source)))sources.push(source);}
 if(sources.length>100||JSON.stringify(sources).length>1000000)throw Error('TEST_CASE_SOURCE_ARCHIVE_LIMIT: 本任务已保留过多来源阅读快照，请新建会话继续生成用例');
 store.set(archiveKey(workspace,runId),testCaseSourceSchema.array().max(100).parse(sources));
}
export function testCaseSource(runId:string,s:WorkflowSourceReceipt):TestCaseSource|undefined{
 if(s.contentStatus==='metadata_only'||s.contentStatus==='spreadsheet_catalog'||s.includedCharacters<=0)return undefined;
 return {id:testCaseSourceId(s),runId,mountId:s.mountId,path:s.path,versionId:s.versionId,contentHash:s.contentHash,readAt:s.readAt,includedCharacters:s.includedCharacters,truncated:s.truncated,...(s.locator?{locator:s.locator}:{})};
}
export function bindTestCaseProposal(input:unknown,runId:string,receipts:WorkflowSourceReceipt[]):TestCaseSuite{
 const proposal=testCaseProposalSchema.parse(input),ids=new Set(proposal.cases.flatMap(c=>c.sourceIds)),sources=new Map<string,TestCaseSource>();
 for(const receipt of receipts){const source=testCaseSource(runId,receipt);if(source&&ids.has(source.id)){const existing=sources.get(source.id);if(!existing||source.includedCharacters>existing.includedCharacters)sources.set(source.id,source);}}
 if([...ids].some(id=>!sources.has(id)))throw Error('TEST_CASE_SOURCE_UNKNOWN: 用例来源必须来自本任务已实际读取的正文回执；先读取资料或查看get_task_acceptance的sources，不能把目录/文件信息当正文');
 const pending=[...proposal.pendingQuestions];
 if([...sources.values()].some(s=>s.truncated))pending.push('部分来源仅读取片段；未读范围和用例覆盖仍待核对。');
 pending.push('生成用例尚未人工执行；业务预期及覆盖范围需人工核对。');
 return testCaseSuiteSchema.parse({schemaVersion:1,kind:'manual_test_cases',originRunId:runId,generatedAt:new Date().toISOString(),generationStatus:'generated',executionStatus:'not_run',businessStatus:'unverified',title:proposal.title,scope:proposal.scope,cases:proposal.cases,pendingQuestions:[...new Set(pending)],sourceSnapshots:[...sources.values()]});
}
/** Checks immutable host reads, not semantic correctness. Ordinary edits cannot forge receipt metadata. */
export function assertTestCaseBindings(content:string,readReceipts:(runId:string)=>WorkflowSourceReceipt[]|undefined,requirements:ReadonlyArray<{id:string;businessConstraints?:ReadonlyArray<{id:string}>}>){
 const suite=parseTestCaseSuite(content);
 for(const source of suite.sourceSnapshots){const receipts=readReceipts(source.runId);if(!receipts?.some(receipt=>{const actual=testCaseSource(source.runId,receipt);return actual&&JSON.stringify(actual)===JSON.stringify(source);}))throw Error('TEST_CASE_SOURCE_UNVERIFIED: 来源与宿主实际阅读记录不一致');}
 for(const c of suite.cases)for(const ref of c.requirementRefs){const r=requirements.find(r=>r.id===ref.requirementId);if(!r||ref.constraintIds.some(id=>!r.businessConstraints?.some(rule=>rule.id===id)))throw Error('TEST_CASE_REQUIREMENT_UNKNOWN: 用例引用的需求或规则不存在');}
 return suite;
}
