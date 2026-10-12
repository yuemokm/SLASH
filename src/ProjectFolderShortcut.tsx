import {useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import type {Request} from '../shared/types';
import type {ProjectCatalogView,ProjectDirectoryView} from '../shared/project-catalog';
import {Icon} from './Icon';
import './project-folder-shortcut.css';

export type ProjectImportTarget={projectId:string;mountId:string;path:string;label:string};
type Folder={mountId:string;path:string;name:string};
type Props={projectId:string;projectName:string;kind:'resource'|'output';count?:number;busy:boolean;call:(request:Request)=>Promise<unknown>;onDrop:(files:File[],target:ProjectImportTarget)=>void;onError:(message:string)=>void};

export async function shortcutRoot(call:Props['call'],projectId:string,kind:Props['kind']):Promise<Folder>{
 const catalog=await call({type:'projectCatalog'}) as ProjectCatalogView,project=catalog.projects.find(item=>item.id===projectId);
 if(!project)throw Error('项目已移除或当前不可用');
 const node=project.nodes.find(item=>item.role===kind&&item.mountId),mount=project.mounts.find(item=>item.id===node?.mountId)??project.mounts.find(item=>project.mountRoles[item.id]===kind);
 if(!mount)throw Error(`此项目没有已授权的${kind==='resource'?'资源':'成果'}目录`);
 return{mountId:mount.id,path:'',name:mount.name};
}

export function ProjectFolderShortcut({projectId,projectName,kind,count,busy,call,onDrop,onError}:Props){
 const label=kind==='resource'?'资源':'成果';
 const [open,setOpen]=useState(false),[root,setRoot]=useState<Folder>(),[directory,setDirectory]=useState<ProjectDirectoryView>(),[error,setError]=useState(''),[loading,setLoading]=useState(false),[hover,setHover]=useState(''),[position,setPosition]=useState({left:0,top:0});
 const trigger=useRef<HTMLButtonElement>(null),panel=useRef<HTMLDivElement>(null),request=useRef(0),opened=useRef(false);
 const close=()=>{opened.current=false;request.current++;setOpen(false);setHover('');};
 useEffect(()=>{
  const done=()=>close(),key=(event:KeyboardEvent)=>{if(event.key==='Escape')close();};
  const leave=(event:DragEvent)=>{const target=event.target as Node|null;if(target&&!trigger.current?.contains(target)&&!panel.current?.contains(target))close();};
  const exit=(event:DragEvent)=>{if(!event.relatedTarget&&(event.clientX<=0||event.clientY<=0||event.clientX>=window.innerWidth||event.clientY>=window.innerHeight))close();};
  window.addEventListener('dragend',done);window.addEventListener('drop',done);window.addEventListener('blur',done);window.addEventListener('keydown',key);window.addEventListener('dragenter',leave,true);window.addEventListener('dragover',leave,true);window.addEventListener('dragleave',exit,true);
  return()=>{request.current++;window.removeEventListener('dragend',done);window.removeEventListener('drop',done);window.removeEventListener('blur',done);window.removeEventListener('keydown',key);window.removeEventListener('dragenter',leave,true);window.removeEventListener('dragover',leave,true);window.removeEventListener('dragleave',exit,true);};
 },[]);
 const begin=async(event:React.DragEvent)=>{
  if(!event.dataTransfer.types.includes('Files')||busy)return;
  event.preventDefault();event.dataTransfer.dropEffect='copy';if(opened.current)return;opened.current=true;
  const rect=trigger.current!.getBoundingClientRect();setPosition({left:Math.max(8,Math.min(rect.right,window.innerWidth-292)),top:Math.max(8,Math.min(rect.top,window.innerHeight-330))});
  setOpen(true);setRoot(undefined);setDirectory(undefined);setError('');setLoading(true);const id=++request.current;
  try{const folder=await shortcutRoot(call,projectId,kind);if(id!==request.current)return;setRoot(folder);const contents=await call({type:'projectBrowse',projectId,mountId:folder.mountId,path:folder.path}) as ProjectDirectoryView;if(id===request.current)setDirectory(contents);}
  catch(reason){if(id===request.current)setError((reason as Error).message||String(reason));}
  finally{if(id===request.current)setLoading(false);}
 };
 const over=(event:React.DragEvent,path='')=>{if(!event.dataTransfer.types.includes('Files'))return;event.preventDefault();event.stopPropagation();event.dataTransfer.dropEffect=busy||loading||Boolean(error)?'none':'copy';setHover(path);};
 const drop=(event:React.DragEvent,path='')=>{
  event.preventDefault();event.stopPropagation();const files=Array.from(event.dataTransfer.files),folder=root;close();
  if(busy)return;if(!folder||loading||error){onError(error||'目录仍在加载，请稍后重新拖入');return;}
  if(files.length)onDrop(files,{projectId,mountId:folder.mountId,path,label:`${projectName} / ${folder.name}${path?` / ${path}`:''}`});
 };
 const openDirectory=async()=>{close();try{const folder=await shortcutRoot(call,projectId,kind);await call({type:'projectOpenDirectory',projectId,mountId:folder.mountId,path:folder.path});}catch(reason){onError((reason as Error).message||String(reason));}};
 return <><button ref={trigger} className={open?'project-folder-shortcut dragging':'project-folder-shortcut'} title={`打开${projectName}的${label}文件夹；拖入文件选择保存目录`} onClick={()=>void openDirectory()} onDragEnter={event=>void begin(event)} onDragOver={event=>over(event)} onDrop={event=>drop(event)}>
  <Icon name={kind==='resource'?'folder':'file'} size={14}/>{label}{count?<small>{count}</small>:null}
 </button>{open&&createPortal(<div ref={panel} className="project-folder-drop-menu" style={position} role="region" aria-label={`${projectName}${label}导入目录`} onDragOver={event=>over(event,hover)} onDrop={event=>drop(event)}>
  <div className="project-folder-drop-heading"><b>{projectName} · {label}</b><small>松开鼠标复制到所选文件夹</small></div>
  {loading?<p role="status">正在读取文件夹…</p>:error?<p role="alert" className="project-folder-drop-error">{error}</p>:<>
   <div className="project-folder-drop-list">
    <div className={`project-folder-drop-option ${hover===''?'hovered':''}`} onDragOver={event=>over(event,'')} onDrop={event=>drop(event,'')}><Icon name="folder" size={17}/><span>{root?.name}<small>此文件夹</small></span></div>
    {directory?.entries.filter(entry=>entry.kind==='directory').map(entry=><div key={entry.path} className={`project-folder-drop-option ${hover===entry.path?'hovered':''}`} onDragOver={event=>over(event,entry.path)} onDrop={event=>drop(event,entry.path)}><Icon name="folder" size={17}/><span>{entry.name}</span></div>)}
   </div>
   {!directory?.entries.some(entry=>entry.kind==='directory')&&<p role="status">没有子文件夹，可放入此文件夹。</p>}
   {directory?.truncated&&<p role="status">仅显示当前层前 1000 项中的文件夹。</p>}
   {directory?.warnings.map(warning=><p role="status" key={warning}>{warning}</p>)}
  </>}
 </div>,trigger.current?.closest('.app')||document.body)}</>;
}
