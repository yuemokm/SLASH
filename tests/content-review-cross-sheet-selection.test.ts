import test from 'node:test';
import assert from 'node:assert/strict';
import {buildContentReviewInput,contentReviewTextHash as hash} from '../main/content-review.js';
import {selectSpreadsheetRanges} from '../main/content-review-spreadsheet-excerpts.js';

const opening='[XLSX 单元格值提取；原始文本，字段关系未验证]\n\n';
const sheet=(name:string,object:string,rule:string,count=140)=>'工作表: '+JSON.stringify(name)+'\nD1: "文本: 字段名称"\nH1: "文本: 必填"\nK1: "文本: 字段规则"\nB2: '+JSON.stringify('文本: '+object)+'\nD2: "文本: Account code"\nH2: "文本: 是"\nK2: '+JSON.stringify('文本: '+rule)+'\n'+Array.from({length:count},(_,i)=>`A${i+10}: "${'irrelevant background '.repeat(8)}"`).join('\n')+'\n\n';
function build(source:string,request:string,artifact:string){return buildContentReviewInput({requests:[{id:'task',text:request}],artifacts:[{id:'report',path:'report.md',text:artifact,sha256:hash(artifact)}],sources:[{id:'workbook',path:'fields.txt',text:source,sha256:hash(source),readCoverage:'partial'}]},{promptCharacters:24000});}
function included(input:ReturnType<typeof build>,quote:string){return input.sourceContexts[0].excerpts.some(excerpt=>excerpt.text.includes(quote));}
function bounded(input:ReturnType<typeof build>){const context=input.sourceContexts[0];assert(input.prompt.length<=24000);assert(context.includedCharacters<=20000);assert(context.excerpts.length<=8);for(const e of context.excerpts)assert.equal(e.text,input.snapshot.sources[0].text.slice(e.start,e.end));assert.equal(context.coverage,'partial');assert.equal((input.snapshot.sources[0] as any).spreadsheetEvidence,undefined);}

test('request business object without full sheet name survives a report pointing to the other object',()=>{
 const source=opening+sheet('01正式客户字段','正式客户','final account requires onboarding')+sheet('03候选客户字段','候选客户','candidate account uses provisional code');
 const input=build(source,'核对候选客户的编码规则，区分正式与候选对象，不用文件版本号裁决。','根据01正式客户字段，所有客户编码都遵循final account requires onboarding。');bounded(input);
 assert(included(input,'工作表: "03候选客户字段"'),'original task object must remain available independently of the report');assert(included(input,'candidate account uses provisional code'));
});

test('English partial object request is not narrowed to the exact worksheet named by the incorrect report',()=>{
 const source=opening+sheet('Active Accounts','active account','final code is immutable')+sheet('Prospect Accounts','prospect account','temporary code is replaceable');
 const input=build(source,'Review prospect creation rules and distinguish provisional records.','"Active Accounts": final code is immutable, therefore prospect codes never change.');bounded(input);
 assert(included(input,'工作表: "Prospect Accounts"'));assert(included(input,'temporary code is replaceable'));
});

test('artifact naming a sheet cannot hide another same-source sheet when request scope is ambiguous',()=>{
 const source=opening+sheet('Alpha Ledger','alpha','alpha restriction')+sheet('Beta Ledger','beta','beta exception');
 const input=build(source,'Compare import restrictions and record unresolved object differences.','"Alpha Ledger": the entire source; alpha restriction applies everywhere.');bounded(input);
 assert(included(input,'工作表: "Alpha Ledger"'));assert(included(input,'工作表: "Beta Ledger"'));assert(included(input,'beta exception'));
});

test('request-related title precedes artifact-heavy unrelated sheets under the unchanged eight-sheet cap',()=>{
 const source=opening+Array.from({length:9},(_,i)=>sheet('Archive '+i,'archive','repeat report wording',35)).join('')+sheet('Prospect Registry','prospect','target prospective rule',35);
 const selected=selectSpreadsheetRanges(source,5000,new Set(['repeat','report','wording']),'Check prospect creation rules','"Archive 0": repeat report wording',undefined,new Set(['prospect','creation','rules']));
 const text=selected.ranges.map(r=>source.slice(r.start,r.end)).join('\n');assert(text.includes('工作表: "Prospect Registry"'),'independent request title needs priority before unrelated artifact rows');assert(selected.limitations.includes('SHEET_SELECTION_LIMIT'));assert(selected.ranges.length<=8);assert(selected.ranges.reduce((sum,r)=>sum+r.end-r.start,0)<=5000);
});
