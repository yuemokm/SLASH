import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash,randomBytes} from 'node:crypto';
import AdmZip from 'adm-zip';
import mammoth from 'mammoth';
import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {renderToStaticMarkup} from 'react-dom/server';
import {Files} from '../main/files.js';
import {Store} from '../main/store.js';
import {Service} from '../main/service.js';
import {readWordDocument,WORD_READING_LIMITS} from '../main/word-document-reading.js';
import {extractOfficeText,extractOfficeTextSnapshot,OFFICE_TEXT_PARSER_VERSION} from '../main/office-extraction.js';
import {renderDocxHtmlStructure} from '../main/docx-structured-text.js';
import {remarkHostWordBreaks} from '../src/word-reading.js';
const digest=(value:Buffer|string)=>createHash('sha256').update(value).digest('hex');
const xml=(s:string)=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
const paragraph=(s:string)=>'<w:p><w:r><w:t>'+xml(s)+'</w:t></w:r></w:p>';
function docx(text='业务正文',extra=0){const z=new AdmZip();z.addFile('[Content_Types].xml',Buffer.from('<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'));z.addFile('_rels/.rels',Buffer.from('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'));z.addFile('word/document.xml',Buffer.from('<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>'+paragraph(text)+'</w:body></w:document>'));if(extra)z.addFile('word/media/noise.bin',randomBytes(extra));return z.toBuffer();}
async function fixture(t:test.TestContext,autoCleanup=true){const root=await fs.mkdtemp(path.join(os.tmpdir(),'word-ui-read-'));let enabled=true;const files=new Files(()=>[{id:'source',path:root,name:'资料',enabled,write:false}]);const file=path.join(root,'rules.docx'),bytes=docx();await fs.writeFile(file,bytes);const cleanup=async()=>{const resolved=await fs.realpath(root);assert.equal(path.dirname(resolved),await fs.realpath(os.tmpdir()));await fs.rm(resolved,{recursive:true,force:true});};if(autoCleanup)t.after(cleanup);return{root,file,bytes,files,cleanup,revoke:()=>{enabled=false;}};}
const render=(text:string,word=true)=>renderToStaticMarkup(React.createElement(ReactMarkdown,{skipHtml:true,remarkPlugins:word?[remarkGfm,remarkHostWordBreaks]:[remarkGfm],children:text}));

test('same Office snapshot retains Agent text and parser identity; UI body omits only host metadata',async()=>{
 const bytes=docx('[DOCX 正文文本提取] [表格 table[1]] [提取诊断] <script>业务文字</script> <br/>'),snapshot=await extractOfficeTextSnapshot(bytes,'rules.docx');
 assert.equal(snapshot.text,await extractOfficeText(bytes,'rules.docx'));assert.match(OFFICE_TEXT_PARSER_VERSION,/^office-text-/);
 assert.ok(snapshot.text.startsWith('[DOCX 正文文本提取；'));assert.ok(!snapshot.readingText!.startsWith('[DOCX 正文文本提取；'));
 const html=render(snapshot.readingText!);for(const witness of ['[DOCX 正文文本提取]','[表格 table[1]]','[提取诊断]','&lt;script&gt;业务文字&lt;/script&gt;','&lt;br/&gt;'])assert.ok(html.includes(witness),witness);
 assert.ok(!html.includes('<script>'));assert.equal((html.match(/<br\s*\/?\s*>/g)||[]).length,0);
});

test('reading uses the same verified structure for ordinary/merged/nested tables, headings and lists',()=>{
 const result=renderDocxHtmlStructure('<h1>业务标题</h1><p>段落</p><table><tr><td>字段</td><td>说明</td></tr><tr><td>A</td><td><p>第一行</p><p>第二行</p></td></tr></table><table><tr><td colspan="2">合并业务</td></tr><tr><td>B</td><td>C</td></tr></table><table><tr><td>外部<table><tr><td>内部</td></tr></table></td></tr></table><ol><li>第一项</li><li>第二项</li></ol>');
 assert.equal(result.structure.tables.length,4);assert.equal(result.structure.headings.length,1);assert.match(result.text,/布局列/);assert.match(result.text,/docx-html\/table/);assert.doesNotMatch(result.readingText,/布局列|docx-html\/table|DOCX 正文文本提取|提取诊断/);
 const html=render(result.readingText);for(const witness of ['业务标题','段落','字段','说明','第一行','第二行','合并业务','外部','内部','第一项','第二项'])assert.ok(html.includes(witness),witness);assert.equal(result.readingText.match(/内部/g)?.length,1);assert.ok(html.includes('<table>'));assert.match(html,/第一行<br\/?\s*>\s*第二行/);assert.ok(!render(result.readingText,false).includes('<br'));
});

test('Word plugin converts only exact host html breaks, keeps escaped user text and skips other HTML',()=>{
 const input='|字段|说明|\n|---|---|\n|A|一<br/>二 \\<br/\\> <script>alert(1)</script> <img src="x"/>|';
 const html=render(input);assert.match(html,/一<br\/?\s*>\s*二/);assert.ok(html.includes('&lt;br/&gt;'));assert.ok(!html.includes('<script'));assert.ok(!html.includes('<img'));assert.ok(!html.includes('src="x"'));
 const tree:any={type:'root',children:[{type:'html',value:'<br>'},{type:'html',value:'<br/> '},{type:'text',value:'<br/>'},{type:'html',value:'<br/>'}]};remarkHostWordBreaks()(tree);assert.deepEqual(tree.children.map((n:any)=>n.type),['html','html','text','break']);
});

