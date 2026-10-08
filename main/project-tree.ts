import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {projectTreeNodesSchema,type ProjectTreeNode,type ProjectTreeView,type Mount} from '../shared/types.js';
import type {Store} from './store.js';

type LegacyCleanup={stage:'applying'|'cleanup';applyRevision:number;files:string[];directories:string[]};
type TreeRecord={revision:number;appliedRevision?:number;nodes:ProjectTreeNode[];appliedNodes:ProjectTreeNode[];mountRoles?:Record<string,ProjectTreeNode['role']>;legacyCleanupPending?:LegacyCleanup;initializationWarnings?:string[]};
export const projectIdentity=(root:string)=>createHash('sha256').update(process.platform==='win32'?path.resolve(root).toLowerCase():path.resolve(root)).digest('hex');
const node=(id:string,name:string,role:ProjectTreeNode['role'],children:ProjectTreeNode[]=[]):ProjectTreeNode=>({id,name,role,children});
export function defaultProjectTree():ProjectTreeNode[]{return[
 node('resources','资源','resource',[node('skills','skills','resource'),node('templates','模板','resource',['PRD','蓝图','会议纪要','调研报告'].map((name,index)=>node(`template-${index}`,name,'resource'))),node('project-materials','参考资料','resource')]),
 node('outputs','成果','output',['原型','PRD','流程图','调研报告','会议纪要','其他'].map((name,index)=>node(`output-${index}`,name,'output'))),node('process','过程文件','process'),
];}
export function legacyDefaultProjectTree():ProjectTreeNode[]{const nodes=defaultProjectTree();nodes[0].children=[node('project-materials','项目资料','resource'),nodes[0].children[1],node('flow-spec','流程图规范','resource'),node('interface-spec','界面规范','resource')];return nodes;}
export function treePaths(nodes:ProjectTreeNode[],parent=''):ProjectTreeNode[]{return nodes.map(item=>{const relative=parent?path.join(parent,item.name):item.name;return{...item,path:relative,children:treePaths(item.children,relative)};});}
/** Refuse existing symbolic links at every component, including links inside root. */
export async function safeProjectPath(root:string,relative:string,create=false):Promise<string>{
 const realRoot=await fs.realpath(root);if(path.isAbsolute(relative)||relative.includes(':')||relative.includes('\0'))throw Error('INVALID_PATH');
 const segments=relative.split(/[\\/]/).filter(Boolean);if(segments.some(segment=>segment==='.'||segment==='..'))throw Error('INVALID_PATH');let target=realRoot;
 for(const segment of segments){target=path.join(target,segment);let stat;try{stat=await fs.lstat(target);}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;if(create){await fs.mkdir(target);stat=await fs.lstat(target);}else continue;}
  if(stat?.isSymbolicLink())throw Error('SYMLINK_NOT_ALLOWED: 项目目录不能通过链接访问');if(stat&&!stat.isDirectory())throw Error('DIRECTORY_CONFLICT: 路径已被文件占用');
  if(stat){const real=await fs.realpath(target);const rel=path.relative(realRoot,real);if(rel.startsWith('..')||path.isAbsolute(rel))throw Error('PERMISSION_DENIED: 目录越界');}
 }return target;
}

