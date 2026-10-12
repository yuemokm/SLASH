import test from 'node:test';
import assert from 'node:assert/strict';
import {buildContentReviewInput,contentReviewTextHash as hash,reviewContent} from '../main/content-review.js';
import {isSpreadsheetExtract,selectSpreadsheetRanges,planSpreadsheetFieldCandidates} from '../main/content-review-spreadsheet-excerpts.js';
import {conditionalHtmlFieldLabels} from '../main/content-review-html-excerpts.js';
import {REVIEW_PROTOCOL_PROMPT} from '../main/content-review-protocol.js';

const opening='[XLSX 单元格值提取；公式未执行]\n\n';
const sheet=(name:string,body:string)=>'工作表: '+JSON.stringify(name)+'\n'+body+'\n\n';
const cells=(suffix='')=>'D1: "字段"\nF1: "来源"\nP1: "允许变更"\n'+[5,6,7,8].map(row=>'D'+row+': "坐标'+suffix+'"\nF'+row+': "首次不调整'+suffix+'"\nP'+row+': "是'+suffix+'"').join('\n');
const noise=(count:number)=>Array.from({length:count},(_,i)=>'A'+(i+20)+': "坐标 来源 首次不调整 允许变更 '+('资料'.repeat(30))+'"').join('\n');
const doc=(id:string,text:string)=>({id,text,sha256:hash(text),path:id+'.txt',readCoverage:'partial' as const});
function build(source:string,request='核对“目标 采集表”的D5:D8、F1/F5:F8、P1/P5:P8',artifacts='坐标 来源 首次不调整 允许变更',otherSources:ReturnType<typeof doc>[]=[]){return buildContentReviewInput({requests:[{id:'request',text:request}],artifacts:[{id:'artifact',text:artifacts,sha256:hash(artifacts),path:'PRD.md'}],sources:[doc('source',source),...otherSources]},{promptCharacters:30000});}
function validate(input:ReturnType<typeof build>){
 const contexts=[...input.requestContexts,...input.artifactContexts,...input.sourceContexts],documents=[...input.snapshot.requests,...input.snapshot.artifacts,...input.snapshot.sources],body=Math.floor((input.promptCharacterLimit-2500-REVIEW_PROTOCOL_PROMPT.length-documents.length*400-JSON.stringify(input.snapshot.assumptions).length)/2);
 assert(input.prompt.length<=input.promptCharacterLimit);assert(contexts.reduce((n,c)=>n+c.includedCharacters,0)<=body);
 for(const context of contexts){assert(context.excerpts.length<=8);const document=documents.find(d=>d.id===context.id)!;let end=0;for(const excerpt of context.excerpts){assert(excerpt.start>=end);assert.equal(excerpt.text,document.text.slice(excerpt.start,excerpt.end));assert.equal(excerpt.startLine,document.text.slice(0,excerpt.start).split('\n').length);assert.equal(excerpt.endLine,document.text.slice(0,excerpt.end).split('\n').length);end=excerpt.end;}assert.equal(context.includedCharacters,context.excerpts.reduce((n,e)=>n+e.text.length,0));}
 const {inputHash,prompt,promptHash,...material}=input;assert.equal(inputHash,hash(JSON.stringify(material)));assert.equal(promptHash,hash(prompt));
}
const included=(input:ReturnType<typeof build>,quote:string,id='source')=>input.sourceContexts.find(c=>c.id===id)!.excerpts.some(e=>e.text.includes(quote));

const conditional='<label>联络号码 <span>（合作状态=合作中时必填）</span></label>';
const fieldHeader='D1: "文本: 字段名称"\nH1: "文本: 必填"\nK1: "文本: 字段规则"\n';
function contactSheet(name:string,condition:string,merged=false){return sheet(name,(merged?'合并区域: H5:H6\n':'')+fieldHeader+'D2: "文本: 网点编码"\nH2: "文本: 是"\nK2: "文本: 一个机会门店对应一家实体门店，坚决禁止重复建档。"\n'+(merged?'D5: "文本: 联络姓名"\nH5: '+JSON.stringify('文本: '+condition)+'\nK5: "文本: 姓名规则"\n':'')+'D6: "文本: 网点联络号码"\n'+(merged?'':'H6: '+JSON.stringify('文本: '+condition)+'\n')+'K6: "文本: 电话格式"\n'+noise(300));}
function buildConditional(source:string,request='只修机会对象的重复建档分支，坚决禁止重复建档。核对D2/K2',otherSources:ReturnType<typeof doc>[]=[]){return buildContentReviewInput({requests:[{id:'request',text:request}],artifacts:[{id:'artifact',path:'index.html',text:conditional,sha256:hash(conditional)}],sources:[doc('source',source),...otherSources]},{promptCharacters:30000});}

