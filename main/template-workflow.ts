import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import type {Change} from '../shared/types.js';
import {parseMarkdownSections,type ArtifactFileRef} from './artifacts.js';
import {Files,hash} from './files.js';
import {readAgentsDocument,writeAgentsDocument,withAgentsDocumentLock,splitAgentsDocument,AGENTS_MANUAL_MAX_BYTES} from './agents-document.js';

const sectionIdPattern=/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/;
const MAX_RULES_BYTES=AGENTS_MANUAL_MAX_BYTES;

export type RegisteredTemplateSection={
 id:string;
 title:string;
 level:number;
 required:boolean;
 parentId?:string|null;
};

export type RegisteredTemplate={
 id:string;
 version:string;
 title:string;
 sections:RegisteredTemplateSection[];
 registeredAt:string;
 definitionHash:string;
};

export type TemplateArtifactAssociation={
 templateId:string;
 templateVersion:string;
 artifact:ArtifactFileRef;
 artifactHash:string;
 associatedAt:string;
};

export type TemplateRegistry={
 schemaVersion:1;
 templates:RegisteredTemplate[];
 associations:TemplateArtifactAssociation[];
 updatedAt:string;
};

export type TemplateMigrationIssue={
 severity:'blocking'|'warning';
 code:'DUPLICATE_SECTION_ID'|'MISSING_REQUIRED_SECTION'|'UNIDENTIFIED_SECTION_RETAINED'|'UNEXPECTED_SECTION_RETAINED';
 message:string;
 sectionId?:string;
 line?:number;
};

export type TemplateSectionChange={
 sectionId:string;
 line:number;
 from:{title:string;level:number};
 to:{title:string;level:number};
};

export type TemplateMigrationImpact={
 target:ArtifactFileRef;
 sourceHash:string;
 proposedHash:string;
 changed:boolean;
 canDraft:boolean;
 sectionChanges:TemplateSectionChange[];
 retainedSectionIds:string[];
 issues:TemplateMigrationIssue[];
};

export type TemplateMigrationPreview={
 schemaVersion:1;
 previewId:string;
 template:RegisteredTemplate;
 impacts:TemplateMigrationImpact[];
 createdAt:string;
};

export type WorkspaceRulesSnapshot={
 relativePath:'AGENTS.md';
 exists:boolean;
 content:string;
 contentHash:string|null;
 documentHash?:string|null;
 size:number;
 readAt:string;
};

export type WorkspaceRulesChange={
 id:string;
 runId:string;
 relativePath:'AGENTS.md';
 beforeHash:string|null;
 hashScope?:'manual-v1';
 content:string;
 status:'pending'|'applied'|'conflict';
 createdAt:string;
};

function normalizedRef(ref:ArtifactFileRef):ArtifactFileRef{
 if(!ref.mountId.trim()||!ref.path.trim())throw Error('VALIDATION_FAILED: 成果引用不能为空');
 return{mountId:ref.mountId,path:path.normalize(ref.path)};
}

function artifactKey(ref:ArtifactFileRef){
 const normalized=normalizedRef(ref);const filePath=process.platform==='win32'?normalized.path.toLowerCase():normalized.path;
 return normalized.mountId+'\0'+filePath;
}

