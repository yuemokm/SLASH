import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Icon, type IconName } from "./Icon";
import {ProjectFolderShortcut,type ProjectImportTarget} from './ProjectFolderShortcut';
import type {Request} from '../shared/types';

export type SidebarView =
  | "会话"
  | "资源"
  | "成果"
  | "设计体系"
  | "测试用例"
  | "知识库"
  | "规则与模板"
  | "共享文件夹";

export type ConversationItem = {
  id: string;
  title: string;
  archived: boolean;
  projectId?: string;
  projectName?: string;
};

export type SidebarProject = {
  id: string;
  name: string;
  isDefault?: boolean;
  conversationCount?: number;
  conversations?: Array<Pick<ConversationItem, "id" | "title" | "archived">>;
  root?: string;
  pinned?: boolean;
  activeRunCount?: number;
};

export type ProjectEntry = {
  id: string;
  label: string;
  kind: "resource" | "artifact";
  path?: string;
};
export type ImportCategory = "resource" | "prototype" | "output";

type SidebarProps = {
  view: SidebarView;
  conversations: ConversationItem[];
  conversationId: string;
  conversationQuery: string;
  showArchived: boolean;
  project?: SidebarProject;
  projects?: SidebarProject[];
  projectEntries?: ProjectEntry[];
  importBusy?: boolean;
  onView: (view: SidebarView) => void;
  onConversation: (id: string) => void;
  onConversationQuery: (value: string) => void;
  onToggleArchived: () => void;
  onNew: () => void;
  onSettings: () => void;
  onProjectChange?: (id: string) => void | Promise<void>;
  onProjectView?: (kind: "resource" | "artifact") => void;
  onProjectRename?: (id: string, name: string) => Promise<void>;
  onProjectPin?: (id: string, pinned: boolean) => Promise<void>;
  onProjectRemove?: (id: string) => Promise<void>;
  onProjectReveal?: (id: string) => Promise<void>;
  onProjectCopyPath?: (id: string) => Promise<void>;
  onConversationRename?: (id: string, title: string) => void;
  onConversationArchive?: (id: string, archived: boolean) => void;
  onImportFiles?: (files: File[], category: ImportCategory, target?:ProjectImportTarget) => void;
  projectFolderRequest?: (request:Request)=>Promise<unknown>;
  onFolderError?: (message:string)=>void;
  settingsOpen: boolean;
  projectSidebarCollapsed?: boolean;
  resourceProjectId?: string;
  onToggleProjectSidebar?: () => void;
};

const productNavigation: Array<[SidebarView, IconName]> = [
  ["规则与模板", "book"],
  ["共享文件夹", "share"],
];

const storageKey = "slash:sidebar:product-navigation-open";

