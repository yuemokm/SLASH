import fs from 'node:fs/promises';
import path from 'node:path';
import type {Mount,ProjectRegistry,State} from '../shared/types.js';
import type {CatalogProject,ProjectCatalogView,ProjectDirectoryView,ProjectDocumentView} from '../shared/project-catalog.js';
import {Files,hash} from './files.js';
import {ProjectTreeManager,projectIdentity} from './project-tree.js';
import type {Store} from './store.js';

/** Read-only project browsing: never opens a workspace, creates directories,
 * updates project ordering, or exchanges the active conversation partition. */
export class ProjectCatalog{
 constructor(private store:Store,private current:()=>State){}
 private assertReadAllowed(){if(this.current().permissions?.workspace_read==='deny')throw Error('PERMISSION_DENIED: 资料读取权限已禁用');}
 private project(id:string){const item=this.store.get<ProjectRegistry>('projects:v1',{projects:[]}).projects.find(item=>item.id===id&&!item.removedAt);if(!item)throw Error('PROJECT_NOT_FOUND: 项目已移除或不存在');return item;}
 private mounts(id:string):Mount[]{
  const project=this.project(id),active=this.current();
  const rootKey=(root:string)=>process.platform==='win32'?path.resolve(root).toLowerCase():path.resolve(root);
  if(rootKey(active.root)===rootKey(project.root))return active.mounts;
  const partition=this.store.get<Pick<State,'root'|'mounts'>|null>(`workspace-state:${projectIdentity(project.root)}`,null);
  if(!partition||rootKey(partition.root)!==rootKey(project.root))throw Error('PROJECT_UNAVAILABLE: 项目目录授权信息不可用，请显式打开项目');
  return partition.mounts;
 }
 private files(id:string){const tree=new ProjectTreeManager(this.store);return new Files(()=>this.mounts(id),()=>tree.applied(this.project(id).root).flatMap(root=>{const refs:string[]=[];const walk=(node:typeof root)=>{if(/^(参考资料|项目资料)$/.test(node.name)&&node.path)refs.push(path.join(this.project(id).root,node.path));node.children.forEach(walk);};walk(root);return refs;}));}
 private signature(id:string){this.assertReadAllowed();return JSON.stringify(this.mounts(id));}
 private assertUnchanged(id:string,before:string){if(this.signature(id)!==before)throw Error('PERMISSION_CHANGED: 项目目录授权已变化，请重新加载');}
 list():ProjectCatalogView{
  this.assertReadAllowed();
  const active=this.current(),tree=new ProjectTreeManager(this.store),registry=this.store.get<ProjectRegistry>('projects:v1',{projects:[]});
  const projects:CatalogProject[]=registry.projects.filter(item=>!item.removedAt).sort((a,b)=>Number(Boolean(b.pinned))-Number(Boolean(a.pinned))||a.name.localeCompare(b.name)).map(item=>{
   let mounts:Mount[]=[];try{mounts=this.mounts(item.id).filter(mount=>mount.enabled).map(mount=>({...mount}));}catch{}
   const applied=tree.applied(item.root);
   const nodes=applied.map(root=>{const mount=mounts.find(mount=>path.resolve(mount.path).toLowerCase()===path.resolve(item.root,root.path!).toLowerCase());const attach=(node:typeof root):typeof root=>({...node,mountId:mount?.id,children:node.children.map(attach)});return attach(root);});
   return{id:item.id,name:item.name,root:item.root,current:path.resolve(active.root).toLowerCase()===path.resolve(item.root).toLowerCase(),mounts,nodes,mountRoles:tree.roles(item.root,mounts)};
  });
  return{projects,currentProjectId:projects.find(item=>item.current)?.id??null};
 }
 async browse(projectId:string,mountId:string,relative=''):Promise<ProjectDirectoryView>{
  const before=this.signature(projectId),files=this.files(projectId),directory=await files.resolve(mountId,relative||'.');
  if(!(await fs.stat(directory)).isDirectory())throw Error('DIRECTORY_REQUIRED: 请选择文件夹');
  const source=(await fs.readdir(directory,{withFileTypes:true})).sort((a,b)=>Number(b.isDirectory())-Number(a.isDirectory())||a.name.localeCompare(b.name));
  const entries:ProjectDirectoryView['entries']=[],warnings:string[]=[];let truncated=false;
  for(const entry of source){
   if(entry.isSymbolicLink()||['.git','node_modules','.slash','dist'].includes(entry.name))continue;
   if(entries.length>=1000){truncated=true;break;}
   const child=path.posix.join(relative.replace(/\\/g,'/'),entry.name);
   try{const target=await files.resolve(mountId,child),stat=await fs.stat(target);if(!stat.isDirectory()&&!stat.isFile())continue;entries.push({name:entry.name,path:child,kind:stat.isDirectory()?'directory':'file',size:stat.size,referenceProtected:await files.isReferencePath(target)});}catch{if(!warnings.length)warnings.push('部分目录或文件当前不可读取，已跳过；请检查目录授权和链接目标。');}
  }
  await files.resolve(mountId,relative||'.');this.assertUnchanged(projectId,before);
  return{projectId,mountId,path:relative,entries,truncated,warnings};
 }
 async read(projectId:string,mountId:string,relative:string):Promise<ProjectDocumentView>{
  const before=this.signature(projectId),files=this.files(projectId),file=await files.resolve(mountId,relative);
  const content=await files.read(mountId,relative),version=hash(content);
  await files.resolve(mountId,relative);this.assertUnchanged(projectId,before);
  return{projectId,projectName:this.project(projectId).name,path:relative,content,version,format:/\.md$/i.test(file)?'markdown':/\.docx$/i.test(file)?'word':'text',...(/\.docx$/i.test(file)?{notice:'已提取 Word 正文；复杂样式、批注或文本框可能未完整保留。'}:{})};
 }
 async resolve(projectId:string,mountId:string,relative:string){const before=this.signature(projectId),files=this.files(projectId),target=await files.resolve(mountId,relative||'.');this.assertUnchanged(projectId,before);return target;}
}