function normalizeTemplate(input:Omit<RegisteredTemplate,'registeredAt'|'definitionHash'>|RegisteredTemplate,registeredAt=new Date().toISOString()):RegisteredTemplate{
 const id=input.id.trim(),version=input.version.trim(),title=input.title.trim();
 if(!sectionIdPattern.test(id)||!version||version.length>100||!title||title.length>200)throw Error('VALIDATION_FAILED: 模板 ID、版本或标题无效');
 if(!Array.isArray(input.sections)||input.sections.length===0||input.sections.length>300)throw Error('VALIDATION_FAILED: 模板章节数量无效');
 const sections=input.sections.map(section=>({id:section.id.trim(),title:section.title.trim(),level:section.level,required:section.required,parentId:section.parentId===undefined?undefined:section.parentId}));
 const indexes=new Map<string,number>();
 for(let index=0;index<sections.length;index++){
  const section=sections[index];
  if(!sectionIdPattern.test(section.id)||!section.title||section.title.length>200||!Number.isInteger(section.level)||section.level<1||section.level>6)throw Error(`VALIDATION_FAILED: 模板章节 ${section.id||index} 无效`);
  if(indexes.has(section.id))throw Error(`VALIDATION_FAILED: 模板章节 ID 重复 ${section.id}`);
  indexes.set(section.id,index);
 }
 for(let index=0;index<sections.length;index++){
  const section=sections[index];const parentId=section.parentId??null;
  if(parentId===null){if(section.level!==1)throw Error(`VALIDATION_FAILED: 根章节 ${section.id} 必须为一级`);continue;}
  const parentIndex=indexes.get(parentId);if(parentIndex===undefined)throw Error(`VALIDATION_FAILED: 父章节不存在 ${parentId}`);
  if(parentIndex>=index)throw Error(`VALIDATION_FAILED: 父章节必须位于子章节之前 ${section.id}`);
  if(sections[parentIndex].level+1!==section.level)throw Error(`VALIDATION_FAILED: 章节 ${section.id} 层级必须比父章节深一级`);
 }
 const definition={id,version,title,sections};return{...definition,registeredAt,definitionHash:hash(JSON.stringify(definition))};
}

function emptyRegistry():TemplateRegistry{return{schemaVersion:1,templates:[],associations:[],updatedAt:new Date(0).toISOString()};}

function parseRegistry(content:string):TemplateRegistry{
 let parsed:unknown;try{parsed=JSON.parse(content)}catch{throw Error('VALIDATION_FAILED: 模板注册表不是有效 JSON');}
 if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw Error('VALIDATION_FAILED: 模板注册表结构无效');
 const value=parsed as Partial<TemplateRegistry>;if(value.schemaVersion!==1||!Array.isArray(value.templates)||!Array.isArray(value.associations)||typeof value.updatedAt!=='string')throw Error('VALIDATION_FAILED: 模板注册表结构无效');
 const templates=value.templates.map(template=>normalizeTemplate(template,template.registeredAt));
 const associations=value.associations.map(association=>{
  if(!association||typeof association!=='object'||typeof association.templateId!=='string'||typeof association.templateVersion!=='string'||typeof association.artifactHash!=='string'||!/^[a-f0-9]{64}$/i.test(association.artifactHash)||typeof association.associatedAt!=='string')throw Error('VALIDATION_FAILED: 模板关联结构无效');
  return{...association,artifact:normalizedRef(association.artifact)};
 });
 return{schemaVersion:1,templates,associations,updatedAt:value.updatedAt};
}

export async function readTemplateRegistry(files:Files,metadata:ArtifactFileRef):Promise<{registry:TemplateRegistry;contentHash:string|null}>{
 if(!/\.json$/i.test(metadata.path))throw Error('VALIDATION_FAILED: 模板注册表必须是 JSON 文件');
 try{const content=await files.read(metadata.mountId,metadata.path);return{registry:parseRegistry(content),contentHash:hash(content)};}
 catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return{registry:emptyRegistry(),contentHash:null};throw error;}
}

export async function prepareTemplateRegistrationDraft(files:Files,input:{
 metadata:ArtifactFileRef;
 template:Omit<RegisteredTemplate,'registeredAt'|'definitionHash'>;
 associateArtifacts?:ArtifactFileRef[];
 runId:string;
 now?:string;
}):Promise<{change:Change;template:RegisteredTemplate;associations:TemplateArtifactAssociation[]}>{
 const now=input.now??new Date().toISOString();const current=await readTemplateRegistry(files,input.metadata);const template=normalizeTemplate(input.template,now);
 const sameVersion=current.registry.templates.find(item=>item.id===template.id&&item.version===template.version);
 if(sameVersion&&sameVersion.definitionHash!==template.definitionHash)throw Error('TEMPLATE_VERSION_CONFLICT: 已注册版本的结构不可改写，请使用新版本号');
 const templates=sameVersion?current.registry.templates:[...current.registry.templates,template];
 const associations=[...current.registry.associations];
 for(const rawRef of input.associateArtifacts??[]){
  const artifact=normalizedRef(rawRef);const content=await files.read(artifact.mountId,artifact.path);const association:TemplateArtifactAssociation={templateId:template.id,templateVersion:template.version,artifact,artifactHash:hash(content),associatedAt:now};
  const index=associations.findIndex(item=>artifactKey(item.artifact)===artifactKey(artifact));if(index>=0)associations[index]=association;else associations.push(association);
 }
 const registry:TemplateRegistry={schemaVersion:1,templates,associations,updatedAt:now};const content=JSON.stringify(registry,null,2)+'\n';const change=await files.draft(input.metadata.mountId,input.metadata.path,content,input.runId);
 return{change,template:sameVersion??template,associations:associations.filter(item=>item.templateId===template.id&&item.templateVersion===template.version)};
}

