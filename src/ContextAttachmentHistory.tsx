import {FileIcon} from './Icon';
import {attachmentFormat} from '../shared/context-attachments';

export function ContextAttachmentHistory({attachments,ids}:{attachments:unknown;ids?:string[]}){
 const refs=Array.isArray(attachments)?attachments.filter(value=>value&&typeof value==='object'&&typeof value.id==='string'&&typeof value.name==='string') as Array<{id:string;name:string;kind?:string;truncated?:boolean;contextTruncated?:boolean;contextIncludedCharacters?:number;limitations?:string[]}>:[];
 if(!ids?.length)return null;
 return <div className="message-attachment-ref" aria-label="已发送的附件">{refs.length?refs.map(ref=><span className="context-history-file" key={ref.id} title={ref.limitations?.join(' ')}><FileIcon path={ref.name} size={14}/><span><span className="context-file-name">{ref.name}</span><small>{attachmentFormat(ref.name)} · {ref.kind==='document'?ref.contextTruncated||ref.truncated?`已读取${ref.contextIncludedCharacters?` ${ref.contextIncludedCharacters} 字` : ''} · 正文已截断`:'正文已读取':'图片已保存'} · 快照已保存</small></span></span>):`附件 · ${ids.length} 个 · 已保存为工作空间快照`}</div>;
}
