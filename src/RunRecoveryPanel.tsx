import {useEffect,useRef,useState} from 'react';
import {runRecoveryViewSchema,type RecoveryRecord,type RunRecoveryView} from '../shared/run-recovery';
import type {Request,Run} from '../shared/types';
import './run-recovery.css';

type Draft={resolution:''|'verified_done'|'verified_not_done';evidence:string};
const emptyDraft:Draft={resolution:'',evidence:''};
const pending=(record:RecoveryRecord)=>record.resolution==='pending'&&record.dispatch==='may_have_run'&&record.effect!=='read';
const errorText=(cause:unknown)=>cause instanceof Error?cause.message:String(cause);

/** Explicit human reconciliation. Loading/errors keep resume closed; the host
 * still verifies identity, permissions, original scope and the context token. */
export function RunRecoveryPanel({run,workspaceRoot,call,onResume}:{run:Run;workspaceRoot:string;call:(request:Request)=>Promise<unknown>;onResume?:()=>void}){
 const [view,setView]=useState<RunRecoveryView>(),[loading,setLoading]=useState(true),[busy,setBusy]=useState(''),[error,setError]=useState(''),[notice,setNotice]=useState(''),[drafts,setDrafts]=useState<Record<string,Draft>>({}),[revision,setRevision]=useState(0);
 const epoch=useRef(0),identity=`${workspaceRoot}\0${run.id}`,currentIdentity=useRef(identity);currentIdentity.current=identity;
 useEffect(()=>{
  const generation=++epoch.current,scope=identity;let stopped=false;
  setView(undefined);setLoading(true);setBusy('');setError('');setNotice('');setDrafts({});
  void call({type:'runRecoveryGet',runId:run.id}).then(value=>{if(stopped||generation!==epoch.current||scope!==currentIdentity.current)return;const next=runRecoveryViewSchema.parse(value);if(next.runId!==run.id)throw Error('核对记录不属于当前任务');setView(next);setLoading(false);}).catch(cause=>{if(!stopped&&generation===epoch.current&&scope===currentIdentity.current){setError(errorText(cause));setLoading(false);}});
  return()=>{stopped=true;epoch.current++;};
 },[call,identity,run.updatedAt,run.status,revision]);
 const submit=async(record:RecoveryRecord)=>{
  const draft=drafts[record.operationId]??emptyDraft;if(!view||!draft.resolution||draft.evidence.trim().length<8||busy)return;
  const generation=epoch.current,scope=identity;setBusy(record.operationId);setError('');setNotice('');
  try{
   const result=await call({type:'runRecoveryReconcile',runId:run.id,operationId:record.operationId,expectedUpdatedAt:record.updatedAt,contextToken:view.contextToken,resolution:draft.resolution,evidence:draft.evidence.trim()}) as {view:unknown};
   if(generation!==epoch.current||scope!==currentIdentity.current)return;
   const next=runRecoveryViewSchema.parse(result.view);if(next.runId!==run.id)throw Error('核对记录不属于当前任务');setView(next);setDrafts(previous=>{const nextDrafts={...previous};delete nextDrafts[record.operationId];return nextDrafts;});setNotice('核对已保存。确认剩余操作后，可单独继续任务。');
  }catch(cause){if(generation===epoch.current&&scope===currentIdentity.current){setError(errorText(cause));setView(undefined);}}
  finally{if(generation===epoch.current&&scope===currentIdentity.current)setBusy('');}
 };
 const records=view?.records.filter(record=>pending(record)||record.resolvedBy==='user')??[];
 const change=(operationId:string,patch:Partial<Draft>)=>setDrafts(previous=>({...previous,[operationId]:{...(previous[operationId]??emptyDraft),...patch}}));
 return <section className="run-recovery" aria-label="停止任务的结果核对" aria-busy={loading||Boolean(busy)}>
  {loading&&<p className="muted" role="status">正在核对任务恢复条件…</p>}
  {error&&<><p className="run-plan-error" role="alert">核对记录暂不可用：{error}</p><button type="button" onClick={()=>setRevision(value=>value+1)} disabled={Boolean(busy)}>重新查看核对记录</button></>}
  {view?.blocked&&<p>任务停止前有操作可能已执行。请核对实际结果，避免重复操作。结果不确定或只完成一部分时，先保留待核对。</p>}
  {records.map(record=>{const draft=drafts[record.operationId]??emptyDraft;return <article className="run-recovery-operation" key={record.operationId}>
   <b>{record.summary||`${record.tool} · 操作 ${record.operationId.slice(0,8)}`}</b>
   <small>记录时间：{new Date(record.updatedAt).toLocaleString()}</small>
   {record.observedProcessingCopy&&<small>当前处理副本版本：{record.observedProcessingCopy.contentHash.slice(0,12)}{record.processingCopy?.contentHash!==record.observedProcessingCopy.contentHash?' · 已不同于执行前版本，请对照实际文件核对':''}</small>}
   {pending(record)?<form onSubmit={event=>{event.preventDefault();void submit(record);}}>
    <fieldset disabled={Boolean(busy)||loading}>
     <legend>确认此操作的实际结果</legend>
     <label>核对结果<select value={draft.resolution} onChange={event=>change(record.operationId,{resolution:event.target.value as Draft['resolution']})}><option value="">请选择确认结果</option><option value="verified_done">已确认操作完成</option><option value="verified_not_done">已确认未执行且未产生修改</option></select></label>
     <label>核对依据<textarea value={draft.evidence} maxLength={5000} minLength={8} rows={3} onChange={event=>change(record.operationId,{evidence:event.target.value})} placeholder="例如：在目标文件查看修改内容，确认已保存；或查询对应系统的操作记录。"/><small>至少 8 个字符，请说明查看了什么及确认结果。</small></label>
     <button type="submit" disabled={!draft.resolution||draft.evidence.trim().length<8}>{busy===record.operationId?'正在保存核对…':'保存此操作的核对'}</button>
    </fieldset>
   </form>:<><p className="muted">{record.resolution==='verified_done'?'已确认完成':'已确认未执行且未产生修改'}</p>{record.evidenceRefs.filter(value=>value.startsWith('user:')).map((value,index)=><p className="run-recovery-evidence" key={index}>{value.slice(5)}</p>)}</>}
  </article>;})}
  {notice&&<p role="status">{notice}</p>}
  {onResume&&<button type="button" className="primary" disabled={loading||Boolean(busy)||!view||view.blocked} onClick={onResume}>{run.interruptionReason==='model_output_limit'?'继续生成':'继续任务'}</button>}
 </section>;
}
