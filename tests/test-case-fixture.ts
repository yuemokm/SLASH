import {createHash} from 'node:crypto';
import {testCaseSourceId} from '../main/test-cases.js';
import type {WorkflowSourceReceipt} from '../shared/types.js';
const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
export const source:WorkflowSourceReceipt={mountId:'source',path:'PRD/module.md',versionId:'current',contentHash:hash('退回必须填写原因'),readAt:'2026-10-08T00:00:00.000Z',characters:9,includedCharacters:9,truncated:false};
export const proposal=(sourceId=testCaseSourceId(source))=>({mountId:'output',path:'审批.testcases.json',title:'客户审批测试用例',scope:'退回流程',pendingQuestions:['后台是否需要再次鉴权待确认'],cases:[{id:'TC-001',module:'审批',title:'退回缺少原因',priority:'P1' as const,type:'exception' as const,preconditions:['主管已登录','存在待审批申请'],testData:['退回原因为空'],steps:[{action:'清空退回原因并点击退回',expected:'阻止退回并提示填写原因'}],sourceIds:[sourceId],requirementRefs:[],pendingQuestions:['原型不能证明后台鉴权']}]});