export class ProjectTreeManager{
 constructor(private store:Store){}
 private key(root:string){return`project-tree:v1:${projectIdentity(root)}`;}
 private record(root:string):TreeRecord{return this.store.get<TreeRecord>(this.key(root),{revision:0,nodes:defaultProjectTree(),appliedNodes:[]});}
 agentsInitializationError(root:string){const current=this.record(root);if(current.legacyCleanupPending?.files.includes('AGENTS.md')||current.initializationWarnings?.some(warning=>warning.startsWith('自动目录迁移尚未完成'))&&JSON.stringify(current.appliedNodes)===JSON.stringify(legacyDefaultProjectTree()))return'PROJECT_MIGRATION_PENDING: 旧默认 AGENTS.md 尚未完成安全清理，已保留原文件；请修复目录或文件访问问题后重新打开项目。';return undefined;}
 async migrateDefaultLayout(root:string,mounts:Mount[]){
  const current=this.record(root),legacy=JSON.stringify(legacyDefaultProjectTree());
  if(current.legacyCleanupPending){
   const pending=current.legacyCleanupPending;
   if(pending.stage==='applying'){
    const latestDefault=JSON.stringify(defaultProjectTree()),alreadyApplied=JSON.stringify(current.nodes)===latestDefault&&JSON.stringify(current.appliedNodes)===latestDefault&&current.appliedRevision===current.revision;
    if(!alreadyApplied){
     if(current.revision!==pending.applyRevision||JSON.stringify(current.nodes)!==latestDefault||JSON.stringify(current.appliedNodes)!==legacy){this.store.set(this.key(root),{...current,legacyCleanupPending:undefined,initializationWarnings:['自动目录迁移已停止：保留您修改的目录结构与原有资料。']});return false;}
     try{await this.apply(root,mounts,current.revision);}catch(error){this.store.set(this.key(root),{...current,initializationWarnings:[`自动目录迁移尚未完成：${String((error as Error).message).slice(0,400)}。保留原有资料，下次打开项目将重试。`]});return false;}
    }
    const ready={...pending,stage:'cleanup' as const};this.store.set(this.key(root),{...this.record(root),legacyCleanupPending:ready});await this.retryLegacyCleanup(root,ready);
   }else await this.retryLegacyCleanup(root,pending);return false;
  }
  // Legacy v0.3.3 creation applies revision 1. Later or pending saves are left
  // untouched unless an explicit applied revision confirms there is no draft.
  const fullyApplied=current.appliedRevision===current.revision||current.appliedRevision===undefined&&current.revision===1;
  if(!fullyApplied||JSON.stringify(current.nodes)!==legacy||JSON.stringify(current.appliedNodes)!==legacy)return false;
  const next={...current,revision:current.revision+1,nodes:defaultProjectTree(),legacyCleanupPending:{stage:'applying' as const,applyRevision:current.revision+1,files:Object.keys(LEGACY_GENERATED_FILES),directories:['资源/项目资料','资源/流程图规范','资源/界面规范']}};
  this.store.set(this.key(root),next);try{await this.apply(root,mounts,next.revision);}catch(error){this.store.set(this.key(root),{...current,initializationWarnings:[`自动目录迁移尚未完成：${String((error as Error).message).slice(0,400)}。保留原有资料，下次打开项目将重试。`]});return false;}
  const ready={...next.legacyCleanupPending,stage:'cleanup' as const};this.store.set(this.key(root),{...this.record(root),legacyCleanupPending:ready});await this.retryLegacyCleanup(root,ready);return true;
 }
 private async retryLegacyCleanup(root:string,pending:LegacyCleanup){const current=this.record(root),protectedPaths=new Set<string>();const collect=(nodes:ProjectTreeNode[])=>{for(const node of nodes){protectedPaths.add(node.path!.toLowerCase());collect(node.children);}};collect(treePaths(current.nodes));collect(treePaths(current.appliedNodes));await cleanLegacyGeneratedFiles(root,pending,protectedPaths,(remaining,warnings)=>{const latest=this.record(root);this.store.set(this.key(root),{...latest,legacyCleanupPending:remaining.files.length||remaining.directories.length?remaining:undefined,initializationWarnings:warnings.length?warnings:undefined});});}
 async view(root:string,mounts:Mount[]):Promise<ProjectTreeView>{
  const current=this.record(root);const attach=(nodes:ProjectTreeNode[],mount?:Mount):ProjectTreeNode[]=>treePaths(nodes).map(function visit(item):ProjectTreeNode{const matching=mount??mounts.find(m=>path.resolve(m.path).toLowerCase()===path.resolve(root,item.path!).toLowerCase());return{...item,mountId:matching?.id,children:item.children.map(child=>({...child,mountId:matching?.id,children:child.children.map(function descend(n):ProjectTreeNode{return{...n,mountId:matching?.id,children:n.children.map(descend)};})}))};});
  const applied=treePaths(current.appliedNodes);const declared=new Set<string>();const flatten=(nodes:ProjectTreeNode[])=>{for(const item of nodes){declared.add(item.path!.toLowerCase());flatten(item.children);}};flatten(applied);const dirs:string[]=[];
  const walk=async(relative:string,depth:number)=>{if(depth>6||dirs.length>=200)return;try{const folder=await safeProjectPath(root,relative);for(const entry of (await fs.readdir(folder,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){if(!entry.isDirectory()||entry.isSymbolicLink()||['.git','node_modules','.slash','dist'].includes(entry.name))continue;const child=relative?path.join(relative,entry.name):entry.name;if(!declared.has(child.toLowerCase()))dirs.push(child);await walk(child,depth+1);}}catch{}};await walk('',0);
  return{workspaceId:projectIdentity(root),root,revision:current.revision,nodes:attach(current.nodes),appliedNodes:attach(current.appliedNodes),preservedDirectories:dirs,mounts:mounts.map(m=>({...m})),mountRoles:this.roles(root,mounts),initializationWarnings:current.initializationWarnings};
 }
 save(root:string,nodes:ProjectTreeNode[],revision:number){const parsed=projectTreeNodesSchema.parse(nodes),current=this.record(root);if(revision!==current.revision)throw Error('VERSION_CONFLICT: 目录结构已经变化');for(const prior of current.nodes){const next=parsed.find(node=>node.id===prior.id);if(!next||next.role!==prior.role)throw Error('TREE_ROOT_PROTECTED: 分类根目录不能删除或改变角色');}this.store.set(this.key(root),{...current,revision:revision+1,nodes:parsed});}
 async apply(root:string,mounts:Mount[],revision:number){
  const current=this.record(root);if(revision!==current.revision)throw Error('VERSION_CONFLICT: 目录结构已经变化');
  const walk=async(nodes:ProjectTreeNode[])=>{for(const item of nodes){await safeProjectPath(root,item.path!,true);await walk(item.children);}};const paths=treePaths(current.nodes);await walk(paths);
  const mountRoles=this.roles(root,mounts);for(const item of paths){const absolute=path.join(root,item.path!);let mount=mounts.find(m=>path.resolve(m.path).toLowerCase()===absolute.toLowerCase());if(!mount){mount={id:randomUUID(),name:item.name,path:absolute,write:true,enabled:true};mounts.push(mount);}mountRoles[mount.id]=item.role;}
  this.store.set(this.key(root),{...current,revision:current.revision+1,appliedRevision:current.revision+1,appliedNodes:current.nodes,mountRoles});return this.view(root,mounts);
 }
 applied(root:string){return treePaths(this.record(root).appliedNodes);}
 roles(root:string,mounts:Mount[]){const current=this.record(root);const roles={...current.mountRoles};for(const mount of mounts){if(roles[mount.id])continue;const applied=current.appliedNodes.find(node=>path.resolve(root,node.name).toLowerCase()===path.resolve(mount.path).toLowerCase());roles[mount.id]=applied?.role??(/^(原型|产出材料|成果)$/.test(mount.name)?'output':mount.name==='过程文件'?'process':'resource');}return roles;}
}

// Fixed paths and complete bytes are the only evidence accepted for cleaning
// old generated content. This is not a Markdown extension or directory sweep.
const LEGACY_GENERATED_FILES:Record<string,string>={
 'AGENTS.md':'# 产品工作规则\n先查授权资料，区分证据与假设。修改保留版本，交付核对结果。\n',
 '资源/模板/PRD/标准PRD.md':'# 产品需求文档 <!-- pm-section:prd -->\n## 背景与目标 <!-- pm-section:goals -->\n## 用户与角色 <!-- pm-section:roles -->\n## 业务流程 <!-- pm-section:flow -->\n## 页面与字段 <!-- pm-section:pages-fields -->\n## 权限与规则 <!-- pm-section:permissions-rules -->\n## 异常处理 <!-- pm-section:exceptions -->\n## 验收标准 <!-- pm-section:acceptance -->\n',
 '资源/模板/蓝图/服务蓝图.md':'# 服务蓝图\n## 用户行为\n## 前台流程\n## 后台流程\n## 支持流程\n',
 '资源/模板/会议纪要/会议纪要.md':'# 会议纪要\n## 议题\n## 已确认事项\n## 待确认事项\n## 行动项\n',
 '资源/模板/调研报告/调研报告.md':'# 调研报告\n## 问题\n## 方法\n## 证据\n## 结论\n## 限制\n',
 '资源/流程图规范/规范.md':'# 流程图规范\n使用 draw.io XML。开始结束为圆角，判断为菱形，常规步骤为矩形。连线标明条件。\n',
 '资源/界面规范/规范.md':'# 界面规范\nB端桌面应用，清晰的表格、筛选、表单、状态和异常反馈。\n',
};
async function cleanLegacyGeneratedFiles(root:string,pending:LegacyCleanup,protectedPaths:Set<string>,update:(remaining:LegacyCleanup,warnings:string[])=>void){
 const realRoot=await fs.realpath(root);
 const remaining=structuredClone(pending),warnings:string[]=[];
 for(const relative of [...pending.files]){
  const expected=LEGACY_GENERATED_FILES[relative];let retry=false;
  if(expected===undefined){remaining.files=remaining.files.filter(item=>item!==relative);update(remaining,warnings);continue;}
  try{const directory=await safeProjectPath(realRoot,path.dirname(relative)==='.'?'':path.dirname(relative)),candidate=path.join(directory,path.basename(relative));const stat=await fs.lstat(candidate);if(stat.isSymbolicLink()||!stat.isFile()||stat.size!==Buffer.byteLength(expected))continue;
   const real=await fs.realpath(candidate);if(path.relative(realRoot,real)!==path.normalize(relative))continue;const content=await fs.readFile(candidate,'utf8');if(content!==expected)continue;
   await safeProjectPath(realRoot,path.dirname(relative)==='.'?'':path.dirname(relative));const latest=await fs.lstat(candidate);if(latest.isSymbolicLink()||!latest.isFile()||latest.ino!==stat.ino||latest.size!==stat.size||latest.mtimeMs!==stat.mtimeMs||await fs.realpath(candidate)!==real||await fs.readFile(candidate,'utf8')!==expected)continue;
   await fs.unlink(candidate);
  }catch(error){if(!(['ENOENT','SYMLINK_NOT_ALLOWED','PERMISSION_DENIED','DIRECTORY_CONFLICT'].some(code=>String((error as Error).message).startsWith(code))||(error as NodeJS.ErrnoException).code==='ENOENT')){retry=true;warnings.push(`旧样例清理未完成：${relative}（${(error as NodeJS.ErrnoException).code??'文件不可访问'}）。下次打开项目将重新核对后重试。`);}}
  finally{if(!retry)remaining.files=remaining.files.filter(item=>item!==relative);update(remaining,warnings);}
 }
 for(const relative of [...pending.directories]){let retry=false;try{if(!['资源/项目资料','资源/流程图规范','资源/界面规范'].includes(relative)||protectedPaths.has(path.normalize(relative).toLowerCase()))continue;const directory=await safeProjectPath(realRoot,relative);if((await fs.readdir(directory)).length===0)await fs.rmdir(directory);}catch(error){if(!(['ENOENT','ENOTEMPTY','EEXIST'].includes((error as NodeJS.ErrnoException).code??'')||/^(SYMLINK_NOT_ALLOWED|PERMISSION_DENIED|DIRECTORY_CONFLICT)/.test(String((error as Error).message)))){retry=true;warnings.push(`旧空目录清理未完成：${relative}（${(error as NodeJS.ErrnoException).code??'目录不可访问'}）。下次打开项目将重试。`);}}finally{if(!retry)remaining.directories=remaining.directories.filter(item=>item!==relative);update(remaining,warnings);}}
}
