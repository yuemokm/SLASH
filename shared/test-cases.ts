import {z} from 'zod';

export const TEST_CASE_NOTICE='这是一份供人工审阅和执行的测试用例；生成与结构检查不表示实际测试通过，业务含义仍待核对。';
export const isTestCasePath=(value:string)=>/\.testcases\.json$/i.test(value);
const id=z.string().trim().min(1).max(200),text=z.string().trim().min(1).max(4000),hash=z.string().regex(/^[a-f0-9]{64}$/i);
const relative=z.string().trim().min(1).max(4096).refine(v=>!v.includes(':')&&!/[\0\r\n]/.test(v)&&!v.replaceAll('\\','/').startsWith('/')&&!v.replaceAll('\\','/').split('/').includes('..'),'须为授权目录内相对路径');
export const manualTestCaseSchema=z.object({
 id,module:text,title:text,priority:z.enum(['P0','P1','P2','P3']),type:z.enum(['normal','exception','boundary','permission','state','data']),
 preconditions:z.array(text).max(30),testData:z.array(text).max(30),steps:z.array(z.object({action:text,expected:text}).strict()).min(1).max(50),
 sourceIds:z.array(id).min(1).max(30),requirementRefs:z.array(z.object({requirementId:id,constraintIds:z.array(id).max(30)}).strict()).max(30),pendingQuestions:z.array(text).max(30),
}).strict().refine(v=>JSON.stringify(v).length<=30000,'单条用例最多30000字符，请拆分过长场景');
const suiteFields={title:text,scope:text,cases:z.array(manualTestCaseSchema).min(1).max(200),pendingQuestions:z.array(text).max(100)};
function uniqueCases(value:{cases:Array<{id:string}>}){return new Set(value.cases.map(c=>c.id)).size===value.cases.length;}
export const testCaseProposalSchema=z.object({mountId:id,path:relative.refine(isTestCasePath,'用例规范文件须以 .testcases.json 结尾'),...suiteFields}).strict().refine(uniqueCases,'用例编号不能重复').refine(v=>JSON.stringify(v).length<=500000,'单份用例最多500000字符');
export type TestCaseProposal=z.infer<typeof testCaseProposalSchema>;
export const testCaseSourceSchema=z.object({id,runId:id,mountId:id,path:relative,versionId:id,contentHash:hash,readAt:z.string().datetime({offset:true}),includedCharacters:z.number().int().positive(),truncated:z.boolean(),locator:z.string().max(2000).optional()}).strict();
export const testCaseSuiteSchema=z.object({schemaVersion:z.literal(1),kind:z.literal('manual_test_cases'),originRunId:id,generatedAt:z.string().datetime({offset:true}),generationStatus:z.literal('generated'),executionStatus:z.literal('not_run'),businessStatus:z.literal('unverified'),...suiteFields,pendingQuestions:z.array(text).max(102),sourceSnapshots:z.array(testCaseSourceSchema).min(1).max(100)}).strict().refine(uniqueCases,'用例编号不能重复').superRefine((value,ctx)=>{
 const sources=new Set(value.sourceSnapshots.map(s=>s.id));
 if(sources.size!==value.sourceSnapshots.length)ctx.addIssue({code:'custom',path:['sourceSnapshots'],message:'来源ID不能重复'});
 for(const c of value.cases)if(c.sourceIds.some(id=>!sources.has(id))||new Set(c.sourceIds).size!==c.sourceIds.length)ctx.addIssue({code:'custom',path:['cases',c.id,'sourceIds'],message:'用例来源必须引用真实唯一来源快照'});
});
export type TestCaseSuite=z.infer<typeof testCaseSuiteSchema>;
export type TestCaseSource=z.infer<typeof testCaseSourceSchema>;
export const testCaseTypeLabels:Record<z.infer<typeof manualTestCaseSchema>['type'],string>={normal:'正常',exception:'异常',boundary:'边界',permission:'权限',state:'状态',data:'数据'};
export function parseTestCaseSuite(content:string):TestCaseSuite{
 if(content.length>500000)throw Error('TEST_CASE_LIMIT: 用例文件最多500000字符');
 let value:unknown;try{value=JSON.parse(content);}catch{throw Error('TEST_CASE_INVALID: 用例文件不是有效JSON');}
 const result=testCaseSuiteSchema.safeParse(value);
 if(!result.success)throw Error('TEST_CASE_INVALID: '+result.error.issues.slice(0,5).map(i=>i.path.join('.')+' '+i.message).join('；'));
 return result.data;
}