test('explicit later worksheet outranks equal field words; all requested rows and headers retain original offsets',()=>{
 const source=opening+sheet('其他采集表',cells()+ '\n'+noise(450))+sheet('目标 采集表',cells()+'\n'+noise(300)),input=build(source);validate(input);
 assert(included(input,'工作表: "目标 采集表"'));assert(!included(input,'工作表: "其他采集表"'));
 for(const address of ['D5','D6','D7','D8','F1','F5','F6','F7','F8','P1','P5','P6','P7','P8'])assert(included(input,address+': '),address);
 assert(input.sourceContexts[0].excerpts.every(e=>e.start>=source.indexOf('工作表: "目标 采集表"')));assert.equal(input.sourceContexts[0].coverage,'partial');assert.equal(input.snapshot.sources[0].text,source);
 assert.equal(build(source).inputHash,input.inputHash);
});

test('multiple explicitly named worksheets get bounded shares before unrelated long neighbours',()=>{
 const source=opening+sheet('甲表',cells('甲')+'\n'+noise(400))+sheet('干扰表',noise(500))+sheet('乙表',cells('乙')+'\n'+noise(400));
 const selected=selectSpreadsheetRanges(source,1800,new Set(['坐标']),'比较甲表、乙表 D5:D8 F1/F5:F8 P1/P5:P8','');const text=selected.ranges.map(r=>source.slice(r.start,r.end)).join('\n');
 assert(text.includes('工作表: "甲表"'));assert(text.includes('工作表: "乙表"'));assert(!text.includes('工作表: "干扰表"'));for(const suffix of ['甲','乙']){assert(text.includes('F8: "首次不调整'+suffix+'"'));assert(text.includes('P8: "是'+suffix+'"'));}assert(selected.ranges.length<=8);assert(selected.ranges.reduce((n,r)=>n+r.end-r.start,0)<=1800);
});

test('same worksheet and field names across sources keep independent hashes, aliases and quoted offsets',async()=>{
 const sourceA=opening+sheet('目标 采集表',cells('甲')+'\n'+noise(400)),sourceB=opening+sheet('其他表',noise(400))+sheet('目标 采集表',cells('乙')+'\n'+noise(400)),input=build(sourceA,undefined,undefined,[doc('another-source',sourceB)]);validate(input);assert(included(input,'F5: "首次不调整甲"'));assert(included(input,'F5: "首次不调整乙"','another-source'));
 const ref=input.referenceTable.find(r=>r.id==='another-source')!.alias;
 const raw={findings:[{category:'contradiction',severity:'blocking',confidence:'high',scope:'uncertain',repairDisposition:'record_only',explanation:'仅验证引用，不评定业务。',artifacts:[{artifactRef:'A1',quote:'首次不调整'}],sources:[{sourceRef:ref,quote:'F5: "首次不调整乙"'}],requests:[]}],coverage:{artifactRefs:['A1'],sourceRefs:input.referenceTable.filter(r=>r.kind==='source').map(r=>r.alias),requestRefs:['R1'],directions:['contradiction'],limitations:[]}};
 const receipt=await reviewContent({input,reviewer:{provider:'offline',modelId:'none',protocol:'callback'},review:async()=>({raw,stopReason:'stop'})});assert.equal(receipt.findings.length,1);const bound=receipt.findings[0].sourceBindings[0];assert.equal(bound.id,'another-source');assert.equal(bound.sha256,hash(sourceB));assert.equal(sourceB.slice(bound.start,bound.end),bound.quote);assert(bound.start>sourceB.indexOf('工作表: "目标 采集表"'));
});

test('oversized single cell preserves later requested cells and marks truncation in actual prompt',()=>{
 const body='D1: "字段"\nF1: "来源"\nP1: "允许变更"\nD5: "坐标"\nF5: "'+('长值😀'.repeat(20000))+'结尾"\nP5: "是"';
 const source=opening+sheet('目标 采集表',body),input=build(source,'核对目标采集表 D5 F1 F5 P1 P5');validate(input);
 assert(included(input,'P5: "是"'));assert(included(input,'D5: "坐标"'));assert(!included(input,'结尾"'));
 assert(input.coverageLimits.some(x=>x.includes('CELL_TEXT_TRUNCATED')));assert(input.coverageLimits.some(x=>x.includes('TARGET_CELLS_NOT_INCLUDED')));assert(input.prompt.includes('CELL_TEXT_TRUNCATED'));assert.equal(input.sourceContexts[0].coverage,'partial');
});

