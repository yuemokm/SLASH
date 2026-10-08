import {useEffect,useState} from 'react';
import type {Request,Run} from '../shared/types';
import type {TaskAcceptanceView} from '../shared/task-acceptance';

export function TaskAcceptanceStatus({run,call}:{run:Run;call:(request:Request)=>Promise<unknown>}){
 const [view,setView]=useState<TaskAcceptanceView>(),[error,setError]=useState(''),[loading,setLoading]=useState(true);
 useEffect(()=>{let stopped=false;setView(undefined);setError('');setLoading(true);void call({type:'taskAcceptanceGet',runId:run.id}).then(value=>{if(!stopped){setView(value as TaskAcceptanceView|undefined);setLoading(false);}}).catch(cause=>{if(!stopped){setError(String(cause.message||cause));setLoading(false);}});return()=>{stopped=true;};},[run.id,run.updatedAt,run.acceptance?.reportId,call]);
 const report=view?.latestReport,failures=[...(report?.results??[]),...(report?.regression??[])].filter(item=>item.status!=='passed');
 return <div className="task-acceptance-status" aria-label="任务质量检查">
  <p><b>{report?.summary||(error?'当前检查记录未能核对':loading?'正在读取当前检查记录':run.acceptance?.summary||'成果尚未完成自动检查')}</b>{report&&<small> · {report.versionState==='current'?'对应当前版本':report.versionState==='stale'?'检查记录已过期':'当前版本无法核对'} · 自动修正 {run.acceptance?.repairRounds||0}/2 轮</small>}</p>
  {report&&<><p className="muted">{report.businessCoverage.reason}。保存草稿不会提升检查状态。</p>{report.versionReasons.length>0&&<ul>{report.versionReasons.map((reason,index)=><li key={index}>{reason}</li>)}</ul>}
   {report.automaticStatus&&<p className="muted">结构与交互自动检查：{report.automaticStatus==='passed'?'已通过具体检查':report.automaticStatus==='failed'?'存在未通过项':'尚未完整验证'}。模型内容审查单独记录。</p>}
   {report.contentReviewRequired&&<details open={Boolean(report.contentReview?.findings.length)}><summary>模型内容审查 · {report.contentReview?({reviewed:'未发现具体问题',issues_found:'提出候选问题',unverified:'尚未完整验证',failed:'调用未完成'} as const)[report.contentReview.status]:'尚未执行'}</summary>
    {report.contentReview?<><p className="muted">{report.contentReview.reviewer.modelId} · {report.contentReview.versionState==='current'?'引用对应当前版本':'引用版本已失效或无法核对'} · {report.contentReview.durationMs==='unknown'?'耗时未提供':`${(report.contentReview.durationMs/1000).toFixed(1)} 秒`}。模型解释仍需核对，引用存在不证明业务结论正确。</p>
     {report.contentReview.requestedOutputTokens&&<p className="muted">正文请求预算 {report.contentReview.requestedOutputTokens} tokens{report.contentReview.thinkingLevel?` · 思考档位 ${report.contentReview.thinkingLevel}`:''}。Pi 可能按协议另加思考预算，实际消耗已单独记录。</p>}
     {report.contentReview.errorMessage&&<p role="status" className="muted">模型调用诊断：{report.contentReview.errorMessage}。调用未完整结束，不能据此判断没有问题。</p>}
     {report.contentReview.configuredMaxRetries!==undefined&&<p className="muted">传输失败最多重试 {report.contentReview.configuredMaxRetries} 次 · 实际重试次数未提供 · 结束原因 {report.contentReview.stopReason}。格式错误或长度截断不会因此重试。</p>}
     {report.contentReview.rawResponseHash&&report.contentReview.completion!=='completed'&&<p className="muted">已收到响应 {report.contentReview.rawResponseCharacters} 字符 · 响应哈希 {report.contentReview.rawResponseHash.slice(0,12)}。仅保留诊断身份，不作为已完成的审查意见。</p>}
     {report.contentReview.findings.map(finding=><div key={finding.id}><p><b>{finding.explanation}</b><small> · 候选意见 · {finding.confidence==='high'?'高':finding.confidence==='medium'?'中':'低'}置信</small></p>{[...finding.artifactBindings.map(binding=>({...binding,kind:'成果'})),...finding.sourceBindings.map(binding=>({...binding,kind:'来源'})),...finding.requestBindings.map(binding=>({...binding,kind:'用户要求'}))].map((binding,index)=><blockquote key={index}><small>{binding.kind} · {binding.locator||binding.id} · 第 {binding.startLine} 行</small><p>{binding.quote}</p></blockquote>)}<p className="muted">{finding.repairConstraint}</p></div>)}
     {(report.contentReview.coverageLimits.length>0||report.contentReview.diagnostics.length>0)&&<ul>{[...report.contentReview.coverageLimits,...report.contentReview.diagnostics].map((limit,index)=><li key={index}>{limit}</li>)}</ul>}
     {report.contentReview.invalidFindings.length>0&&<p className="muted">有 {report.contentReview.invalidFindings.length} 项意见无法绑定实际原句，保持未验证，未用于自动修正。</p>}
    </>:<p className="muted">{report.contentReviewNotice||'内容语义尚未审查；结构检查通过不代表业务已经核对。'}</p>}
    {report.contentReviewNotice&&report.contentReview&&<p className="muted">{report.contentReviewNotice}</p>}
   </details>}
   <details open={failures.length>0}><summary>具体问题与未验证项 · {failures.length}</summary>{failures.length?<ul>{failures.map((item,index)=><li key={`${item.criterionId}-${index}`}><b>{({failed:'未通过',unverified:'未验证',needs_human:'需人工判断',passed:'通过'} as Record<string,string>)[item.status]}</b> · {item.reason}{item.baselineId&&<small> · 原有用例回归</small>}{item.evidence.flatMap(e=>e.quality?.issues.filter(i=>i.severity==='blocking')??[]).map((issue,i)=><p className="muted" key={i}>{issue.line?`第 ${issue.line} 行：`:''}{issue.message}</p>)}</li>)}</ul>:<p className="muted">已执行的具体检查未发现失败；完整业务和视觉质量仍需核对。</p>}</details>
   <details><summary>成果与来源版本 · {report.targets.length} 份成果 · {report.sources.length} 份来源</summary><ul>{report.targets.map(o=><li key={o.id}>{o.target.path} · {o.target.source==='draft'?'尚未保存草稿':'正式成果'}<small> · {o.target.contentHash.slice(0,12)}</small></li>)}{report.sources.map((s,index)=><li key={index}>{s.path} · {s.truncated?'部分正文':'来源回执'}<small> · {s.contentHash.slice(0,12)}</small></li>)}</ul></details>
   <details><summary>原有用例回归 · {report.regression.length}</summary>{report.regression.length?<ul>{report.regression.map((r,index)=><li key={index}>{r.reason} · {r.status==='passed'?'具体断言通过':r.status==='failed'?'未通过':'尚未完整验证'}</li>)}</ul>:<p className="muted">本任务没有可冻结的已有关键用例；不表示旧流程已验证。</p>}</details>
   {report.businessCoverage.assumptionIds.length>0&&<p className="muted">仍有 {report.businessCoverage.assumptionIds.length} 项假设待核对。</p>}
  </>}
  {error&&<p role="status" className="muted">检查记录暂不可读取：{error}</p>}
 </div>;
}
