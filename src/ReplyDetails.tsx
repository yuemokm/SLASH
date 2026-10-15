import {useId,useState} from 'react';
import type {Message,Request,Run} from '../shared/types';
import {MessageFooter} from './MessageFooter';
import {Icon} from './Icon';
import './reply-details.css';
import {TaskAcceptanceStatus} from './TaskAcceptanceStatus';

/** Reply actions belong to the text; execution belongs to its Run step above it. */
export function ReplyDetails({message,run,streaming=false,call}:{message:Message;run?:Run;streaming?:boolean;call:(request:Request)=>Promise<unknown>}){
 const id=useId(),[qualityOpen,setQualityOpen]=useState(false);
 return <div className="reply-details" data-run-id={run?.id||''}>
  <MessageFooter message={message} run={run} streaming={streaming} actions={<>
   {run?.acceptance&&run.acceptance.outputCount>0&&<button type="button" aria-expanded={qualityOpen} aria-controls={`${id}-quality`} onClick={()=>setQualityOpen(v=>!v)}><Icon name="check" size={14}/>质量检查{run.acceptance.status==='failed'?' · 未通过':run.acceptance.status==='passed'?' · 自动检查通过':' · 尚未完整验证'}</button>}
  </>}/>
  {qualityOpen&&run?.acceptance&&<section id={`${id}-quality`} className="reply-detail-panel" aria-label="此任务质量检查"><TaskAcceptanceStatus run={run} call={call}/></section>}
 </div>;
}