export async function prepareTemplateAssociationDraft(files:Files,input:{
 metadata:ArtifactFileRef;
 templateId:string;
 templateVersion:string;
 artifacts:ArtifactFileRef[];
 runId:string;
 now?:string;
}):Promise<{change:Change;associations:TemplateArtifactAssociation[]}>{
 if(input.artifacts.length===0)throw Error('VALIDATION_FAILED: 至少选择一个关联成果');
 const now=input.now??new Date().toISOString();const current=await readTemplateRegistry(files,input.metadata);
 if(!current.registry.templates.some(template=>template.id===input.templateId&&template.version===input.templateVersion))throw Error('TEMPLATE_NOT_FOUND');
 const associations=[...current.registry.associations];const updated:TemplateArtifactAssociation[]=[];
 for(const rawRef of input.artifacts){
  const artifact=normalizedRef(rawRef);const content=await files.read(artifact.mountId,artifact.path);const association:TemplateArtifactAssociation={templateId:input.templateId,templateVersion:input.templateVersion,artifact,artifactHash:hash(content),associatedAt:now};
  const index=associations.findIndex(item=>artifactKey(item.artifact)===artifactKey(artifact));if(index>=0)associations[index]=association;else associations.push(association);updated.push(association);
 }
 const registry:TemplateRegistry={...current.registry,associations,updatedAt:now};const change=await files.draft(input.metadata.mountId,input.metadata.path,JSON.stringify(registry,null,2)+'\n',input.runId);
 return{change,associations:updated};
}

function migrateMarkdown(markdown:string,template:RegisteredTemplate):{markdown:string;impact:Omit<TemplateMigrationImpact,'target'|'sourceHash'|'proposedHash'>}{
 const sections=parseMarkdownSections(markdown);const templateById=new Map(template.sections.map(section=>[section.id,section]));const occurrences=new Map<string,typeof sections>();
 for(const section of sections)if(section.id){const group=occurrences.get(section.id)??[];group.push(section);occurrences.set(section.id,group);}
 const issues:TemplateMigrationIssue[]=[];const changes:TemplateSectionChange[]=[];const replacements:Array<{start:number;end:number;text:string}>=[];
 for(const wanted of template.sections){
  const actual=occurrences.get(wanted.id)??[];
  if(actual.length>1){issues.push({severity:'blocking',code:'DUPLICATE_SECTION_ID',message:`章节 ${wanted.id} 在成果中重复，不能安全迁移`,sectionId:wanted.id,line:actual[0].line});continue;}
  if(actual.length===0){if(wanted.required)issues.push({severity:'blocking',code:'MISSING_REQUIRED_SECTION',message:`缺少必填章节 ${wanted.id}；需要先决定新增内容，不能静默生成空正文`,sectionId:wanted.id});continue;}
  const section=actual[0];if(section.title===wanted.title&&section.level===wanted.level)continue;
  const original=markdown.slice(section.headingStart,section.headingEnd);const eol=/(\r\n|\n|\r)$/.exec(original)?.[0]??'';
  replacements.push({start:section.headingStart,end:section.headingEnd,text:'#'.repeat(wanted.level)+' '+wanted.title+' <!-- pm-section:'+wanted.id+' -->'+eol});
  changes.push({sectionId:wanted.id,line:section.line,from:{title:section.title,level:section.level},to:{title:wanted.title,level:wanted.level}});
 }
 const retainedSectionIds:string[]=[];
 for(const section of sections){
  if(!section.id){issues.push({severity:'warning',code:'UNIDENTIFIED_SECTION_RETAINED',message:'未带稳定 ID 的章节及正文已保留，未自动归入模板',line:section.line});continue;}
  if(!templateById.has(section.id)){retainedSectionIds.push(section.id);issues.push({severity:'warning',code:'UNEXPECTED_SECTION_RETAINED',message:`章节 ${section.id} 不在新模板中，已完整保留以避免丢失人工正文`,sectionId:section.id,line:section.line});}
 }
 let output=markdown;for(const replacement of replacements.sort((a,b)=>b.start-a.start))output=output.slice(0,replacement.start)+replacement.text+output.slice(replacement.end);
 return{markdown:output,impact:{changed:output!==markdown,canDraft:!issues.some(issue=>issue.severity==='blocking'),sectionChanges:changes,retainedSectionIds,issues}};
}

