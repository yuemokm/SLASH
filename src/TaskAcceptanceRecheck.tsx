import {useEffect,useRef,useState} from 'react';
import type {Request,Run} from '../shared/types';
import type {TaskAcceptanceView} from '../shared/task-acceptance';

export function TaskAcceptanceRecheck({run,view,call,onChanged}:{run:Run;view:TaskAcceptanceView;call:(request:Request)=>Promise<unknown>;onChanged:()=>void}){
 const report=view.latestReport,identity=`${view.contract.workspaceId}:${run.id}:${view.contract.contractHash}:${report?.id??''}`;
 const current=useRef(identity);current.current=identity;
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 useEffect(()=>{current.current=identity;setBusy(false);setError('');setNotice('');return()=>{current.current='';};},[identity]);
 const stopped=['succeeded','failed','interrupted','cancelled'].includes(run.status);
 const recheck=async()=>{
  if(busy||!stopped)return;const captured=identity;setBusy(true);setError('');setNotice('');
  try{await call({type:'taskAcceptanceRecheck',runId:run.id,expectedContractHash:view.contract.contractHash,expectedReportId:report?.id??null});if(current.current!==captured)return;setNotice('自动检查已更新。业务与视觉仍需逐项核对；未决操作仍需单独核对。');onChanged();}
  catch(cause){if(current.current===captured)setError(cause instanceof Error?cause.message:'自动检查暂时无法执行，请刷新当前报告后重试。');}
  finally{if(current.current===captured)setBusy(false);}
 };
 return <div className="task-acceptance-recheck">
  <button type="button" disabled={busy||!stopped} onClick={()=>void recheck()}>{busy?'正在运行自动检查…':'重新运行自动检查'}</button>
  <p className="muted">只检查现有任务的当前版本，不重新生成成果、不调用付费模型。新的检查报告不会自动确认业务、视觉或未决操作。</p>
  {!stopped&&<p role="status" className="muted">任务仍在执行，结束后可重新检查。</p>}
  {notice&&<p role="status">{notice}</p>}
  {error&&<><p role="alert">{error}</p><button type="button" onClick={onChanged}>刷新当前检查记录</button></>}
 </div>;
}
