import {useEffect,useRef,useState} from 'react';
import type {TaskDeliveryItem,TaskDeliveryView} from '../shared/task-delivery';
import type {Request} from '../shared/types';

type Action=TaskDeliveryItem['allowedActions'][number];
type Draft={action:''|Action;note:string;locators:string};
const blank:Draft={action:'',note:'',locators:''};
const actionLabels:Record<Action,string>={confirm:'已核对符合要求',dismiss:'不采纳此候选意见',accept_limit:'接受此项非关键限制'};
const statusLabels={verified:'已完成交付核对',accepted_with_limits:'已接受非关键限制',needs_review:'仍需逐项核对',blocked:'存在交付阻断项',not_applicable:'当前成果不需要交付核对'};

/** Human evidence stays separate from the automatic report. No action here exports or publishes. */
export function TaskDeliveryReviewPanel({runId,reportId,call}:{runId:string;reportId:string;call:(request:Request)=>Promise<unknown>}){
 const [view,setView]=useState<TaskDeliveryView>(),[loading,setLoading]=useState(true),[busy,setBusy]=useState(''),[error,setError]=useState(''),[notice,setNotice]=useState(''),[revision,setRevision]=useState(0),[drafts,setDrafts]=useState<Record<string,Draft>>({}),[editing,setEditing]=useState<Record<string,boolean>>({});
 const epoch=useRef(0),identity=`${runId}\0${reportId}`,current=useRef(identity);current.current=identity;
 const readView=(value:unknown)=>{const next=value as TaskDeliveryView;if(!next||next.schemaVersion!==1||next.runId!==runId||next.reportId!==reportId||!Array.isArray(next.items)||!next.bindingHash)throw Error('交付核对记录不属于当前成果');return next;};
 useEffect(()=>{const generation=++epoch.current,scope=identity;let stopped=false;setView(undefined);setLoading(true);setBusy('');setError('');setNotice('');setDrafts({});setEditing({});void call({type:'taskDeliveryGet',runId,reportId}).then(value=>{if(stopped||generation!==epoch.current||scope!==current.current)return;setView(readView(value));setLoading(false);}).catch(cause=>{if(!stopped&&generation===epoch.current&&scope===current.current){setError(String(cause.message||cause));setLoading(false);}});return()=>{stopped=true;epoch.current++;};},[call,identity,revision]);
 const change=(id:string,patch:Partial<Draft>)=>setDrafts(previous=>({...previous,[id]:{...(previous[id]??blank),...patch}}));
 const submit=async(item:TaskDeliveryItem)=>{
  const draft=drafts[item.id]??blank,locators=draft.locators.split(/\r?\n/).map(value=>value.trim()).filter(Boolean);
  if(!view||busy||!draft.action||!item.allowedActions.includes(draft.action)||!draft.note.trim()||!locators.length)return;
  const generation=epoch.current,scope=identity;setBusy(item.id);setError('');setNotice('');
  try{const next=await call({type:'taskDeliveryReview',runId,reportId,expectedBindingHash:view.bindingHash,decisions:[{itemId:item.id,action:draft.action,note:draft.note.trim(),evidence:{...item.requiredEvidence,locators,citations:draft.action==='dismiss'?(item.originalEvidence??[]):[]}}]});if(generation!==epoch.current||scope!==current.current)return;setView(readView(next));setEditing(previous=>({...previous,[item.id]:false}));setDrafts(previous=>{const updated={...previous};delete updated[item.id];return updated;});setNotice('此项核对已保存。完成剩余项目后，请单独选择导出或发布。');}
  catch(cause){if(generation===epoch.current&&scope===current.current){setError(cause instanceof Error?cause.message:String(cause));setView(undefined);}}
  finally{if(generation===epoch.current&&scope===current.current)setBusy('');}
 };
 return <section className="run-recovery task-delivery-review" aria-label="正式交付逐项核对" aria-busy={loading||Boolean(busy)}>
  <p><b>正式交付核对 · {view?statusLabels[view.status]:loading?'正在读取':'暂不可用'}</b></p>
  <p className="muted">请逐项对照要求、来源和实际成果。人工核对会单独保存；保存草稿或核对记录不会自动导出、发布。</p>
  {error&&<><p role="alert">核对记录暂不可用：{error}</p><button type="button" disabled={Boolean(busy)} onClick={()=>setRevision(value=>value+1)}>重新读取交付核对</button></>}
  {view&&<p className="muted">待核对 {view.items.filter(item=>item.status==='needs_review'||item.status==='unknown').length} 项 · 阻断 {view.items.filter(item=>item.status==='blocked').length} 项</p>}
  {view?.notice&&<p className="muted">{view.notice}</p>}
  {view?.items.map(item=>{const draft=drafts[item.id]??blank;return <article className="run-recovery-operation" key={item.id}>
   <b>{item.label}</b><p>{item.detail}</p><small>{item.critical?'关键要求':'非关键项目'} · {item.status==='passed'?'已核对':item.status==='blocked'?'存在阻断':item.status==='unknown'?'尚无法判断':'待核对'}</small>
   {item.originalEvidence?.map((citation,index)=><blockquote key={index}><small>{citation.kind==='screenshot'?'截图位置':'原文位置'}：{citation.locator||'位置未提供'}</small><p>{citation.quote}</p></blockquote>)}
   {item.decision&&<p className="run-recovery-evidence">已保存：{actionLabels[item.decision.action]} · {item.decision.note}<br/>{item.decision.evidence.locators.join('；')}</p>}
   {item.decision&&item.allowedActions.length>0&&!editing[item.id]&&<button type="button" disabled={Boolean(busy)} onClick={()=>setEditing(previous=>({...previous,[item.id]:true}))}>重新核对此项</button>}
   {item.allowedActions.length>0&&(!item.decision||editing[item.id])&&<form onSubmit={event=>{event.preventDefault();void submit(item);}}><fieldset disabled={loading||Boolean(busy)}>
    <legend>核对此项</legend>
    <label>核对动作<select value={draft.action} onChange={event=>change(item.id,{action:event.target.value as Draft['action']})}><option value="">请选择本项结论</option>{item.allowedActions.map(action=><option key={action} value={action}>{actionLabels[action]}</option>)}</select></label>
    <label>核对结论 / 不采纳理由<textarea rows={2} maxLength={10000} value={draft.note} onChange={event=>change(item.id,{note:event.target.value})} placeholder="说明此项是否符合要求；不采纳候选意见时说明原因。"/></label>
    <label>实际核对位置 / 依据<textarea rows={2} maxLength={2000} value={draft.locators} onChange={event=>change(item.id,{locators:event.target.value})} placeholder="例如：来源表格的规则行、成果的具体段落、已执行的页面与操作结果。每行一处。"/></label>
    <button type="submit" disabled={!draft.action||!draft.note.trim()||!draft.locators.trim()}>{busy===item.id?'正在保存…':'保存本项核对'}</button>
   </fieldset></form>}
  </article>;})}
  {notice&&<p role="status">{notice}</p>}
 </section>;
}
