import React, {useEffect, useState} from "react";
import {Icon} from "./Icon";
import type {ProjectTreeNode, ProjectTreeView, Request} from "../shared/types";
import "./project-structure-editor.css";

type Call = (request: Request) => Promise<unknown>;
const roleLabels = {resource:"资源", output:"成果", process:"过程文件"};
// Send configuration fields only; physical paths belong to the host.
const configuration = (nodes: ProjectTreeNode[]): ProjectTreeNode[] => nodes.map(({id,name,role,children}) => ({id,name,role,children:configuration(children)}));
const signature = (nodes: ProjectTreeNode[]) => JSON.stringify(configuration(nodes));
function folderNameError(name:string) {
 if (!name.trim()) return "请填写文件夹名称。";
 if (name.length>120) return "文件夹名称不能超过120个字符。";
 if (name!==name.trim() || /[. ]$/.test(name)) return "名称开头或结尾不能有空格，结尾不能有句点。";
 if (name==="." || name===".." || /[<>:"/\\|?*\u0000-\u001f]/.test(name)) return "名称不能包含路径分隔符或 < > : \" | ? * 等字符。";
 if (/^(con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i.test(name)) return "这个名称由Windows保留，请换一个名称。";
 return "";
}
function treeError(nodes:ProjectTreeNode[],depth=1):string {
 const names=new Set<string>();
 for (const node of nodes) {
  const invalid=folderNameError(node.name);if(invalid)return `${node.name || "未命名文件夹"}：${invalid}`;
  const normalized=node.name.toLocaleLowerCase();if(names.has(normalized))return `同一层不能有同名文件夹：${node.name}。`;names.add(normalized);
  if(depth>6)return "目录结构最多支持6层。";
  const childError=treeError(node.children,depth+1);if(childError)return childError;
 }
 return "";
}
const nodeCount=(nodes:ProjectTreeNode[]):number=>nodes.reduce((sum,node)=>sum+1+nodeCount(node.children),0);
function editNodes(nodes:ProjectTreeNode[],id:string,edit:(node:ProjectTreeNode)=>ProjectTreeNode):ProjectTreeNode[] {
 return nodes.map(node=>node.id===id?edit(node):{...node,children:editNodes(node.children,id,edit)});
}
function moveNode(nodes:ProjectTreeNode[],id:string,direction:number):ProjectTreeNode[] {
 const index=nodes.findIndex(node=>node.id===id);
 if(index>=0){const next=index+direction;if(next<0||next>=nodes.length)return nodes;const changed=[...nodes];[changed[index],changed[next]]=[changed[next],changed[index]];return changed;}
 return nodes.map(node=>({...node,children:moveNode(node.children,id,direction)}));
}
function removeNode(nodes:ProjectTreeNode[],id:string):ProjectTreeNode[] {
 return nodes.filter(node=>node.id!==id).map(node=>({...node,children:removeNode(node.children,id)}));
}

export function ProjectStructureEditor({root,call,onRefresh,onNotice,onError}:{root:string;call:Call;onRefresh:()=>Promise<void>;onNotice:(text:string)=>void;onError:(text:string)=>void}) {
 const [view,setView]=useState<ProjectTreeView>();
 const [nodes,setNodes]=useState<ProjectTreeNode[]>([]);
 const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false);
 const [feedback,setFeedback]=useState<{kind:"success"|"error";text:string}>();
 const [collapsed,setCollapsed]=useState<Record<string,boolean>>({});
 useEffect(()=>{let disposed=false;setLoading(true);setView(undefined);setFeedback(undefined);
  void call({type:"projectTreeGet"}).then(value=>{if(disposed)return;const next=value as ProjectTreeView;setView(next);setNodes(configuration(next.nodes));}).catch(reason=>{if(!disposed)setFeedback({kind:"error",text:reason instanceof Error?reason.message:String(reason)});}).finally(()=>{if(!disposed)setLoading(false);});
  return()=>{disposed=true;};
 },[root,call]);
 const dirty=Boolean(view&&signature(nodes)!==signature(view.nodes));
 const pending=Boolean(view&&signature(view.nodes)!==signature(view.appliedNodes));
 const validation=treeError(nodes)||(nodeCount(nodes)>200?"目录结构最多支持200个文件夹。":"");
 const change=(next:ProjectTreeNode[])=>{setNodes(next);setFeedback(undefined);};
 const addChild=(node:ProjectTreeNode)=>{
  let name="新文件夹",number=2;while(node.children.some(child=>child.name.toLocaleLowerCase()===name.toLocaleLowerCase()))name=`新文件夹 ${number++}`;
  change(editNodes(nodes,node.id,value=>({...value,children:[...value.children,{id:`tree-${crypto.randomUUID()}`,name,role:value.role,children:[]}]})));setCollapsed(current=>({...current,[node.id]:false}));
 };
 const apply=async()=>{
  if(!view||busy||validation)return;setBusy(true);setFeedback(undefined);
  let saved=view,appliedConfirmed=false;
  try{
   if(dirty){saved=await call({type:"projectTreeSave",workspaceId:view.workspaceId,nodes:configuration(nodes),expectedRevision:view.revision}) as ProjectTreeView;setView(saved);setNodes(configuration(saved.nodes));}
   const applied=await call({type:"projectTreeApply",workspaceId:saved.workspaceId,expectedRevision:saved.revision}) as ProjectTreeView;
   setView(applied);setNodes(configuration(applied.nodes));appliedConfirmed=true;
   if(applied.index?.lastError){const text=`项目结构已应用，但资料索引尚未同步：${applied.index.lastError}`;setFeedback({kind:"error",text});onError(text);}
   else{const text="项目结构已应用；已有目录和文件已保留。";setFeedback({kind:"success",text});onNotice(text);}
   await onRefresh();
  }catch(reason){const text=`${appliedConfirmed?"结构已应用，但列表刷新失败。 ":saved!==view?"结构配置已保存，但尚未确认应用完成。 ":"项目结构尚未确认应用完成。 "}${reason instanceof Error?reason.message:String(reason)}`;setFeedback({kind:"error",text});onError(text);}
  finally{setBusy(false);}
 };
 const render=(items:ProjectTreeNode[],depth=1,parentPath="")=> <ul className="project-structure-branches" aria-label={depth===1?"项目目录结构":undefined}>{items.map((node,index)=>{
  const path=parentPath?`${parentPath}/${node.name}`:node.name,error=folderNameError(node.name),isCollapsed=Boolean(collapsed[node.id]);
  return <li key={node.id}>
   <div className={`project-structure-row ${depth===1?"root":""}`} style={{paddingLeft:Math.min(depth-1,5)*16}}>
    <button type="button" className="project-structure-fold" aria-label={`${isCollapsed?"展开":"收起"}${node.name}`} aria-expanded={node.children.length?!isCollapsed:undefined} disabled={!node.children.length||busy} onClick={()=>setCollapsed(current=>({...current,[node.id]:!isCollapsed}))}><Icon name={isCollapsed?"chevronRight":"chevronDown"} size={14}/></button>
    <Icon name="folder" size={16}/>
    <input aria-label={`${path}文件夹名称`} aria-invalid={Boolean(error)} title={path} value={node.name} maxLength={120} disabled={busy} onChange={event=>change(editNodes(nodes,node.id,value=>({...value,name:event.target.value})))}/>
    {depth===1&&<span className="project-structure-role">{roleLabels[node.role]}</span>}
    <div className="project-structure-tools">
     <button type="button" title="添加子文件夹" aria-label={`在${path}添加子文件夹`} disabled={busy||depth>=6||nodeCount(nodes)>=200} onClick={()=>addChild(node)}><Icon name="plus" size={14}/></button>
     <button type="button" title="上移" aria-label={`上移${path}`} disabled={busy||index===0} onClick={()=>change(moveNode(nodes,node.id,-1))}>↑</button>
     <button type="button" title="下移" aria-label={`下移${path}`} disabled={busy||index===items.length-1} onClick={()=>change(moveNode(nodes,node.id,1))}>↓</button>
     <button type="button" title={depth===1?"保留项目分类":"移除结构节点，保留磁盘文件"} aria-label={`移除${path}结构节点`} disabled={busy||depth===1} onClick={()=>change(removeNode(nodes,node.id))}><Icon name="trash" size={14}/></button>
    </div>
   </div>
   {node.children.length>0&&!isCollapsed&&render(node.children,depth+1,path)}
  </li>;
 })}</ul>;
 return <div className="settings-group project-structure-editor" data-setting-id="project-structure" tabIndex={-1}>
  <div className="settings-group-title"><div><h3>项目结构</h3><small>编辑文件夹名称和层级；应用后创建目录。移除或改名会保留原目录与文件。</small></div><span aria-live="polite">{loading?"正在读取":busy?"正在应用":dirty?"有未应用修改":pending?"配置尚未应用":"已应用"}</span></div>
  {loading?<p role="status">正在读取项目结构…</p>:view?<>
   <div className="project-structure-tree">{render(nodes)}</div>
   {validation&&<p className="project-structure-error" role="alert">{validation}</p>}
   <div className="project-structure-actions"><small>{view.root||root}</small><button type="button" disabled={busy||!dirty} onClick={()=>{setNodes(configuration(view.nodes));setFeedback(undefined);}}>放弃修改</button><button type="button" className="primary" disabled={busy||Boolean(validation)||(!dirty&&!pending)} onClick={()=>void apply()}>{busy?"正在应用…":"应用结构"}</button></div>
   {view.preservedDirectories.length>0&&<details className="project-structure-preserved"><summary>保留的已有目录（{view.preservedDirectories.length}）</summary><ul>{view.preservedDirectories.map(directory=><li key={directory}>{directory}</li>)}</ul></details>}
  </>:null}
  {feedback&&<p className={`inline-feedback ${feedback.kind}`} role={feedback.kind==="error"?"alert":"status"}>{feedback.text}</p>}
  {!feedback&&view?.index?.lastError&&<p className="inline-feedback error" role="alert">资料索引尚未同步：{view.index.lastError}</p>}
 </div>;
}
