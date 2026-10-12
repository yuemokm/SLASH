import ExcelJS from 'exceljs';
import {TEST_CASE_NOTICE,testCaseTypeLabels,type TestCaseSuite} from '../shared/test-cases.js';

const plain=(value:string)=>value.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/([\\`*_[\]#|])/g,'\\$1');
const lines=(values:string[])=>values.length?values.map(v=>'- '+plain(v)).join('\n'):'- 无';
export function testCasesToMarkdown(suite:TestCaseSuite){
 const out=[`# ${plain(suite.title)}`,'',TEST_CASE_NOTICE,'',`范围：${plain(suite.scope)}`,'','状态：已生成 · 未执行 · 业务待核对','',`来源任务：${plain(suite.originRunId)}`,'','## 来源版本',''];
 for(const s of suite.sourceSnapshots)out.push(`- ${s.id}：${plain(s.mountId+'/'+s.path)}；版本 ${plain(s.versionId)}；SHA-256 ${s.contentHash}；${s.truncated?'已读片段':'已读正文'}${s.locator?'；位置 '+plain(s.locator):''}`);
 out.push('','## 整体待确认','',lines(suite.pendingQuestions));
 for(const c of suite.cases){out.push('',`## ${plain(c.id)} · ${plain(c.title)}`,'',`模块：${plain(c.module)} · 优先级：${c.priority} · 类型：${testCaseTypeLabels[c.type]} · 未执行`,'','### 前置条件','',lines(c.preconditions),'','### 测试数据','',lines(c.testData),'','### 步骤与预期','');c.steps.forEach((s,i)=>out.push(`${i+1}. 操作：${plain(s.action)}  \n   预期：${plain(s.expected)}`));out.push('',`来源：${c.sourceIds.join('、')}`,`需求/规则：${c.requirementRefs.map(r=>r.requirementId+(r.constraintIds.length?' / '+r.constraintIds.join('、'):'')).join('；')||'未关联需求记录'}`,'','### 待确认','',lines(c.pendingQuestions));}
 return out.join('\n')+'\n';
}
export async function testCasesToXlsx(suite:TestCaseSuite){
 const workbook=new ExcelJS.Workbook();workbook.creator='Slash';workbook.created=new Date(suite.generatedAt);
 const sheet=workbook.addWorksheet('测试用例',{views:[{state:'frozen',ySplit:1}]});
 const columns=['编号','模块','标题','优先级','类型','前置条件','测试数据','操作步骤','预期结果','需求/规则','来源ID','待确认','执行状态'];
 sheet.columns=columns.map((header,i)=>({header,key:String(i),width:[18,20,32,10,10,35,30,50,50,30,35,40,14][i]}));
 for(const c of suite.cases)sheet.addRow([c.id,c.module,c.title,c.priority,testCaseTypeLabels[c.type],c.preconditions.join('\n'),c.testData.join('\n'),c.steps.map((s,i)=>`${i+1}. ${s.action}`).join('\n'),c.steps.map((s,i)=>`${i+1}. ${s.expected}`).join('\n'),c.requirementRefs.map(r=>r.requirementId+(r.constraintIds.length?' / '+r.constraintIds.join('、'):'')).join('\n'),c.sourceIds.join('\n'),c.pendingQuestions.join('\n'),'未执行']);
 sheet.autoFilter={from:{row:1,column:1},to:{row:1,column:columns.length}};
 const sources=workbook.addWorksheet('来源与说明',{views:[{state:'frozen',ySplit:1}]});
 sources.columns=[{header:'项目',width:24},{header:'内容',width:100}];
 sources.addRows([['标题',suite.title],['范围',suite.scope],['状态','已生成 · 未执行 · 业务待核对'],['说明',TEST_CASE_NOTICE],['来源任务',suite.originRunId],['生成时间',suite.generatedAt]]);
 for(const question of suite.pendingQuestions)sources.addRow(['整体待确认',question]);
 for(const s of suite.sourceSnapshots)sources.addRows([[s.id,s.mountId+'/'+s.path],['版本',s.versionId],['SHA-256',s.contentHash],['已读范围',`${s.truncated?'片段':'正文'}，${s.includedCharacters}字符${s.locator?'；'+s.locator:''}`],['读取时间',s.readAt]]);
 for(const tab of [sheet,sources]){tab.getRow(1).font={bold:true,color:{argb:'FFFFFFFF'}};tab.getRow(1).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF344054'}};tab.eachRow(row=>{row.alignment={vertical:'top',wrapText:true};row.eachCell(cell=>{if(typeof cell.value!=='string')throw Error('TEST_CASE_EXPORT_VALUE_INVALID');if(cell.value.length>32767)throw Error('TEST_CASE_EXPORT_CELL_LIMIT: '+(tab===sheet?'用例 '+String(row.getCell(1).value):'来源与说明第 '+row.number+' 行')+' / '+String(tab.getRow(1).getCell(cell.col).value)+' 超过Excel单元格32767字符，请在会话中拆分该内容后重试');});});}
 // Assigning strings (never formula objects) preserves =,+,-,@ as literal text.
 return Buffer.from(await workbook.xlsx.writeBuffer());
}