export async function previewTemplateMigration(files:Files,input:{
 template:Omit<RegisteredTemplate,'registeredAt'|'definitionHash'>|RegisteredTemplate;
 targets:ArtifactFileRef[];
 now?:string;
}):Promise<TemplateMigrationPreview>{
 if(input.targets.length===0)throw Error('VALIDATION_FAILED: 至少选择一个迁移目标');
 const now=input.now??new Date().toISOString();const template=normalizeTemplate(input.template,'registeredAt'in input.template?input.template.registeredAt:now);const seen=new Set<string>();const impacts:TemplateMigrationImpact[]=[];
 for(const rawTarget of input.targets){
  const target=normalizedRef(rawTarget),key=artifactKey(target);if(seen.has(key))throw Error('VALIDATION_FAILED: 迁移目标重复');seen.add(key);
  if(!/\.md$/i.test(target.path))throw Error('CAPABILITY_UNSUPPORTED: 当前模板结构迁移仅支持 Markdown 成果');
  const content=await files.read(target.mountId,target.path);const migrated=migrateMarkdown(content,template);impacts.push({target,sourceHash:hash(content),proposedHash:hash(migrated.markdown),...migrated.impact});
 }
 const previewId=hash(JSON.stringify({template:template.definitionHash,impacts:impacts.map(impact=>({target:impact.target,sourceHash:impact.sourceHash,proposedHash:impact.proposedHash}))}));
 return{schemaVersion:1,previewId,template,impacts,createdAt:now};
}

export async function prepareTemplateMigrationDrafts(files:Files,input:{
 preview:TemplateMigrationPreview;
 confirmedTargets:ArtifactFileRef[];
 runId:string;
}):Promise<{previewId:string;drafts:Change[];skippedUnchanged:ArtifactFileRef[]}>{
 if(input.preview.schemaVersion!==1)throw Error('VALIDATION_FAILED: 不支持的迁移预览版本');
 if(input.confirmedTargets.length===0)throw Error('CONFIRMATION_REQUIRED: 尚未选择要迁移的成果');
 const impacts=new Map(input.preview.impacts.map(impact=>[artifactKey(impact.target),impact]));const selected=new Set<string>();const drafts:Change[]=[];const skippedUnchanged:ArtifactFileRef[]=[];
 for(const rawTarget of input.confirmedTargets){
  const target=normalizedRef(rawTarget),key=artifactKey(target);if(selected.has(key))throw Error('VALIDATION_FAILED: 确认目标重复');selected.add(key);
  const impact=impacts.get(key);if(!impact)throw Error('CONFIRMATION_SCOPE_INVALID: 确认目标不在影响预览中');if(!impact.canDraft)throw Error(`MIGRATION_BLOCKED: ${impact.issues.filter(issue=>issue.severity==='blocking').map(issue=>issue.message).join('；')}`);
  const current=await files.read(target.mountId,target.path);if(hash(current)!==impact.sourceHash)throw Error('VERSION_CONFLICT: 成果在影响预览后已修改，请重新预览');
  const migrated=migrateMarkdown(current,input.preview.template);if(hash(migrated.markdown)!==impact.proposedHash)throw Error('VERSION_CONFLICT: 模板或迁移结果与预览不一致，请重新预览');
  if(!migrated.impact.changed){skippedUnchanged.push(target);continue;}
  drafts.push(await files.draft(target.mountId,target.path,migrated.markdown,input.runId));
 }
 return{previewId:input.preview.previewId,drafts,skippedUnchanged};
}

