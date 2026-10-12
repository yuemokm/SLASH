import test from 'node:test';import assert from 'node:assert/strict';
import {DOCX_STRUCTURE_LIMITS,deriveDocxHtmlTableLayout,renderDocxHtmlStructure} from '../main/docx-structured-text.js';
import {OFFICE_TEXT_PARSER_VERSION} from '../main/office-extraction.js';
const cell=(cell:number,colSpan=1,rowSpan=1)=>({cell,colSpan,rowSpan});
test('combined row and column spans retain conversion node identities and prove rectangle',()=>{
 const result=deriveDocxHtmlTableLayout([{row:1,cells:[cell(1,1,2),cell(2,2)]},{row:2,cells:[cell(1),cell(2)]}]);assert.equal(result.status,'verified');if(result.status!=='verified')return;assert.equal(result.columns,3);assert.equal(result.coveredSlots,6);assert.deepEqual(result.cells,[{row:1,cell:1,columnStart:1,columnEnd:1,rowEnd:2},{row:1,cell:2,columnStart:2,columnEnd:3,rowEnd:1},{row:2,cell:1,columnStart:2,columnEnd:2,rowEnd:2},{row:2,cell:2,columnStart:3,columnEnd:3,rowEnd:2}]);const rendered=renderDocxHtmlStructure('<table><tr><td rowspan="2">甲</td><td colspan="2">乙</td></tr><tr><td>丙</td><td>丁</td></tr></table>');assert(rendered.text.includes('：甲\n  [布局列1]'));assert(rendered.text.includes('：乙\n  [布局列2–3]'));assert.equal(rendered.structure.tables[0].layout?.status,'verified');
});
test('crossing an occupied rowspan rejects entire layout',()=>{
 assert.deepEqual(deriveDocxHtmlTableLayout([{row:1,cells:[cell(1),cell(2,1,2)]},{row:2,cells:[cell(1,2)]}]),{status:'unknown',basis:'converted_html',reasons:['OCCUPANCY_CONFLICT']});
});
test('holes and uneven row widths reject instead of inferring omitted cells',()=>{
 const result=deriveDocxHtmlTableLayout([{row:1,cells:[cell(1),cell(2)]},{row:2,cells:[cell(1)]}]);assert.equal(result.status,'unknown');if(result.status==='unknown')assert.deepEqual(result.reasons,['NON_RECTANGULAR']);
});
test('rowspan out of bounds, invalid span and inconsistent identity reject',()=>{
 for(const rows of [[{row:1,cells:[cell(1,1,2)]}],[{row:1,cells:[cell(1,0)]}],[{row:2,cells:[cell(1)]}],[{row:1,cells:[cell(2)]}]])assert.equal(deriveDocxHtmlTableLayout(rows).status,'unknown');
});
test('expanded slot budget includes vertical coverage and fails before allocation',()=>{
 assert.equal(deriveDocxHtmlTableLayout([{row:1,cells:[cell(1,4,2)]},{row:2,cells:[]}],{maxCoveredSlots:7}).status,'unknown');assert.equal(deriveDocxHtmlTableLayout([{row:1,cells:[cell(1,250000)]},{row:2,cells:[cell(1,250000)]}]).status,'unknown');
});
test('verified layout is adjacent to each original text and keeps continuous quotes',()=>{
 const result=renderDocxHtmlStructure('<table><tr><td rowspan="2">甲原句</td><td>乙原句</td></tr><tr><td>丙原句</td></tr></table>');assert.equal(result.structure.tables[0].layout?.status,'verified');assert(result.text.includes('转换HTML布局列已核对，非Word网格；业务含义仍需对照原文'));assert(result.text.includes('- 行 2 / 格 1（横跨 1，纵跨 1）：丙原句\n  [布局列2]'));assert(!result.text.includes('列归属待核对'));
});
test('render propagates custom limits to expanded slot validation',()=>{
 const result=renderDocxHtmlStructure('<table><tr><td colspan="2" rowspan="2">甲</td></tr><tr></tr></table>',[],{...DOCX_STRUCTURE_LIMITS,cells:3});assert.equal(result.structure.tables[0].layout?.status,'unknown');if(result.structure.tables[0].layout?.status==='unknown')assert.deepEqual(result.structure.tables[0].layout.reasons,['SLOT_LIMIT']);assert(result.text.includes('列归属待核对'));assert(!result.text.includes('[布局列'));
});
test('nested and uneven conversions retain text without claiming a verified layout',()=>{
 for(const html of ['<table><tr><td>甲<table><tr><td>内层</td></tr></table></td></tr></table>','<table><tr><td>甲</td><td>乙</td></tr><tr><td>丙</td></tr></table>']){const result=renderDocxHtmlStructure(html);assert.equal(result.structure.tables[0].layout?.status,'unknown');assert(result.text.includes('列归属待核对'));assert(result.text.includes('甲'));}
});
test('simple table text stays byte-identical and changed serializer has new cache version',()=>{
 const result=renderDocxHtmlStructure('<table><tr><td>甲</td><td>乙</td></tr><tr><td>丙</td><td>丁</td></tr></table>');assert(result.text.includes('[表格 table[1]]\n|甲|乙|\n|---|---|\n|丙|丁|'));assert(!result.text.includes('布局覆盖'));assert.equal(OFFICE_TEXT_PARSER_VERSION,'office-text-v6-docx-html-layout-compact');
});
