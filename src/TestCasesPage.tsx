import {useEffect,useState,type ReactNode} from 'react';
import type {Change,FileRef,Mount,Request} from '../shared/types';
import {Icon} from './Icon';
import {testCaseListEntries} from './test-cases-list';

type Props={projectName:string;projectScope?:ReactNode;mounts:Mount[];changes:Change[];call:(request:Request)=>Promise<unknown>;onOpen:(file:FileRef)=>void;onDraft:(change:Change)=>void;onCreate:()=>void;onError:(message:string)=>void};
export function TestCasesPage({projectName,projectScope,mounts,changes,call,onOpen,onDraft,onCreate,onError}:Props) {
  const [files,setFiles]=useState<FileRef[]>([]),[query,setQuery]=useState(''),[loading,setLoading]=useState(true),[failed,setFailed]=useState(false),[revision,setRevision]=useState(0);
  const mountSignature=JSON.stringify(mounts.map(mount=>[mount.id,mount.enabled]));
  useEffect(()=>{
    let stopped=false;setLoading(true);setFailed(false);setFiles([]);
    // A dedicated query cannot inherit a search from Resources or hide unsaved drafts.
    void call({type:'files',query:'.testcases.json'}).then(value=>{if(!stopped)setFiles(value as FileRef[]);}).catch(error=>{if(!stopped){setFailed(true);onError(error instanceof Error?error.message:String(error));}}).finally(()=>{if(!stopped)setLoading(false);});
    return()=>{stopped=true;};
  },[call,mountSignature,revision,onError]);
  const all=testCaseListEntries(files,changes,mounts),lower=query.trim().toLowerCase(),entries=all.filter(entry=>entry.file.path.toLowerCase().includes(lower));
  return <section className="test-cases-page" aria-label="项目测试用例">
    <div className="page-heading"><div><h1>测试用例</h1><p className="muted">已保存的用例和待处理草稿 · {all.length} 项</p></div><div className="knowledge-actions"><button disabled={loading} onClick={()=>setRevision(value=>value+1)}>刷新</button><button className="primary" onClick={onCreate}><Icon name="plus" size={16}/>创建测试用例</button></div></div>
    <div className="toolbar test-cases-toolbar"><label className="file-search"><Icon name="search" size={17}/><input aria-label="筛选测试用例" placeholder="按文件名或路径筛选" value={query} onChange={event=>setQuery(event.target.value)}/></label>{projectScope||<small className="muted">{projectName}</small>}</div>
    {loading&&<p role="status" className="muted">正在读取当前项目用例…</p>}
    {failed&&<p role="status">已保存用例读取失败，请刷新重试；下方仍可查看已加载的草稿。</p>}
    <div className="file-list">{entries.map(({key,file,change})=><div className="file-row" key={key}>
      <span className="file-icon"><Icon name="check"/></span><div><b title={file.path}>{file.path.split(/[\\/]/).pop()?.replace(/\.testcases\.json$/i,'')}</b><small><span className="file-project-label">{projectName}</span> · {mounts.find(mount=>mount.id===file.mountId)?.name} / {file.path}</small><small>{change?change.status==='conflict'?'文件冲突 · 尚未保存，需回会话处理':'草稿 · 尚未写入项目':'已保存到项目'} · 未执行{change?` · ${new Date(change.createdAt).toLocaleString()}`:''}</small></div>
      <button onClick={()=>change?onDraft(change):onOpen(file)}>{change?'查看草稿':'阅读用例'}</button>
    </div>)}</div>
    {!loading&&!failed&&!entries.length&&<p className="empty" role="status">{lower?'没有匹配的测试用例，请调整筛选。':'当前项目还没有测试用例。点击“创建测试用例”，在会话中选择 PRD、原型或规则资料后生成。'}</p>}
    <details className="test-cases-scope muted"><summary>列表范围与使用说明</summary><p>仅显示当前项目已授权的测试用例与待处理草稿。创建和修改从会话发起，生成后仍需人工核对与执行。</p><p>识别 .testcases.json 用例文件；沿用已有目录扫描上限：12 层、3000 个匹配文件。外部变更后可刷新；超出范围的文件仍可从资源目录打开。</p></details>
  </section>;
}