test('UI version is original captured bytes, body is same snapshot, Agent 2 MB limit remains separate',async t=>{
 const f=await fixture(t),result=await readWordDocument(f.files,'source','rules.docx',()=>{});assert.equal(result.version,digest(f.bytes));assert.equal(result.content,(await extractOfficeTextSnapshot(f.bytes,'rules.docx')).readingText);assert.equal(result.format,'word');assert.equal(result.wordPresentation,'host-structured-v1');assert.match(result.notice!,/图片未做 OCR/);
 const large=docx('大文件正文',2_000_100);await fs.writeFile(f.file,large);assert.equal((await readWordDocument(f.files,'source','rules.docx',()=>{})).version,digest(large));await assert.rejects(f.files.read('source','rules.docx'),/2 MB/);assert.deepEqual(WORD_READING_LIMITS,{inputBytes:20_000_000,outputBytes:2_000_000});
});

test('20 MB stat and actual Buffer caps reject, output cap and unsafe ZIP reject without partial text',async t=>{
 const f=await fixture(t),original=fs.readFile;let checked=false;(fs as any).readFile=async(...args:any[])=>{if(args[0]===f.file){checked=true;return Buffer.alloc(20_000_001);}return(original as any)(...args);};try{await assert.rejects(readWordDocument(f.files,'source','rules.docx',()=>{}),/WORD_FILE_LIMIT/);assert.equal(checked,true);}finally{fs.readFile=original;}
 await fs.writeFile(f.file,Buffer.alloc(20_000_001));await assert.rejects(readWordDocument(f.files,'source','rules.docx',()=>{}),/WORD_FILE_LIMIT/);
 await fs.writeFile(f.file,'not a zip');await assert.rejects(readWordDocument(f.files,'source','rules.docx',()=>{}),/OFFICE_INVALID_PACKAGE/);
 await fs.writeFile(f.file,docx('大'.repeat(700_000)));await assert.rejects(readWordDocument(f.files,'source','rules.docx',()=>{}),/OFFICE_TEXT_LIMIT/);
 const unsafe=new AdmZip(f.bytes);unsafe.updateFile('word/document.xml',Buffer.from('<!DOCTYPE document [<!ENTITY x "unsafe">]><document>&x;</document>'));await fs.writeFile(f.file,unsafe.toBuffer());await assert.rejects(readWordDocument(f.files,'source','rules.docx',()=>{}),/OFFICE_XML_UNSAFE/);
});

test('actual conversion A then file B rejects; equal stat metadata cannot bypass byte proof',async t=>{
 const f=await fixture(t),original=mammoth.convertToHtml;let changed=false;(mammoth as any).convertToHtml=async(...args:any[])=>{const result=await(original as any)(...args);await fs.writeFile(f.file,docx('变更后的 B'));changed=true;return result;};try{await assert.rejects(readWordDocument(f.files,'source','rules.docx',()=>{}),/READ_VERSION_CHANGED/);assert.ok(changed);}finally{mammoth.convertToHtml=original;}
 await fs.writeFile(f.file,f.bytes);const stat=await fs.stat(f.file),originalStat=fs.stat,read=fs.readFile;let reads=0;(fs as any).stat=async(...args:any[])=>args[0]===f.file?stat:(originalStat as any)(...args);(fs as any).readFile=async(...args:any[])=>args[0]===f.file&&++reads===2?docx('伪装相同元数据 B'):(read as any)(...args);try{await assert.rejects(readWordDocument(f.files,'source','rules.docx',()=>{}),/READ_VERSION_CHANGED/);assert.equal(reads,2);}finally{fs.stat=originalStat;fs.readFile=read;}
});

test('post-conversion mount revocation returns no body',async t=>{const f=await fixture(t),original=mammoth.convertToHtml;(mammoth as any).convertToHtml=async(...args:any[])=>{const result=await(original as any)(...args);f.revoke();return result;};try{await assert.rejects(readWordDocument(f.files,'source','rules.docx',()=>{}),/PERMISSION_DENIED/);}finally{mammoth.convertToHtml=original;}});

test('real Service guard rejects permission revocation, project change and active workspace transition',async t=>{
 const f=await fixture(t,false),store=new Store(path.join(f.root,'profile'));const service=new Service(store,()=>'',()=>{},async()=>({messages:[],abort:async()=>{},dispose:()=>{},prompt:async()=>{}}) as any,{},()=>undefined);t.after(async()=>{service.dispose();await Promise.allSettled([...(service as any).agentIndex.queues.values()]);store.close();await f.cleanup();});service.state.root=f.root;service.state.mounts=[{id:'source',name:'资料',path:f.root,enabled:true,write:false}];service.setPermission('workspace_read','allow');
 const original=mammoth.convertToHtml;for(const kind of ['permission','project','transition'] as const){service.state.root=f.root;service.setPermission('workspace_read','allow');(service as any).workspaceTransitioning=false;(mammoth as any).convertToHtml=async(...args:any[])=>{const result=await(original as any)(...args);if(kind==='permission')service.setPermission('workspace_read','deny');else if(kind==='project')service.state.root=path.join(f.root,'other');else (service as any).workspaceTransitioning=true;return result;};try{await assert.rejects(service.readWordDocument('source','rules.docx'),kind==='permission'?/PERMISSION_DENIED/:/VERSION_CONFLICT/);}finally{mammoth.convertToHtml=original;}}
});
