import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {Files} from '../main/files.js';
import {
 applyWorkspaceRulesChange,
 prepareTemplateAssociationDraft,
 prepareTemplateMigrationDrafts,
 prepareTemplateRegistrationDraft,
 prepareWorkspaceRulesChange,
 previewTemplateMigration,
 readTemplateRegistry,
 readWorkspaceRulesSnapshot,
 type RegisteredTemplate,
} from '../main/template-workflow.js';
import type {Mount} from '../shared/types.js';

async function fixture(){
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'pm-template-workflow-'));const artifacts=path.join(dir,'artifacts'),processDir=path.join(dir,'process'),workspace=path.join(dir,'workspace'),backups=path.join(dir,'backups');
 await fs.mkdir(artifacts);await fs.mkdir(processDir);await fs.mkdir(workspace);const mounts:Mount[]=[{id:'artifacts',path:artifacts,name:'产出材料',write:true,enabled:true},{id:'process',path:processDir,name:'过程文件',write:true,enabled:true}];
 return{dir,artifacts,processDir,workspace,backups,files:new Files(()=>mounts)};
}

const template:Omit<RegisteredTemplate,'registeredAt'|'definitionHash'>={
 id:'standard-prd',version:'2',title:'标准 PRD v2',sections:[
  {id:'prd',title:'产品需求文档',level:1,required:true,parentId:null},
  {id:'overview',title:'背景与目标',level:2,required:true,parentId:'prd'},
  {id:'rules',title:'业务规则',level:3,required:true,parentId:'overview'},
  {id:'risk',title:'风险复核',level:4,required:false,parentId:'rules'},
 ],
};

test('模板注册和成果关联写入过程文件 JSON 草稿',async t=>{
 const f=await fixture();t.after(async()=>fs.rm(f.dir,{recursive:true,force:true}));
 await fs.writeFile(path.join(f.artifacts,'PRD.md'),'# 产品需求文档 <!-- pm-section:prd -->\n正文\n');
 const metadata={mountId:'process',path:'templates/registry.json'};const prepared=await prepareTemplateRegistrationDraft(f.files,{metadata,template,associateArtifacts:[{mountId:'artifacts',path:'PRD.md'}],runId:'run-register',now:'2026-09-21T00:00:00.000Z'});
 assert.equal(prepared.change.status,'pending');assert.equal(prepared.associations.length,1);assert.match(prepared.associations[0].artifactHash,/^[a-f0-9]{64}$/);await assert.rejects(f.files.read('process','templates/registry.json'),/ENOENT/);
 await f.files.apply(prepared.change,f.backups);const registry=await readTemplateRegistry(f.files,metadata);assert.equal(registry.registry.templates[0].definitionHash,prepared.template.definitionHash);assert.equal(registry.registry.associations[0].templateVersion,'2');
 await assert.rejects(prepareTemplateRegistrationDraft(f.files,{metadata,template:{...template,title:'偷偷改同版本'},runId:'run-conflict'}),/TEMPLATE_VERSION_CONFLICT/);
 await fs.writeFile(path.join(f.artifacts,'Second.md'),'# 产品需求文档 <!-- pm-section:prd -->\n第二份正文\n');const associated=await prepareTemplateAssociationDraft(f.files,{metadata,templateId:'standard-prd',templateVersion:'2',artifacts:[{mountId:'artifacts',path:'Second.md'}],runId:'run-associate'});assert.equal(associated.associations.length,1);assert.equal(associated.change.status,'pending');
});