export async function readWorkspaceRulesSnapshot(workspaceRoot:string):Promise<WorkspaceRulesSnapshot>{
 const snapshot=await readAgentsDocument(workspaceRoot);return{relativePath:'AGENTS.md',exists:snapshot.exists,content:snapshot.parts.manual,contentHash:snapshot.exists?hash(snapshot.parts.manual):null,documentHash:snapshot.fullHash,size:Buffer.byteLength(snapshot.parts.manual),readAt:new Date().toISOString()};
}

export async function prepareWorkspaceRulesChange(input:{workspaceRoot:string;expectedHash:string|null;content:string;runId:string}):Promise<WorkspaceRulesChange>{
 if(Buffer.byteLength(input.content)>MAX_RULES_BYTES)throw Error('VALIDATION_FAILED: 工作空间 AGENTS.md 人工规则超过 64 KB');if(splitAgentsDocument(input.content).managed)throw Error('VALIDATION_FAILED: 规则草稿只能编辑人工内容，不能写入受管理索引');
 const snapshot=await readWorkspaceRulesSnapshot(input.workspaceRoot);if(snapshot.contentHash!==input.expectedHash)throw Error('VERSION_CONFLICT: 工作空间 AGENTS.md 人工规则已修改，请重新读取');
 return{id:randomUUID(),runId:input.runId,relativePath:'AGENTS.md',hashScope:'manual-v1',beforeHash:snapshot.contentHash,content:input.content,status:'pending',createdAt:new Date().toISOString()};
}

export async function applyWorkspaceRulesChange(workspaceRoot:string,change:WorkspaceRulesChange,backupDir:string,assertWrite?:()=>Promise<void>){
 return withAgentsDocumentLock(workspaceRoot,async()=>{
  if(change.relativePath!=='AGENTS.md'||change.status!=='pending')throw Error('VALIDATION_FAILED: 规则草稿不可应用');if(Buffer.byteLength(change.content)>MAX_RULES_BYTES)throw Error('VALIDATION_FAILED: 工作空间 AGENTS.md 人工规则超过 64 KB');if(splitAgentsDocument(change.content).managed)throw Error('VALIDATION_FAILED: 规则草稿只能编辑人工内容');
  const current=await readAgentsDocument(workspaceRoot);const expected=change.hashScope==='manual-v1'?(current.exists?hash(current.parts.manual):null):current.fullHash;
  if(expected!==change.beforeHash){change.status='conflict';throw Error('VERSION_CONFLICT: 工作空间 AGENTS.md 已修改，草稿已保留');}
  await fs.mkdir(backupDir,{recursive:true});const backupPath=path.join(backupDir,change.id+'.json');try{await fs.writeFile(backupPath,JSON.stringify({...change,previousContent:current.exists?current.content:null},null,2),{flag:'wx'});}catch(error){if((error as NodeJS.ErrnoException).code!=='EEXIST')throw error;const stat=await fs.lstat(backupPath);if(!stat.isFile()||stat.isSymbolicLink())throw Error('VERSION_CONFLICT: 规则备份路径不安全');const backup=JSON.parse(await fs.readFile(backupPath,'utf8')) as Record<string,unknown>;const matches=['id','runId','relativePath','content','beforeHash','hashScope'].every(key=>backup[key]===change[key as keyof WorkspaceRulesChange]);const previous=backup.previousContent;const before=previous===null?null:typeof previous==='string'?hash(change.hashScope==='manual-v1'?splitAgentsDocument(previous).manual:previous):undefined;if(!matches||before!==change.beforeHash)throw Error('VERSION_CONFLICT: 已有规则备份与当前草稿不一致');}
  const content=change.content+current.parts.managed;
  try{await writeAgentsDocument(workspaceRoot,current,content,assertWrite);change.status='applied';}catch(error){if(String((error as Error).message).startsWith('VERSION_CONFLICT'))change.status='conflict';throw error;}return change;
 });
}
