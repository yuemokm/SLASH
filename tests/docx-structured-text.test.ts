import test from 'node:test';
import assert from 'node:assert/strict';
import {unified} from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import {DOCX_STRUCTURE_LIMITS,renderDocxHtmlStructure} from '../main/docx-structured-text.js';

test('same-name headings preserve their separate parent order and level; labels are source text',()=>{
 const result=renderDocxHtmlStructure('<h1>业务场景</h1><h2>详细说明</h2><p>场景目标：[填写]</p><h1>集成需求</h1><h2>详细说明</h2><p>接口清单：待确认</p>');
 assert.deepEqual(result.structure.headings.map(h=>[h.level,h.text]),[[1,'业务场景'],[2,'详细说明'],[1,'集成需求'],[2,'详细说明']]);
 assert.match(result.text,/# 业务场景\n\n## 详细说明[^]*# 集成需求\n\n## 详细说明/);
 assert.match(result.text,/不确认模板示例或业务含义/);
});

test('tables keep row/column order, blank cells, pipes, escaped entities and multiline cell text',()=>{
 const result=renderDocxHtmlStructure('<table><tr><td>字段名称</td><td>默认值</td><td>备注</td></tr><tr><td><p>A|B &amp; C</p></td><td></td><td><p>第一行</p><p>第二行<br />第三行&nbsp;&lt;值&gt;</p></td></tr></table>');
 assert.deepEqual(result.structure.tables[0].rows[1].cells.map(c=>c.text),['A|B & C','','第一行\n第二行\n第三行 <值>']);
 const header=result.text.split('\n').find(line=>line.startsWith('|字段名称'))!;
 assert.deepEqual(header.split('|').slice(1,-1),['字段名称','默认值','备注']);
 assert.match(result.text,/A\\\|B & C\|\|第一行<br\/>第二行<br\/>第三行/);
 assert.match(result.text,/第一行仅为结构展示，不确认其为业务表头/);
 assert.equal(result.structure.tables[0].representation,'rows');
});

test('ordered and nested lists preserve source sequence, without inferring original Word numbering',()=>{
 const {text}=renderDocxHtmlStructure('<ol><li>场景目标</li><li>流程<ul><li>异常 A</li><li>异常 B</li></ul></li><li>结果</li></ol><p>结束</p>');
 assert.match(text,/1\. 场景目标[^]*2\. 流程\n  - 异常 A\n  - 异常 B[^]*3\. 结果[^]*结束/);
 assert.match(text,/列表编号为转换序号/);
});

test('merged, irregular and nested tables use explicit row/cell coordinates without inventing a grid',()=>{
 const merged=renderDocxHtmlStructure('<table><tr><td colspan="2" rowspan="2">合并</td><td>右</td></tr><tr><td>下</td></tr></table>');
 assert.equal(merged.structure.tables[0].representation,'cell_coordinates');
 assert.match(merged.text,/行 1 \/ 格 1（横跨 2，纵跨 2）：合并/);
 assert.match(merged.text,/未推断业务列归属或展开网格/);
 const nested=renderDocxHtmlStructure('<table><tr><td>外部<table><tr><td>内部</td></tr></table></td></tr></table>');
 assert.equal(nested.structure.tables.length,2);
 assert.equal(nested.structure.tables[0].representation,'cell_coordinates');
 assert.equal(nested.structure.tables[1].locator,'docx-html/table[2]');
 assert.match(nested.text,/\[表格 table\[2\]\]/);
 assert.equal(nested.text.match(/内部/g)?.length,1,'nested text is rendered once rather than copied into the parent cell');
 const irregular=renderDocxHtmlStructure('<table><tr><td>A</td><td>B</td></tr><tr><td>C</td></tr></table>');
 assert.equal(irregular.structure.tables[0].representation,'cell_coordinates');
});

test('cell links, image alternative source text and list sequence survive structural rendering',()=>{
 const result=renderDocxHtmlStructure('<p><img src="omitted" alt="图说明 &amp; 来源" /></p><table><tr><td>资料</td></tr><tr><td><p><a href="https://example.invalid/standard?a=1&amp;b=2">规范</a></p><img src="omitted" alt="表内图说明" /><ol><li>第一项</li><li>第二项</li></ol></td></tr></table>');
 assert.match(result.text,/来源替代文字（非 OCR）：图说明 & 来源/);
 assert.match(result.text,/https:\/\/example.invalid\/standard\?a=1&b=2；未请求/);
 assert.match(result.text,/来源替代文字（非 OCR）：表内图说明/);
 assert.match(result.structure.tables[0].rows[1].cells[0].text,/1\. 第一项\n2\. 第二项/);
 assert.match(result.structure.tables[0].rows[1].cells[0].text,/https:\/\/example.invalid\/standard\?a=1&b=2/);
});

test('images/links and unknown styles are explicit and never executed',()=>{
 const result=renderDocxHtmlStructure('<p>图<img src="https://example.invalid/image" /></p><p><a href="https://example.invalid/?a=1&amp;b=2">流程规范</a></p><custom>保留文本</custom>',['warning: Unrecognised paragraph style: custom']);
 assert.equal(result.structure.imagesOmitted,1);
 assert.match(result.text,/图片省略，未读取图片，未做 OCR/);
 assert.match(result.text,/https:\/\/example.invalid\/\?a=1&b=2；未请求/);
 assert.doesNotMatch(result.text,/https:\/\/example.invalid\/image/);
 assert.match(result.text,/Unrecognised paragraph style/);
 assert.match(result.text,/custom 未映射格式，保留其文本/);
});

test('structure and output limits refuse complete extraction instead of returning partial content',()=>{
 for(const [html,override] of [['<p>hello</p>',{htmlBytes:2}],['<p>hello</p>',{nodes:2}],['<p><b>x</b></p>',{depth:2}],['<h1>a</h1><h1>b</h1>',{headings:1}],['<table><tr><td>a</td><td>b</td></tr></table>',{cells:1}]] as const){
  assert.throws(()=>renderDocxHtmlStructure(html,[],{...DOCX_STRUCTURE_LIMITS,...override}),/OFFICE_DOCX_STRUCTURE_LIMIT/);
 }
 assert.throws(()=>renderDocxHtmlStructure('<p>hello</p>',[],{...DOCX_STRUCTURE_LIMITS,outputBytes:10}),/OFFICE_TEXT_LIMIT.*未完成全文提取/);
 assert.throws(()=>renderDocxHtmlStructure('<p>bad &unsupported;</p>'),/OFFICE_DOCX_STRUCTURE_PARSE/);
 assert.throws(()=>renderDocxHtmlStructure('<!DOCTYPE x><p>x</p>'),/OFFICE_XML_UNSAFE|OFFICE_DOCX_STRUCTURE_PARSE/);
 assert.throws(()=>renderDocxHtmlStructure('<table><tr><td colspan="-1">x</td></tr></table>'),/OFFICE_DOCX_STRUCTURE_LIMIT/);
});

test('serialized final table stays bounded when actual GFM parser reads following extraction diagnostics',()=>{
 const result=renderDocxHtmlStructure('<h1>章节</h1><table><tr><td>名称</td><td>默认值</td></tr><tr><td>A|B</td><td>待确认</td></tr></table>',['warning: source style is unknown']);
 const parsed=unified().use(remarkParse).use(remarkGfm).parse(result.text);
 const tables=parsed.children.filter(node=>node.type==='table');assert.equal(tables.length,1);assert.equal(tables[0].children.length,2);
 const cellText=tables[0].children.map(row=>row.children.map(cell=>cell.children.map(node=>'value'in node?node.value:'').join('')));
 assert.deepEqual(cellText,[['名称','默认值'],['A|B','待确认']]);
 assert.equal(parsed.children.filter(node=>node.type==='list').length,1,'warning is its own block, never an extra table row');
 assert.match(result.text,/\|待确认\|\n\n\[提取诊断\]/);
});
