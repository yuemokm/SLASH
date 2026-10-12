import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {freezePrdTemplate,checkPrdTemplate} from '../main/prd-template.js';
const source={mountId:'m',path:'template.md',contentHash:'a'.repeat(64),versionId:'current',readAt:'2026-10-08T00:00:00Z',characters:0,includedCharacters:0,truncated:true};
const freeze=(content:string)=>freezePrdTemplate({source,parserVersion:'markdown-gfm-1'},content);
const template='# 模板标题\n\n# 1. 功能需求\n\n## 1.1 详细说明\n\n### 1.1.X [功能名称]\n\n|字段名称|类型|默认值|校验规则|\n|---|---|---|---|\n|[字段]|[类型]|[默认值]|[校验]|\n\n# 2. 集成需求\n\n## 2.1 详细说明\n\n填写接口情况。\n';
test('parent scoped sections, wildcard per-feature headings, schema columns and output title offset',()=>{
 const frozen=freeze(template),valid='# 会员项目 PRD\n\n'+template.replace('# 模板标题\n\n','').replace(/^#/gm,'##').replace('1.1.X [功能名称]','1.1.1 创建会员').replace('[字段]','姓名').replace('[类型]','文本').replace('[默认值]','无').replace('[校验]','不能为空');
 const passed=checkPrdTemplate(frozen,valid,'b'.repeat(64));assert.equal(passed.status,'passed',passed.reason);
 const missingColumn=checkPrdTemplate(frozen,valid.replace('|默认值','').replace('|---|---|---|---|','|---|---|---|').replace('|无',''),'b'.repeat(64));assert.equal(missingColumn.status,'failed');assert.match(missingColumn.reason,/默认值/);
 const missingSection=checkPrdTemplate(frozen,valid.replace('### 2.1 详细说明\n\n填写接口情况。',''),'b'.repeat(64));assert.equal(missingSection.status,'failed');assert.match(missingSection.reason,/集成需求.*2.1/);
});
test('reasoned N/A is unverified; sibling pending content cannot excuse a missing section',()=>{
 const actual=template.replace('## 2.1 详细说明\n\n填写接口情况。','暂不涉及：本模块为离线录入，尚无外部接口。');
 assert.equal(checkPrdTemplate(freeze(template),actual,'b'.repeat(64)).status,'unverified');
 const sibling=actual.replace('暂不涉及：本模块为离线录入，尚无外部接口。','## 2.2 接口清单\n\n待确认：目前未提供接口定义。');
 assert.equal(checkPrdTemplate(freeze(template),sibling,'b'.repeat(64)).status,'failed');
});
test('unknown matrix headers remain coverage unknown; sample values and renamed numbered business slots are not required',()=>{
 const text='# 5. 核心业务对象状态机\n\n## 5.1 销售订单\n\n|原状态→目标状态|草稿|审核中|\n|---|---|---|\n|草稿|||\n';
 const result=checkPrdTemplate(freeze(text),text.replace('销售订单','会员申请').replaceAll('草稿','待录入').replaceAll('审核中','已保存'),'b'.repeat(64));
 assert.equal(result.status,'unverified',result.reason);assert.doesNotMatch(result.reason,/缺少模板/);
});
test('extra unfamiliar columns cannot dilute required schema and unrelated notes cannot excuse missing existing columns',()=>{
 const frozen=freeze(template),extra=template.replace('|校验规则|','|校验规则|A|B|C|D|E|F|G|H|').replace('|---|---|---|---|','|---|---|---|---|---|---|---|---|---|---|---|---|');
 assert.equal(checkPrdTemplate(frozen,extra,'b'.repeat(64)).status,'passed');
 const missing=extra.replace('|默认值','').replace('|---|---|---|---|---|---|---|---|---|---|---|---|','|---|---|---|---|---|---|---|---|---|---|---|').replace('### 1.1.X [功能名称]','### 1.1.1 创建会员\n\n待确认：目前没有接口资料，但字段默认值另行核对。');
 const result=checkPrdTemplate(frozen,missing,'b'.repeat(64));assert.equal(result.status,'failed');assert.match(result.reason,/默认值/);
});
test('numbered X slot cannot match an unrelated sibling subtree',()=>{
 const actual=template.replace('### 1.1.X [功能名称]','### 9.9.1 另一个模块');
 assert.equal(checkPrdTemplate(freeze(template),actual,'b'.repeat(64)).status,'failed');
});
test('nested ordinal X slots match each numbered segment; placeholder title alone keeps ordinal exact',()=>{
 const text='# 1. 功能\n\n## 1.1.X [功能]\n\n### 1.1.X.1 操作\n\n填写操作说明。\n';
 assert.equal(checkPrdTemplate(freeze(text),text.replaceAll('1.1.X','1.1.2').replace('[功能]','注册会员'),'b'.repeat(64)).status,'passed');
 const fixed='# 1. 功能\n\n## 1.1 [功能名称]\n\n填写说明。\n';assert.equal(checkPrdTemplate(freeze(fixed),fixed.replace('1.1 [功能名称]','1.1.3 注册'),'b'.repeat(64)).status,'failed');
});
test('unnumbered document title above child sections can be renamed',()=>{
 const text='# 通用PRD模板\n\n## 背景\n\n填写背景。\n\n## 功能\n\n填写功能。\n';
 assert.equal(checkPrdTemplate(freeze(text),text.replace('通用PRD模板','会员系统PRD'),'b'.repeat(64)).status,'passed');
});
test('same-title numbered sibling sections cannot share one actual heading',()=>{
 const text='# 1. 功能\n\n## 1.1 详细说明\n\n第一项说明。\n\n## 1.2 详细说明\n\n第二项说明。\n';
 const result=checkPrdTemplate(freeze(text),text.replace('## 1.2 详细说明\n\n第二项说明。',''),'b'.repeat(64));assert.equal(result.status,'failed');assert.match(result.reason,/1.2/);
});
test('duplicate template column labels are ambiguous coverage rather than a trusted schema',()=>{
 const text='# 1. 功能\n\n|字段名称|类型|类型|\n|---|---|---|\n|名称|文本|文本|\n';
 const frozen=freeze(text);assert.equal(frozen.tables[0].known,false);assert.equal(checkPrdTemplate(frozen,text,'b'.repeat(64)).status,'unverified');
});
test('split heading numbering remains ambiguous and cannot impose a sample business name',()=>{
 const text='# 5. 核心业务对象状态机\n\n## 5 1.X T0X名称\n\n|字段名称|默认值|\n|---|---|\n|[字段]|[默认值]|\n\n# 6. 集成需求\n\n## 6.2 详细说明\n\n说明接口范围。\n';
 const actual='# 5. 核心业务对象状态机\n\n## 5.1 会员申请\n\n|字段名称|类型|\n|---|---|\n|姓名|文本|\n\n# 6. 集成需求\n\n接口资料尚待提供。\n';
 const frozen=freeze(text),result=checkPrdTemplate(frozen,actual,'b'.repeat(64));assert.equal(frozen.sections[1].ambiguous,true);assert.equal(result.status,'failed');assert.match(result.reason,/默认值/);assert.match(result.reason,/6.2/);assert.doesNotMatch(result.reason,/缺少模板章节[^；]*T0X/);
 const observation=JSON.parse(result.evidence[0].observed as string);assert(observation.coverageUnknown.some((reason:string)=>reason.includes('编号续段')));
});
test('actual user template vs previous PRD catches original default column and 6.2 defects generically',async()=>{
 const original=await fs.readFile('.test-data/docx-structure-replay-NUgXlN/extracted.md','utf8');
 const previous=await fs.readFile('.test-data/prd-template-findrows-retest/case-PRD-TEMPLATE/pending-1.md','utf8');
 const frozen=freeze(original),result=checkPrdTemplate(frozen,previous,'b'.repeat(64));
 assert.equal(result.status,'failed',result.reason);assert.match(result.reason,/默认值/);assert.match(result.reason,/6.2/);assert.equal(frozen.sections.length,25);assert.equal(frozen.tables.length,11);assert.equal(frozen.tables.filter(t=>t.known).length,10);
});
