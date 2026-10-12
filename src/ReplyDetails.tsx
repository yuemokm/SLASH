import {useEffect,useId,useState,type ReactNode} from 'react';
import type {Message,Request,Run,RunCheckpoint} from '../shared/types';
import {MessageFooter} from './MessageFooter';
import {Icon} from './Icon';
import './reply-details.css';
import {TaskAcceptanceStatus} from './TaskAcceptanceStatus';

export type ReplyPanelState={execution:boolean;records:boolean};
export function ReplyDetails({message,run,streaming=false,state,onToggle,call,execution,records}:{message:Message;run?:Run;streaming?:boolean;state:ReplyPanelState;onToggle:(panel:keyof ReplyPanelState)=>void;call:(request:Request)=>Promise<unknown>;execution:(checkpoint?:RunCheckpoint)=>ReactNode;records:ReactNode}){
 const id=useId(),[visited,setVisited]=useState({execution:false,records:false}),[checkpoint,setCheckpoint]=useState<RunCheckpoint>(),[checkpointError,setCheckpointError]=useState(''),[qualityOpen,setQualityOpen]=useState(false);
 useEffect(()=>{setVisited(previous=>({execution:previous.execution||state.execution,records:previous.records||state.records}));},[state.execution,state.records]);
 useEffect(()=>{let stopped=false;if(!run||!state.execution)return;setCheckpointError('');void call({type:'runCheckpoint',runId:run.id}).then(value=>{if(!stopped)setCheckpoint(value as RunCheckpoint);}).catch(error=>{if(!stopped)setCheckpointError(String(error.message||error));});return()=>{stopped=true;};},[call,run?.id,run?.updatedAt,run?.status,state.execution]);
 const attention=run?.mode==='plan'&&run.proposal?.status==='pending'?'方案待确认':run?.status==='waiting_user'?'等待授权确认':run?.resumable?'任务可继续':run?.error?'任务需要处理':streaming&&run?.runtimeStatus?.activity==='retry_wait'?`模型重试 · 第 ${run.runtimeStatus.retry?.attempt??1} 次`:undefined;
 return <div className="reply-details" data-run-id={run?.id||''}>
  <MessageFooter message={message} run={run} streaming={streaming} actions={<>
   <button type="button" aria-expanded={state.execution} aria-controls={`${id}-execution`} onClick={()=>onToggle('execution')}><Icon name="clock" size={14}/>生成与执行</button>
   <button type="button" aria-expanded={state.records} aria-controls={`${id}-records`} onClick={()=>onToggle('records')}><Icon name="book" size={14}/>工作记录与项目历史</button>
   {run?.acceptance&&run.acceptance.outputCount>0&&<button type="button" aria-expanded={qualityOpen} aria-controls={`${id}-quality`} onClick={()=>setQualityOpen(v=>!v)}><Icon name="check" size={14}/>质量检查{run.acceptance.status==='failed'?' · 未通过':run.acceptance.status==='passed'?' · 自动检查通过':' · 尚未完整验证'}</button>}
  </>}/>
  {attention&&!state.execution&&<button type="button" className="reply-action-notice" onClick={()=>onToggle('execution')}>{attention} · 查看处理入口 <Icon name="chevronRight" size={13}/></button>}
  {qualityOpen&&run?.acceptance&&<section id={`${id}-quality`} className="reply-detail-panel" aria-label="此任务质量检查"><TaskAcceptanceStatus run={run} call={call}/></section>}
  {(visited.execution||state.execution)&&<section hidden={!state.execution} id={`${id}-execution`} className="reply-detail-panel" aria-label="此回复的生成与执行"><div className="reply-panel-heading"><b>生成与执行</b><small>{run?`关联任务 ${run.id.slice(0,8)}`:'历史回复未保存任务关联'}</small></div>{run?execution(checkpoint):<p className="muted">此回复没有关联的运行记录。</p>}{checkpointError&&<p className="muted" role="status">执行检查点暂不可用：{checkpointError}</p>}</section>}
  {(visited.records||state.records)&&<section hidden={!state.records} id={`${id}-records`} className="reply-detail-panel" aria-label="工作记录与项目历史"><div className="reply-panel-heading"><b>工作记录与项目历史</b><small>当前会话相关记录；项目历史通过下方入口查看。</small></div>{records}</section>}
 </div>;
}
