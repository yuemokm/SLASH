import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import AdmZip from 'adm-zip';
import mammoth from 'mammoth';
import {
 exportMarkdownToWord,
 listFileVersions,
 markdownToDocx,
 packageHtmlProject,
 parseMarkdownSections,
 prepareRestoreDraft,
 readFileVersion,
 shiftMarkdownSection,
 validateMarkdownStructure,
} from '../main/artifacts.js';
import {Files} from '../main/files.js';
import type {Mount} from '../shared/types.js';

async function fixture(){const dir=await fs.mkdtemp(path.join(os.tmpdir(),'pm-artifacts-'));const source=path.join(dir,'source'),output=path.join(dir,'output'),backups=path.join(dir,'backups');await fs.mkdir(source);await fs.mkdir(output);const mounts:Mount[]=[{id:'source',path:source,name:'source',write:true,enabled:true},{id:'output',path:output,name:'output',write:true,enabled:true}];return{dir,source,output,backups,files:new Files(()=>mounts)};}

test('按稳定章节标识升降级，正文和代码块保持不变',()=>{
 const markdown=['# 文档 <!-- pm-section:doc -->','','开场正文。','## 审批 <!-- pm-section:approval -->','人工编辑正文。','```md','# 代码里的标题','```','### 异常 <!-- pm-section:exceptions -->','异常正文。','## 尾声 <!-- pm-section:end -->','结尾。',''].join('\n');
 const parsed=parseMarkdownSections(markdown);assert.deepEqual(parsed.map(section=>[section.id,section.level]),[['doc',1],['approval',2],['exceptions',3],['end',2]]);
 const shifted=shiftMarkdownSection(markdown,'approval','demote');assert.match(shifted.markdown,/^### 审批/m);assert.match(shifted.markdown,/^#### 异常/m);assert.match(shifted.markdown,/^## 尾声/m);assert.match(shifted.markdown,/人工编辑正文。[\s\S]*# 代码里的标题[\s\S]*异常正文。/);
 assert.deepEqual(shifted.changes.map(change=>[change.id,change.fromLevel,change.toLevel]),[['approval',2,3],['exceptions',3,4]]);
 assert.throws(()=>shiftMarkdownSection(markdown,'doc','promote'),/SECTION_LEVEL_LIMIT/);
});

test('章节结构校验报告缺失、重复、层级、父级和顺序问题',()=>{
 const valid=['# PRD <!-- pm-section:prd -->','## 背景 <!-- pm-section:background -->','## 规则 <!-- pm-section:rules -->','### 风险 <!-- pm-section:risk -->'].join('\n');
 const expected=[{id:'prd',level:1,title:'PRD'},{id:'background',level:2,parentId:'prd'},{id:'rules',level:2,parentId:'prd'},{id:'risk',level:3,parentId:'rules'}];
 assert.equal(validateMarkdownStructure(valid,expected).valid,true);
 const invalid=['# PRD <!-- pm-section:prd -->','### 风险 <!-- pm-section:risk -->','## 背景 <!-- pm-section:background -->','## 无标识','## 重复 <!-- pm-section:risk -->'].join('\n');
 const result=validateMarkdownStructure(invalid,expected);assert.equal(result.valid,false);const codes=new Set(result.issues.map(issue=>issue.code));for(const code of ['INVALID_LEVEL_GAP','MISSING_SECTION_ID','DUPLICATE_SECTION_ID','MISSING_SECTION','ORDER_MISMATCH'])assert.equal(codes.has(code as never),true,`缺少 ${code}`);
});

test('列举文件版本并从快照创建恢复草稿',async()=>{const f=await fixture();try{
 const first=await f.files.draft('source','PRD.md','第一版','run-1');await f.files.apply(first,f.backups);const second=await f.files.draft('source','PRD.md','第二版','run-2');await f.files.apply(second,f.backups);
 const versions=await listFileVersions(f.files,f.backups,{mountId:'source',path:'PRD.md'});assert.equal(versions[0].id,'current');assert.equal(versions[0].label,'当前版本');const historical=versions.find(version=>version.source==='change_snapshot');assert.ok(historical);assert.equal(historical.runId,'run-2');assert.equal(historical.restorable,true);
 const viewed=await readFileVersion(f.files,f.backups,{mountId:'source',path:'PRD.md'},historical.id);assert.equal(viewed.content,'第一版');assert.equal(viewed.summary.id,historical.id);assert.equal((await readFileVersion(f.files,f.backups,{mountId:'source',path:'PRD.md'},'current')).content,'第二版');const restore=await prepareRestoreDraft(f.files,f.backups,{mountId:'source',path:'PRD.md'},historical.id,'run-restore');assert.equal(restore.status,'pending');assert.equal(restore.content,'第一版');assert.equal(await f.files.read('source','PRD.md'),'第二版');await f.files.apply(restore,f.backups);assert.equal(await f.files.read('source','PRD.md'),'第一版');
 await assert.rejects(prepareRestoreDraft(f.files,f.backups,{mountId:'source',path:'../outside.md'},historical.id,'run-x'),/PERMISSION|INVALID_PATH/);
 }finally{await fs.rm(f.dir,{recursive:true,force:true});}});

test('HTML 项目 ZIP 包含相对依赖并拒绝越权和符号链接',async()=>{const f=await fixture();try{
 const project=path.join(f.source,'prototype');await fs.mkdir(path.join(project,'assets'),{recursive:true});await fs.writeFile(path.join(project,'index.html'),'<link rel="stylesheet" href="assets/app.css"><script src="assets/app.js"></script>');await fs.writeFile(path.join(project,'assets','app.css'),'body{color:#111}');await fs.writeFile(path.join(project,'assets','app.js'),'document.body.dataset.ready="1"');
 const result=await packageHtmlProject(f.files,{source:{mountId:'source',path:'prototype'},output:{mountId:'output',path:'prototype.zip'}});assert.equal(result.packageKind,'source_zip');assert.equal(result.fileCount,3);assert.deepEqual(result.files,['assets/app.css','assets/app.js','index.html']);const zip=new AdmZip(path.join(f.output,'prototype.zip'));assert.deepEqual(zip.getEntries().map(entry=>entry.entryName).sort(),result.files);assert.match(zip.readAsText('index.html'),/assets\/app\.js/);await assert.rejects(packageHtmlProject(f.files,{source:{mountId:'source',path:'prototype'},output:{mountId:'output',path:'prototype.zip'}}),/OUTPUT_EXISTS/);await packageHtmlProject(f.files,{source:{mountId:'source',path:'prototype'},output:{mountId:'output',path:'prototype.zip'},overwrite:true});
 await assert.rejects(packageHtmlProject(f.files,{source:{mountId:'source',path:'prototype'},entryFile:'../secret.html',output:{mountId:'output',path:'bad.zip'}}),/INVALID_ARCHIVE_PATH/);
 await fs.symlink(path.join(project,'assets'),path.join(project,'assets-link'),'junction');await assert.rejects(packageHtmlProject(f.files,{source:{mountId:'source',path:'prototype'},output:{mountId:'output',path:'linked.zip'}}),/SYMLINK_NOT_ALLOWED/);
 }finally{await fs.rm(f.dir,{recursive:true,force:true});}});

test('Markdown 生成可读取 DOCX，导出后 Files 可读取和搜索正文',async()=>{const f=await fixture();try{
 const markdown=['# 客户准入 <!-- pm-section:title -->','','这是人工正文。','','## 规则 <!-- pm-section:rules -->','','- 重复信用代码阻止提交','- 高风险客户进入风控复核','','| 风险等级 | 审批人 |','| --- | --- |','| 普通 | 主管 |','| 高风险 | 风控 |','','![流程图](flow.png)'].join('\n');const generated=await markdownToDocx(markdown,{title:'客户准入 PRD'});assert.ok(generated.buffer.length>1000);assert.equal(generated.report.warnings.some(warning=>warning.code==='IMAGE_AS_TEXT'),true);const extracted=await mammoth.extractRawText({buffer:generated.buffer});assert.match(extracted.value,/客户准入/);assert.match(extracted.value,/高风险客户进入风控复核/);assert.doesNotMatch(extracted.value,/pm-section/);const html=await mammoth.convertToHtml({buffer:generated.buffer});assert.match(html.value,/<table>/);assert.match(html.value,/<td><p>风控<\/p><\/td>/);
 await fs.writeFile(path.join(f.source,'PRD.md'),markdown);const exported=await exportMarkdownToWord(f.files,{source:{mountId:'source',path:'PRD.md'},output:{mountId:'output',path:'PRD.docx'},options:{title:'客户准入 PRD'}});assert.ok(exported.outputBytes>1000);await assert.rejects(exportMarkdownToWord(f.files,{source:{mountId:'source',path:'PRD.md'},output:{mountId:'output',path:'PRD.docx'}}),/OUTPUT_EXISTS/);await exportMarkdownToWord(f.files,{source:{mountId:'source',path:'PRD.md'},output:{mountId:'output',path:'PRD.docx'},overwrite:true});assert.match(await f.files.read('output','PRD.docx'),/重复信用代码阻止提交/);const matches=await f.files.search('高风险客户');assert.equal(matches.some(match=>match.mountId==='output'&&match.path==='PRD.docx'),true);
 }finally{await fs.rm(f.dir,{recursive:true,force:true});}});
