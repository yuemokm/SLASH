import {useEffect,useRef,useState} from 'react';
import type {TaskAcceptanceView} from '../shared/task-acceptance';
import type {Request} from '../shared/types';

export function TaskOptionalScopePanel({runId,view,call,onSaved}:{runId:string;view:TaskAcceptanceView;call:(request:Request)=>Promise<unknown>;onSaved:()=>void}){
 const [selected,setSelected]=useState<string[]>([]),[note,setNote]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const identity=`${runId}\0${view.contract.contractHash}`,current=useRef(identity);current.current=identity;
 useEffect(()=>{setSelected([]);setNote('');setBusy(false);setError('');},[identity]);
 useEffect(()=>()=>{current.current='';},[]);
 const candidates=view.contract.criteria.filter(item=>view.optionalScope?.candidateCriterionIds.includes(item.id));
 if(!candidates.length)return null;
 const submit=async()=>{if(busy||!selected.length||!note.trim())return;const scope=identity;setBusy(true);setError('');try{await call({type:'taskAcceptanceOptional',runId,expectedContractHash:view.contract.contractHash,criterionIds:selected,note:note.trim()});if(scope!==current.current)return;setSelected([]);setNote('');onSaved();}catch(cause){if(scope===current.current)setError(cause instanceof Error?cause.message:String(cause));}finally{if(scope===current.current)setBusy(false);}};
 return <details className="task-optional-scope"><summary>补充检查的交付范围</summary><p className="muted">仅可调整以下补充检查。确认非关键后，仍需在当前版本的交付核对中逐项接受其限制；必检规则和失败项不能跳过。</p><form onSubmit={event=>{event.preventDefault();void submit();}}><fieldset disabled={busy}><legend>选择确认为非关键的补充检查</legend>{candidates.map(item=><label key={item.id}><input type="checkbox" checked={selected.includes(item.id)} onChange={event=>setSelected(previous=>event.target.checked?[...previous,item.id]:previous.filter(id=>id!==item.id))}/>{item.text}</label>)}<label>范围调整原因<textarea value={note} onChange={event=>setNote(event.target.value)} maxLength={10000} rows={2} placeholder="说明为什么这些补充检查不影响本次交付的关键要求。"/></label><button type="submit" disabled={!selected.length||!note.trim()}>{busy?'正在确认…':'确认这些补充检查为非关键'}</button></fieldset></form>{error&&<p role="alert">{error}</p>}</details>;
}