test('a long unrelated row between targets cannot consume all remaining worksheet quota',()=>{
 const body='D1: "字段"\nF1: "来源"\nP1: "允许变更"\nA2: "'+('无关'.repeat(20000))+'"\n'+cells().split('\n').slice(3).join('\n'),source=opening+sheet('目标 采集表',body),input=build(source);validate(input);for(const address of ['D5','F5','P5','D8','F8','P8'])assert(included(input,address+': '));assert(!included(input,'A2: '));
});

test('worksheet names normalize whitespace and escaped JSON names without changing source bytes',()=>{
 const source=opening+sheet('其他表',noise(400))+sheet('目标 "采集" 表',cells()+'\n'+noise(400)),input=build(source,'核对目标"采集"表 D5:D8 F1/F5:F8 P1/P5:P8');validate(input);assert(included(input,'工作表: "目标 \\"采集\\" 表"'));assert(included(input,'P8: "是"'));
});

test('too many explicit worksheets report omitted coverage and retain the excerpt count cap',()=>{
 const names=Array.from({length:10},(_,i)=>'目标表'+i),source=opening+names.map(name=>sheet(name,cells()+'\n'+noise(30))).join(''),input=build(source,'核对'+names.join('、')+' D5:D8 F1/F5:F8 P1/P5:P8');validate(input);assert(input.coverageLimits.some(x=>x.includes('SHEET_SELECTION_LIMIT')));assert(input.prompt.includes('SHEET_SELECTION_LIMIT'));assert.equal(input.sourceContexts[0].coverage,'partial');
});

test('plain Markdown containing worksheet words is outside the extraction selector',()=>{
 assert.equal(isSpreadsheetExtract('用户要求\n工作表: "表"\nD5: "值"'),false);
});

test('official hidden and veryHidden worksheet markers remain boundaries with original state labels',()=>{
 const source=opening+sheet('可见表',cells())+'工作表: "隐藏表" [隐藏工作表]\n'+cells('隐藏')+'\n\n工作表: "深藏表" [深度隐藏工作表]\n'+cells('深藏')+'\n'+noise(400);
 const input=build(source,'核对隐藏表、深藏表 D5 F1 F5 P1 P5');validate(input);assert(included(input,'工作表: "隐藏表" [隐藏工作表]'));assert(included(input,'工作表: "深藏表" [深度隐藏工作表]'));assert(!included(input,'工作表: "可见表"'));assert(included(input,'F5: "首次不调整隐藏"'));assert(included(input,'F5: "首次不调整深藏"'));
 const visible=build(source,'只核对可见表 D5 F1 F5 P1 P5');assert(!included(visible,'隐藏表'));assert(!included(visible,'深藏表'));assert(visible.sourceContexts[0].excerpts.every(e=>e.end<=source.indexOf('工作表: "隐藏表"')));
});

test('malformed worksheet JSON is a bounded diagnostic and never leaks cells into a preceding sheet',()=>{
 const source=opening+sheet('目标 采集表',cells())+'工作表: "坏\\x标题"\nD5: "错误表值"\n'+noise(400),input=build(source);validate(input);assert(included(input,'P5: "是"'));assert(!included(input,'错误表值'));assert(input.coverageLimits.some(x=>x.includes('MALFORMED_SHEET_HEADER')));assert(input.prompt.includes('MALFORMED_SHEET_HEADER'));
});

test('title-only quotas explicitly report that no worksheet cells reached review',()=>{
 const source=opening+sheet('甲表',cells()+noise(500))+sheet('乙表',cells()+noise(500)),selected=selectSpreadsheetRanges(source,26,new Set(),'核对甲表、乙表','');assert(selected.limitations.includes('SHEET_CELLS_NOT_INCLUDED'));assert(selected.limitations.includes('SHEET_HEADER_PARTIAL'));assert(selected.ranges.reduce((n,r)=>n+r.end-r.start,0)<=26);
});

test('numbered project paths do not create cell requests, while slash-separated cell ranges remain valid',()=>{
 const source=opening+sheet('目标 采集表',cells()+'\n'+noise(400)),plain=build(source),withPath=build(source,'只改ABC12/PRD.md。核对“目标 采集表”的D5:D8、F1/F5:F8、P1/P5:P8');
 validate(withPath);for(const address of ['D5','D8','F1','F5','F8','P1','P5','P8'])assert(included(withPath,address+': '));
 const selected=(input:ReturnType<typeof build>)=>input.sourceContexts[0].excerpts.map(({start,end})=>({start,end}));assert.deepEqual(selected(withPath),selected(plain));
});