export function Sidebar({
  view,
  conversations,
  conversationId,
  conversationQuery,
  showArchived,
  project,
  projects = [],
  projectEntries = [],
  importBusy = false,
  onView,
  onConversation,
  onConversationQuery,
  onToggleArchived,
  onNew,
  onSettings,
  onProjectChange,
  onProjectView,
  onProjectRename, onProjectPin, onProjectRemove, onProjectReveal, onProjectCopyPath,
  onConversationRename,
  onConversationArchive,
  onImportFiles,
  projectFolderRequest, onFolderError,
  settingsOpen,
  projectSidebarCollapsed = false,
  resourceProjectId,
  onToggleProjectSidebar,
}: SidebarProps) {
  const [productOpen, setProductOpen] = useState(
    () => localStorage.getItem(storageKey) === "true",
  );
  const [expandedProjects, setExpandedProjects] = useState<Record<string, boolean>>({});
  // The host registry orders projects by last opened time. Keep the sidebar
  // order stable so expanding or switching a project does not make it jump
  // to the top of the list.
  const [projectOrder, setProjectOrder] = useState<string[]>([]);
  const [dragging, setDragging] = useState(false);
  const [menu, setMenu] = useState<{x:number;y:number;kind:"project"|"conversation";id:string;label:string;archived?:boolean}>();
  const menuRef = useRef<HTMLDivElement>(null), menuTrigger = useRef<HTMLElement | null>(null);
  const [menuPosition, setMenuPosition] = useState({left:8,top:8});
  const [projectDialog, setProjectDialog] = useState<{id:string;label:string;kind:"rename"|"remove"}>();
  const [projectName, setProjectName] = useState("");
  const [projectActionBusy, setProjectActionBusy] = useState(false);
  const [projectActionError, setProjectActionError] = useState("");
  const dialogRef = useRef<HTMLFormElement>(null);
  const closeMenu = () => { setMenu(undefined);requestAnimationFrame(() => menuTrigger.current?.focus()); };
  const openProjectMenu = (event: React.MouseEvent<HTMLButtonElement> | React.KeyboardEvent<HTMLButtonElement>, item: SidebarProject) => {
    event.preventDefault();menuTrigger.current=event.currentTarget;
    const rect=event.currentTarget.getBoundingClientRect(), mouse="clientX" in event && event.clientX>0;
    setMenu({x:mouse?event.clientX:rect.left+18,y:mouse?event.clientY:rect.bottom,kind:"project",id:item.id,label:item.name});
  };
  useLayoutEffect(() => { if(!menu || !menuRef.current)return;const box=menuRef.current.getBoundingClientRect();setMenuPosition({left:Math.max(8,Math.min(menu.x,window.innerWidth-box.width-8)),top:Math.max(44,Math.min(menu.y,window.innerHeight-box.height-8))});requestAnimationFrame(()=>menuRef.current?.querySelector<HTMLButtonElement>('button:not([disabled])')?.focus()); },[menu]);
  useEffect(() => { if(projectDialog)requestAnimationFrame(()=>dialogRef.current?.querySelector<HTMLElement>('input,button')?.focus()); },[projectDialog]);
  const closeProjectDialog = () => { if(projectActionBusy)return;setProjectDialog(undefined);setProjectActionError("");requestAnimationFrame(()=>menuTrigger.current?.focus()); };
  useEffect(() => { const close = () => setMenu(undefined); const keydown = (event: KeyboardEvent) => { if (event.key === "Escape") close(); }; window.addEventListener("click", close); window.addEventListener("resize", close); window.addEventListener("keydown", keydown); return () => { window.removeEventListener("click", close); window.removeEventListener("resize", close); window.removeEventListener("keydown", keydown); }; }, []);
  useEffect(
    () => localStorage.setItem(storageKey, String(productOpen)),
    [productOpen],
  );

  useEffect(() => {
    if (!project?.id) return;
    setExpandedProjects((previous) =>
      previous[project.id] === true
        ? previous
        : { ...previous, [project.id]: true },
    );
  }, [project?.id]);

  useEffect(() => {
    const incoming = projects.map((item) => item.id);
    setProjectOrder((previous) => {
      const retained = previous.filter((id) => incoming.includes(id));
      const appended = incoming.filter((id) => !previous.includes(id));
      return [...retained, ...appended];
    });
  }, [projects]);

  const projectItems = projects.length
    ? projectOrder
        .map((id) => projects.find((item) => item.id === id))
        .filter((item): item is SidebarProject => Boolean(item)).sort((a,b)=>Number(Boolean(b.pinned))-Number(Boolean(a.pinned)))
    : project
      ? [project]
      : [];
  const projectConversations = (item: SidebarProject) => {
    const source = item.id === project?.id ? conversations : (item.conversations || []);
    return source.filter((conversation) => !conversation.archived).filter((conversation) => conversation.title.toLowerCase().includes(conversationQuery.toLowerCase()));
  };
  const toggleProject = (item: SidebarProject) => {
    const isOpen = expandedProjects[item.id] === true;
    setExpandedProjects((previous) => ({ ...previous, [item.id]: !isOpen }));
    if (item.id !== project?.id) onProjectChange?.(item.id);
  };

  const resources = projectEntries.filter((entry) => entry.kind === "resource");
  const artifacts = projectEntries.filter((entry) => entry.kind === "artifact");
  const handleDrop = (event: React.DragEvent<HTMLElement>, category: ImportCategory = "resource") => {
    event.preventDefault();
    setDragging(false);
    const dropped = Array.from(event.dataTransfer.files);
    if (dropped.length) onImportFiles?.(dropped, category);
  };
  const switchProject = async (id: string) => {
    await onProjectChange?.(id);
  };

  return (
    <aside className="sidebar">
      <div className="sidebar-rail" aria-label="快捷导航">
        <button className={view === "会话" && !settingsOpen ? "rail-item active" : "rail-item"} aria-label="会话" title="会话" onClick={() => onView("会话")}><span className="rail-icon"><Icon name="chat" /></span><span className="rail-label">会话</span></button>
        <div className="rail-divider" />
        <button className={(view === "知识库" || view === "资源" && !resourceProjectId) && !settingsOpen ? "rail-item active" : "rail-item"} aria-label="资源" title="所有项目资源" onClick={() => onView("资源")}><span className="rail-icon"><Icon name="book" /></span><span className="rail-label">资源</span></button>
        <button className={view === "成果" && !resourceProjectId && !settingsOpen ? "rail-item active" : "rail-item"} aria-label="成果" title="所有项目成果" onClick={() => onView("成果")}><span className="rail-icon"><Icon name="file" /></span><span className="rail-label">成果</span></button>
        <button className={view === "设计体系" && !settingsOpen ? "rail-item active" : "rail-item"} aria-label="设计体系" title="设计体系" onClick={() => onView("设计体系")}><span className="rail-icon"><Icon name="panel" /></span><span className="rail-label">设计体系</span></button>
        <button className={view === "测试用例" && !settingsOpen ? "rail-item active" : "rail-item"} aria-label="测试用例" title="测试用例" onClick={() => onView("测试用例")}><span className="rail-icon"><Icon name="check" /></span><span className="rail-label">测试用例</span></button>
        <div className="rail-spacer" /><button className="rail-item rail-collapse" aria-label={projectSidebarCollapsed ? "展开项目侧栏" : "收起项目侧栏"} title={projectSidebarCollapsed ? "展开项目侧栏" : "收起项目侧栏"} aria-expanded={!projectSidebarCollapsed} onClick={onToggleProjectSidebar}><Icon name="panel" size={17}/></button>
        <button className={settingsOpen ? "rail-item active" : "rail-item"} aria-label="设置" title="设置" onClick={onSettings}><span className="rail-icon"><Icon name="settings" /></span><span className="rail-label">设置</span></button>
      </div>
      <div className="sidebar-main">
        <div className="brand">
          <span className="slash"><Icon name="slash" size={22}/></span>
          <div>Slash</div>
        </div>
        <button className="new" onClick={onNew}>
          <span className="new-icon"><Icon name="plus" size={17}/></span>
          <span>新会话</span>
          <small>{project?.name || "默认项目"}</small>
        </button>

        <nav aria-label="主导航">
          <div className="nav-group">
            <button
              className="nav-group-toggle"
              aria-expanded={productOpen}
              aria-controls="product-navigation"
              onClick={() => setProductOpen((value) => !value)}
            >
              <Icon name={productOpen ? "chevronDown" : "chevronRight"} size={14}/>更多工具
              <i>{productOpen ? "收起" : "展开"}</i>
            </button>
            <div
              id="product-navigation"
              className={`nav-group-items ${productOpen ? "open" : ""}`}
              inert={!productOpen || undefined}
            >
              {productNavigation.map(([item, icon]) => (
                <button
                  key={item}
                  className={view === item && !settingsOpen ? "active" : ""}
                  onClick={() => onView(item)}
                >
                  <Icon name={icon} size={16}/>
                  {item}
                </button>
              ))}
            </div>
          </div>
        </nav>


        <section className="project-tree" aria-label="项目与会话">
        <div className="project-tree-heading">
          <span>项目</span>
          {onProjectChange && (
            <button
              className="project-tree-add"
              aria-label="选择项目文件夹"
              title="选择项目文件夹"
              onClick={() => onProjectChange("__choose__")}
            >
              <Icon name="plus" size={16}/>
            </button>
          )}
        </div>
        <div className="project-tree-filter"><Icon name="search" size={15}/>
          <input
            className="conversation-search"
            aria-label="搜索会话"
            placeholder="搜索会话"
            value={conversationQuery}
            onChange={(event) => onConversationQuery(event.target.value)}
          />
        </div>
        <div className="project-list">
          {projectItems.map((item) => {
            const isCurrent = item.id === project?.id;
            const isOpen = expandedProjects[item.id] === true;
            const items = projectConversations(item);
            return (
              <section className={`project-group ${isCurrent ? "current" : ""}`} key={item.id}>
                <button
                  className={`project-row ${isCurrent ? "chosen" : ""}`}
                  aria-expanded={isOpen}
                  aria-current={isCurrent ? "true" : undefined}
                  onClick={() => toggleProject(item)}
                  onContextMenu={event => openProjectMenu(event,item)}
                  onKeyDown={event => { if((event.shiftKey && event.key==="F10") || event.key==="ContextMenu")openProjectMenu(event,item); }}
                  title={item.name}
                >
                  <span className="project-chevron" aria-hidden="true"><Icon name={isOpen ? "chevronDown" : "chevronRight"} size={13}/></span>
                  <span className="project-name">{item.name}</span>
                  {item.pinned && <span className="project-pin-mark" title="已置顶"><Icon name="pin" size={12}/></span>}
                  {item.isDefault && <small className="project-default-mark">默认</small>}
                  {!isCurrent && typeof item.conversationCount === "number" && (
                    <small className="project-count">{item.conversationCount}</small>
                  )}
                </button>
                {isOpen && (
                  <div className="project-conversations">
                    {projectFolderRequest && (
                      <div className="project-tools" aria-label={`${item.name}项目文件夹`}>
                        <ProjectFolderShortcut projectId={item.id} projectName={item.name} kind="resource" count={isCurrent?resources.length:undefined} busy={importBusy} call={projectFolderRequest} onError={onFolderError||(()=>{})} onDrop={(files,target)=>onImportFiles?.(files,'resource',target)}/>
                        <ProjectFolderShortcut projectId={item.id} projectName={item.name} kind="output" count={isCurrent?artifacts.length:undefined} busy={importBusy} call={projectFolderRequest} onError={onFolderError||(()=>{})} onDrop={(files,target)=>onImportFiles?.(files,'output',target)}/>
                      </div>
                    )}
                    {items.map((conversation) => (
                      <button
                        key={conversation.id}
                        className={conversationId === conversation.id && view === "会话" && !settingsOpen ? "chosen" : ""}
                        onClick={() => onConversation(conversation.id)}
                        onContextMenu={(event) => { event.preventDefault(); setMenu({x:event.clientX,y:event.clientY,kind:"conversation",id:conversation.id,label:conversation.title,archived:conversation.archived}); }}
                        title={conversation.title}
                      >
                        {conversation.title}
                      </button>
                    ))}
                    {!items.length && (
                      <small className="project-empty">{isCurrent ? "还没有会话" : "打开项目查看会话"}</small>
                    )}
                    {isCurrent && (
                      <div
                        className={`project-dropzone ${dragging ? "dragging" : ""}`}
                        onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
                        onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
                        onDragLeave={(event) => { if (event.currentTarget === event.target) setDragging(false); }}
                        onDrop={handleDrop}
                      >
                        <Icon name="plus" size={14}/>
                        <span>{importBusy ? "正在导入…" : "拖文件到这里导入项目"}</span>
                      </div>
                    )}
                  </div>
                )}
              </section>
            );
          })}
          {!projectItems.length && <small className="project-empty">选择一个文件夹开始</small>}
        </div>
      </section>


      </div>
      {menu && <div ref={menuRef} className="context-menu project-context-menu" style={menuPosition} onClick={(event) => event.stopPropagation()} role="menu" aria-label={menu.kind === "project" ? "项目菜单" : "会话菜单"} onKeyDown={event=>{if(event.key==="Escape"){event.preventDefault();event.stopPropagation();closeMenu();}if(event.key==="ArrowDown"||event.key==="ArrowUp"){event.preventDefault();const items=Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('button:not([disabled])')||[]),index=items.indexOf(document.activeElement as HTMLButtonElement);items[(index+(event.key==="ArrowDown"?1:-1)+items.length)%items.length]?.focus();}}}>
        <div className="context-menu-label">{menu.label}</div>
        {menu.kind === "conversation" ? <>
          <button onClick={() => { const next = window.prompt("重命名会话", menu.label); if (next?.trim()) onConversationRename?.(menu.id, next.trim()); setMenu(undefined); }}>重命名</button>
          <button onClick={() => { onConversationArchive?.(menu.id, !menu.archived); setMenu(undefined); }}>{menu.archived ? "取消归档" : "归档会话"}</button>
          <button onClick={() => { onConversation(menu.id); setMenu(undefined); }}>打开会话</button>
        </> : <>
          <button role="menuitem" onClick={() => { void switchProject(menu.id).then(() => onNew()); closeMenu(); }}><Icon name="plus" size={15}/>在此项目新建会话</button>
          <button role="menuitem" onClick={() => { setProjectDialog({id:menu.id,label:menu.label,kind:"rename"});setProjectName(menu.label);setProjectActionError("");setMenu(undefined); }}><Icon name="edit" size={15}/>重命名项目</button>
          <button role="menuitem" onClick={() => { void onProjectPin?.(menu.id,!projects.find(item=>item.id===menu.id)?.pinned);closeMenu(); }}><Icon name="pin" size={15}/>{projects.find(item=>item.id===menu.id)?.pinned ? "取消置顶" : "置顶项目"}</button>
          <div className="context-menu-divider" role="separator"/>
          <button role="menuitem" onClick={() => { void onProjectReveal?.(menu.id);closeMenu(); }}><Icon name="folder" size={15}/>打开文件夹</button>
          <button role="menuitem" onClick={() => { void onProjectCopyPath?.(menu.id);closeMenu(); }}><Icon name="copy" size={15}/>复制路径</button>
          <button role="menuitem" onClick={() => { void switchProject(menu.id).then(() => onProjectView?.("resource")); closeMenu(); }}><Icon name="book" size={15}/>打开资源</button>
          <button role="menuitem" onClick={() => { void switchProject(menu.id).then(() => onProjectView?.("artifact")); closeMenu(); }}><Icon name="file" size={15}/>打开成果</button>
          <div className="context-menu-divider" role="separator"/>
          <button role="menuitem" className="danger-text" disabled={Boolean(projects.find(item=>item.id===menu.id)?.activeRunCount)} title={projects.find(item=>item.id===menu.id)?.activeRunCount?"请先等待任务完成或停止任务":"仅从项目列表移除"} onClick={() => { setProjectDialog({id:menu.id,label:menu.label,kind:"remove"});setProjectActionError("");setMenu(undefined); }}><Icon name="trash" size={15}/>删除项目</button>
          {Boolean(projects.find(item=>item.id===menu.id)?.activeRunCount) && <small className="context-menu-note">项目任务运行中，暂不能删除</small>}
        </>}
      </div>}
      {projectDialog && <div className="project-dialog-layer"><form ref={dialogRef} className="project-dialog" role="dialog" aria-modal="true" aria-label={projectDialog.kind==="rename"?"重命名项目":"删除项目"} onKeyDown={event=>{if(event.key==="Escape"){event.preventDefault();event.stopPropagation();closeProjectDialog();}if(event.key==="Tab"){const items=Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('input,button:not([disabled])')||[]);if(event.shiftKey&&document.activeElement===items[0]){event.preventDefault();items.at(-1)?.focus();}else if(!event.shiftKey&&document.activeElement===items.at(-1)){event.preventDefault();items[0]?.focus();}}}} onSubmit={event=>{event.preventDefault();if(projectActionBusy)return;setProjectActionBusy(true);setProjectActionError("");const action=projectDialog.kind==="rename"?onProjectRename?.(projectDialog.id,projectName.trim()):onProjectRemove?.(projectDialog.id);void Promise.resolve(action).then(()=>{setProjectDialog(undefined);requestAnimationFrame(()=>menuTrigger.current?.focus());}).catch(reason=>setProjectActionError(reason instanceof Error?reason.message:String(reason))).finally(()=>setProjectActionBusy(false));}}>
        <div className="project-dialog-heading"><h2>{projectDialog.kind==="rename"?"重命名项目":"删除项目"}</h2><button type="button" aria-label="关闭项目操作" onClick={closeProjectDialog} disabled={projectActionBusy}><Icon name="close" size={17}/></button></div>
        {projectDialog.kind==="rename"?<label>项目名称<input aria-label="项目名称" value={projectName} maxLength={120} onChange={event=>setProjectName(event.target.value)} /></label>:<><p>从项目列表移除“{projectDialog.label}”？</p><p className="project-dialog-note">本地文件、会话和版本记录会保留。以后重新选择同一个文件夹，可以恢复这个项目。</p></>}
        {projectActionError&&<p role="alert" className="project-dialog-error">{projectActionError}</p>}
        <div className="project-dialog-actions"><button type="button" disabled={projectActionBusy} onClick={closeProjectDialog}>取消</button><button type="submit" className={projectDialog.kind==="remove"?"danger":"primary"} disabled={projectActionBusy||(projectDialog.kind==="rename"&&!projectName.trim())}>{projectActionBusy?"正在保存…":projectDialog.kind==="rename"?"保存名称":"从列表移除"}</button></div>
      </form></div>}
    </aside>
  );
}
