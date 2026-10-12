import {ComposerPopover} from './ComposerControls';
import {Icon} from './Icon';

type Project = {id:string;name:string;root?:string;path?:string};
export function FeatureProjectScope({project,projects,root,onChange,disabled=false}:{project:Project;projects:Project[];root:string;onChange:(id:string)=>void;disabled?:boolean}) {
  return <div className="feature-project-scope" aria-label="功能所属项目">
    <span><b>当前项目 · {project.name}</b><small title={root}>{root}</small></span>
    {disabled?<button disabled>正在切换项目…</button>:<ComposerPopover label="切换功能项目" text="切换项目" icon="folder">{close=><>
      <div className="composer-popover-heading">选择项目</div>
      <div role="listbox" aria-label="功能项目" className="composer-model-list">{projects.map(item=><button type="button" role="option" aria-selected={item.id===project.id} key={item.id} onClick={()=>{close();if(item.id!==project.id)onChange(item.id);}}><span><b>{item.name}</b><small>{item.root||item.path}</small></span>{item.id===project.id&&<Icon name="check" size={15}/>}</button>)}</div>
    </>}</ComposerPopover>}
  </div>;
}