test('conditional literal candidates include distinct objects, complete shared rule rows and primary request evidence',()=>{
 const source=opening+contactSheet('正式对象','当合作状态=合作中时必填',true)+contactSheet('线上对象','线上条件',true)+contactSheet('机会对象','否'),input=buildConditional(source);validate(input);
 for(const name of ['正式对象','线上对象','机会对象'])assert(included(input,'工作表: '+JSON.stringify(name)));
 for(const quote of ['合并区域: H5:H6','D5: "文本: 联络姓名"','D6: "文本: 网点联络号码"','H5: "文本: 当合作状态=合作中时必填"','H6: "文本: 否"','D1: "文本: 字段名称"','H1: "文本: 必填"','K2: "文本: 一个机会门店对应一家实体门店，坚决禁止重复建档。"'])assert(included(input,quote),quote);
 assert(input.coverageLimits.some(limit=>limit.includes('CANDIDATE_MERGED_CONDITION_AMBIGUOUS')));assert(input.prompt.includes('CANDIDATE_CONTEXT_ONLY_NOT_FIELD_EVIDENCE'));
 const plan=planSpreadsheetFieldCandidates(input.snapshot.sources,input.snapshot.artifacts).get('source')!;assert.equal(plan.candidates.length,3);assert.equal(plan.candidates.filter(c=>c.merged).length,2);
 assert(!('spreadsheetEvidence'in input.sourceContexts[0]));assert.equal(input.snapshot.sources[0].text,source);
});

test('business request without coordinates still protects duplicate prohibition before supplemental candidates',()=>{
 const source=opening+contactSheet('正式对象','当合作状态=合作中时必填',true)+contactSheet('机会对象','否'),input=buildConditional(source,'只修机会对象的重复建档：一个机会门店对应一家实体门店，坚决禁止重复建档。');validate(input);
 assert(included(input,'D2: "文本: 网点编码"'));assert(included(input,'K2: "文本: 一个机会门店对应一家实体门店，坚决禁止重复建档。"'));assert(included(input,'H5: "文本: 当合作状态=合作中时必填"'));
});

test('snapshot-wide candidate cap and label cap fairly rotate across sources and worksheets',()=>{
 const source=opening+Array.from({length:20},(_,i)=>sheet('对象'+i,fieldHeader+'D6: "文本: 联络号码"\nH6: "文本: 否"\nK6: "文本: 各表独立"')).join(''),sources=[doc('a',source),doc('b',source),doc('c',source)],plans=planSpreadsheetFieldCandidates(sources,[{path:'index.html',text:conditional}]),counts=[...plans.values()].map(plan=>plan.candidates.length);
 assert.equal(counts.reduce((a,b)=>a+b,0),16);assert(Math.max(...counts)-Math.min(...counts)<=1);for(const plan of plans.values()){assert.equal(new Set(plan.candidates.map(c=>c.sheet)).size,plan.candidates.length);assert(plan.limitations.includes('CANDIDATE_SELECTION_LIMIT'));}
 const labelHtml=(prefix:string)=>Array.from({length:7},(_,i)=>'<label>'+prefix+i+'<span>当状态变化时必填</span></label>').join(''),names=['字段甲','字段乙'],manyLabels=names.map(name=>({path:name+'.html',text:labelHtml(name)})),manySource=opening+sheet('对象',fieldHeader+names.flatMap((name,index)=>Array.from({length:7},(_,i)=>'D'+(index*7+i+2)+': "文本: '+name+i+'"\nH'+(index*7+i+2)+': "文本: 否"\nK'+(index*7+i+2)+': "文本: 原文"')).join('\n')),labelPlan=planSpreadsheetFieldCandidates([doc('source',manySource)],manyLabels).get('source')!;
 assert.equal(labelPlan.candidates.length,8);assert(labelPlan.limitations.includes('CANDIDATE_LABEL_LIMIT'));const quoted=labelPlan.candidates.map(c=>c.ranges.map(r=>manySource.slice(r.start,r.end)).join('')).join('');assert(quoted.includes('字段甲3'));assert(quoted.includes('字段乙3'));assert(!quoted.includes('字段甲6'));
});