test('模板迁移先预览并只为确认目标生成草稿，正文和额外章节完整保留',async t=>{
 const f=await fixture();t.after(async()=>fs.rm(f.dir,{recursive:true,force:true}));
 const first=['# 旧 PRD <!-- pm-section:prd -->','','开场正文。','## 旧背景 <!-- pm-section:overview -->','','人工背景。','## 旧规则 <!-- pm-section:rules -->','','人工规则正文。','### 旧风险 <!-- pm-section:risk -->','','风险说明。','## 自定义附录 <!-- pm-section:custom -->','','不能删除的人工附录。',''].join('\n');
 const second=first.replace('开场正文。','第二份开场。');await fs.writeFile(path.join(f.artifacts,'A.md'),first);await fs.writeFile(path.join(f.artifacts,'B.md'),second);
 const targets=[{mountId:'artifacts',path:'A.md'},{mountId:'artifacts',path:'B.md'}];const preview=await previewTemplateMigration(f.files,{template,targets,now:'2026-09-21T00:00:00.000Z'});
 assert.equal(preview.impacts.length,2);assert.equal(preview.impacts[0].canDraft,true);assert.deepEqual(preview.impacts[0].sectionChanges.map(change=>[change.sectionId,change.from.level,change.to.level]),[['prd',1,1],['overview',2,2],['rules',2,3],['risk',3,4]]);assert.equal(preview.impacts[0].retainedSectionIds.includes('custom'),true);assert.equal(preview.impacts[0].issues.some(issue=>issue.code==='UNEXPECTED_SECTION_RETAINED'),true);
 const result=await prepareTemplateMigrationDrafts(f.files,{preview,confirmedTargets:[targets[0]],runId:'run-migrate'});assert.equal(result.drafts.length,1);assert.equal(result.drafts[0].path,'A.md');assert.match(result.drafts[0].content,/^### 业务规则 <!-- pm-section:rules -->/m);assert.match(result.drafts[0].content,/^#### 风险复核 <!-- pm-section:risk -->/m);assert.match(result.drafts[0].content,/人工背景。[\s\S]*人工规则正文。[\s\S]*风险说明。[\s\S]*不能删除的人工附录。/);assert.equal(await f.files.read('artifacts','A.md'),first);assert.equal(await f.files.read('artifacts','B.md'),second);
});

test('迁移预览后的外部修改冲突，缺失必填章节不会生成草稿',async t=>{
 const f=await fixture();t.after(async()=>fs.rm(f.dir,{recursive:true,force:true}));
 const target={mountId:'artifacts',path:'PRD.md'};await fs.writeFile(path.join(f.artifacts,'PRD.md'),'# 产品需求文档 <!-- pm-section:prd -->\n只有根正文。\n');
 const blocked=await previewTemplateMigration(f.files,{template,targets:[target]});assert.equal(blocked.impacts[0].canDraft,false);assert.equal(blocked.impacts[0].issues.some(issue=>issue.code==='MISSING_REQUIRED_SECTION'),true);await assert.rejects(prepareTemplateMigrationDrafts(f.files,{preview:blocked,confirmedTargets:[target],runId:'run-blocked'}),/MIGRATION_BLOCKED/);
 const complete=['# 产品需求文档 <!-- pm-section:prd -->','## 背景与目标 <!-- pm-section:overview -->','## 规则 <!-- pm-section:rules -->'].join('\n');await fs.writeFile(path.join(f.artifacts,'PRD.md'),complete);const preview=await previewTemplateMigration(f.files,{template,targets:[target]});await fs.writeFile(path.join(f.artifacts,'PRD.md'),complete+'\n外部修改');await assert.rejects(prepareTemplateMigrationDrafts(f.files,{preview,confirmedTargets:[target],runId:'run-conflict'}),/VERSION_CONFLICT/);
});

test('根 AGENTS.md 只能按快照哈希生成和应用草稿',async t=>{
 const f=await fixture();t.after(async()=>fs.rm(f.dir,{recursive:true,force:true}));const agents=path.join(f.workspace,'AGENTS.md');await fs.writeFile(agents,'# 规则\n第一版\n');
 const first=await readWorkspaceRulesSnapshot(f.workspace);assert.equal(first.relativePath,'AGENTS.md');assert.equal(first.exists,true);assert.match(first.contentHash??'',/^[a-f0-9]{64}$/);
 const change=await prepareWorkspaceRulesChange({workspaceRoot:f.workspace,expectedHash:first.contentHash,content:'# 规则\n第二版\n',runId:'run-rules'});assert.equal(await fs.readFile(agents,'utf8'),'# 规则\n第一版\n');
 await fs.writeFile(agents,'# 规则\n外部编辑\n');await assert.rejects(applyWorkspaceRulesChange(f.workspace,change,f.backups),/VERSION_CONFLICT/);assert.equal(change.status,'conflict');assert.equal(await fs.readFile(agents,'utf8'),'# 规则\n外部编辑\n');
 const next=await readWorkspaceRulesSnapshot(f.workspace);const accepted=await prepareWorkspaceRulesChange({workspaceRoot:f.workspace,expectedHash:next.contentHash,content:'# 规则\n确认版本\n',runId:'run-rules-2'});await applyWorkspaceRulesChange(f.workspace,accepted,f.backups);assert.equal(accepted.status,'applied');assert.equal(await fs.readFile(agents,'utf8'),'# 规则\n确认版本\n');assert.equal((await fs.readdir(f.backups)).length,1);
});

test('根规则接口拒绝链接、目录和超限内容',async t=>{
 const f=await fixture();t.after(async()=>fs.rm(f.dir,{recursive:true,force:true}));const agents=path.join(f.workspace,'AGENTS.md'),outside=path.join(f.dir,'outside');await fs.mkdir(outside);await fs.symlink(outside,agents,'junction');await assert.rejects(readWorkspaceRulesSnapshot(f.workspace),/PERMISSION_DENIED/);await fs.rm(agents);await fs.mkdir(agents);await assert.rejects(readWorkspaceRulesSnapshot(f.workspace),/PERMISSION_DENIED/);await fs.rm(agents,{recursive:true});await assert.rejects(prepareWorkspaceRulesChange({workspaceRoot:f.workspace,expectedHash:null,content:'x'.repeat(64_001),runId:'run-large'}),/64 KB/);
});
