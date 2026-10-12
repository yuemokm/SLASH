import {useEffect,useRef,useState} from 'react';
import type {Run} from '../shared/types';
import {RUN_INPUT_LIMITS,RUN_INPUT_REASON_LABELS,type RunInputMutation,type RunInputRecord} from '../shared/run-inputs';

export function RunInputQueuePanel({run,active,onMutate,onRestore}:{run:Run;active:boolean;onMutate:(input:RunInputMutation)=>Promise<void>;onRestore:(text:string)=>void}){
 const [editing,setEditing]=useState<{id:string;revision:number;text:string}>();
 const [pending,setPending]=useState(''),[error,setError]=useState('');
 const [dismissed,setDismissed]=useState<string[]>([]);
 const mounted=useRef(true);useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
 const inputs=(run.inputs??[]).filter(input=>input.id===editing?.id||!dismissed.includes(input.id)&&(input.status==='queued'||input.status==='unknown'||input.status==='cancelled'&&!['RUN_INPUT_USER_CANCELLED','RUN_INPUT_CLEARED'].includes(input.reason??'')));
 const mutate=async(record:RunInputRecord,action:RunInputMutation['action'],text?:string)=>{
  if(pending)return;setPending(record.id);setError('');
  try{await onMutate({runId:run.id,inputId:record.id,expectedRevision:action==='edit'?editing!.revision:record.revision??0,action,...(action==='edit'?{text}: {})});if(mounted.current)setEditing(undefined);}
  catch(reason){if(mounted.current)setError(reason instanceof Error?reason.message:String(reason));}
  finally{if(mounted.current)setPending('');}
 };
 if(!inputs.length)return null;
 return <section className="composer-input-queue" aria-label="待处理消息">
  <div className="composer-input-queue-heading"><b>队列中 · {inputs.filter(input=>input.status==='queued').length}</b><small>本轮：{run.mode==='plan'?'研究方案':'执行'} · {({standard:'标准权限',accept_edits:'自动接受',full_access:'完全访问'})[run.permissionMode??'standard']}</small></div>
  <ol>{inputs.map(input=>{
   const editable=active&&input.status==='queued'&&!input.submittedAt;
   const isEditing=editing?.id===input.id;
   return <li key={input.id}>
    <div className="queue-message-main">
    {(input.status!=='queued'||input.submittedAt)&&<span className="queue-message-state">{input.status==='delivered'?'已送达；修改尚未发送':input.status==='unknown'?'送达待核对':input.status==='cancelled'?'未发送，原文已保留':'正在发送，等待确认'}</span>}
    {isEditing?<textarea aria-label="编辑队列消息" maxLength={RUN_INPUT_LIMITS.messageCharacters} value={editing.text} disabled={Boolean(pending)} onChange={event=>setEditing({...editing,text:event.target.value})}/>:<details className="queue-message-text"><summary><span>{input.text}</span><small>展开</small></summary><p>{input.text}</p></details>}
    {input.reason&&<small>{RUN_INPUT_REASON_LABELS[input.reason]??'请核对当前状态；不会自动重发。'}</small>}
    </div>
    <div className="queue-message-actions">
     {isEditing&&!editable&&<><small>消息已开始发送，这次修改尚未提交。</small><button type="button" onClick={()=>{onRestore(editing.text);setEditing(undefined);}}>保留修改到输入框</button></>}
     {editable?(isEditing?<><button type="button" disabled={Boolean(pending)||!editing.text.trim()} onClick={()=>void mutate(input,'edit',editing.text)}>保存修改</button><button type="button" disabled={Boolean(pending)} onClick={()=>setEditing(undefined)}>放弃修改</button></>:<><button type="button" disabled={Boolean(pending)} onClick={()=>{setError('');setEditing({id:input.id,revision:input.revision??0,text:input.text});}}>编辑</button><button type="button" disabled={Boolean(pending)} onClick={()=>void mutate(input,'cancel')}>取消</button><button type="button" disabled={Boolean(pending)} onClick={()=>void mutate(input,'send_now')}>立即发出</button></>):null}
     {['unknown','cancelled'].includes(input.status)&&<button type="button" disabled={Boolean(pending)} onClick={()=>onRestore(input.text)}>带回输入框</button>}
     {input.status==='cancelled'&&<button type="button" onClick={()=>setDismissed(value=>[...value,input.id])}>收起</button>}
    </div>
   </li>;
  })}</ol>
  {error&&<p className="queue-message-error" role="alert">{error}</p>}
  <small>任务结束后按顺序处理；立即发出将在当前操作结束后送达。</small>
 </section>;
}