test('candidate blocks never truncate long merged conditions or sacrifice the main request on budget exhaustion',()=>{
 const source=opening+contactSheet('正式对象','长条件'.repeat(2000),true)+contactSheet('机会对象','否'),request='核对机会对象 D2 K2，禁止重复建档',plan=planSpreadsheetFieldCandidates([doc('source',source)],[{path:'index.html',text:conditional}]).get('source')!,selected=selectSpreadsheetRanges(source,1600,new Set(['禁止重复建档']),request,conditional,plan,new Set(['禁止重复建档'])),quoted=selected.ranges.map(r=>source.slice(r.start,r.end)).join('');
 assert(quoted.includes('D2: "文本: 网点编码"'));assert(quoted.includes('禁止重复建档'));assert(!quoted.includes('工作表: "正式对象"'));assert(!quoted.includes('长条件'));assert(selected.limitations.includes('CANDIDATE_CONTEXT_NOT_INCLUDED'));assert(selected.ranges.length<=8);assert(selected.ranges.reduce((n,r)=>n+r.end-r.start,0)<=1600);
});

test('static conditional labels ignore script/style/comments, reject ambiguous names and do not hardcode a field',()=>{
 const hidden='<label>伪造字段<span>当状态变化时必填</span></label>',html='<!--'+hidden+'--><script>const x='+JSON.stringify(hidden)+'</script><style>'+hidden+'</style><label>配送方式 <span>当状态为配送时必填</span></label><label><b>嵌套字段</b><span>当状态变化时必填</span></label><label>实体&amp;字段<span>当状态变化时必填</span></label><label>名称<span>当状态变化时必填</span></label>',labels=conditionalHtmlFieldLabels(html);
 assert.deepEqual(labels.labels,['配送方式']);assert(labels.limitations.includes('CANDIDATE_LABEL_UNSUPPORTED'));
 const source=opening+sheet('其它对象','B1: "文本: 字段名称"\nC1: "文本: 必填"\nF1: "文本: 字段规则"\nB7: "文本: 网点配送方式"\nC7: "文本: 条件"\nF7: "文本: 各自规则"'),plan=planSpreadsheetFieldCandidates([doc('source',source)],[{path:'index.html',text:html}]).get('source')!;
 assert.equal(plan.candidates.length,1);assert.equal(plan.candidates[0].fieldAddress,'B7');assert(!plan.candidates[0].merged);
});

test('missing merged master, malformed merge and unsupported headers are explicit unknown, never reconstructed values',()=>{
 for(const body of ['合并区域: H5:H6\n'+fieldHeader+'D6: "文本: 联络号码"\nK6: "文本: 规则"','合并区域: broken\n'+fieldHeader+'D6: "文本: 联络号码"\nH6: "文本: 否"\nK6: "文本: 规则"','D1: "文本: 未识别表头"\nD6: "文本: 联络号码"']){
  const source=opening+sheet('对象',body),plan=planSpreadsheetFieldCandidates([doc('source',source)],[{path:'index.html',text:conditional}]).get('source')!;assert.equal(plan.candidates.length,0);assert(plan.limitations.some(code=>/INCOMPLETE|UNSUPPORTED/.test(code)));
 }
 assert.equal(planSpreadsheetFieldCandidates([doc('plain','工作表: "对象"\nD6: "联络号码"')],[{path:'index.html',text:conditional}]).size,0);
});

test('full short source still declares quoted candidate context and merged ambiguity, not formal field evidence',()=>{
 const source=opening+sheet('对象','合并区域: H5:H6\n'+fieldHeader+'D5: "文本: 联络姓名"\nH5: "文本: 合作状态为合作中时必填"\nK5: "文本: 姓名规则"\nD6: "文本: 联络号码"\nK6: "文本: 电话格式"'),input=buildConditional(source,'只核对字段');validate(input);
 assert.equal(input.sourceContexts[0].includedCharacters,source.length);assert(input.coverageLimits.some(x=>x.includes('CANDIDATE_MERGED_CONDITION_AMBIGUOUS')));assert(input.coverageLimits.some(x=>x.includes('CANDIDATE_CONTEXT_ONLY_NOT_FIELD_EVIDENCE')));assert(!('spreadsheetEvidence'in input.sourceContexts[0]));
});

test('artifact-explicit secondary worksheet supplements request priority without inferring rule equivalence',()=>{
 const source=opening+sheet('请求对象',cells()+'\n'+noise(300))+sheet('成果对象',cells('次级')+'\n'+noise(300)),selected=selectSpreadsheetRanges(source,1800,new Set(['坐标']),'核对请求对象 D5:D8 F1/F5:F8 P1/P5:P8','正文明确涉及成果对象'),quoted=selected.ranges.map(r=>source.slice(r.start,r.end)).join('');
 assert(quoted.includes('工作表: "请求对象"'));assert(quoted.includes('F8: "首次不调整"'));assert(quoted.includes('工作表: "成果对象"'));assert(quoted.includes('F8: "首次不调整次级"'));assert(selected.ranges.length<=8);
});
