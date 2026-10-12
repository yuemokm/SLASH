import React,{useState} from 'react';
import {parseTestCaseSuite,TEST_CASE_NOTICE,testCaseTypeLabels} from '../shared/test-cases';

export function TestCasesPreview({content,onRevealSource}:{content:string;onRevealSource?:(source:{mountId:string;path:string})=>Promise<unknown>}){
 const [sourceError,setSourceError]=useState('');
 let suite;try{suite=parseTestCaseSuite(content);}catch(error){return <p role="alert" className="test-cases-error">{error instanceof Error?error.message:String(error)}。请从会话修改；无效用例不能保存或导出。</p>;}
 return <section className="test-cases-preview" aria-label="手工测试用例预览">
  <h1>{suite.title}</h1><p className="reader-notice">{TEST_CASE_NOTICE}</p><p><strong>{suite.cases.length} 条用例 · 已生成 · 全部未执行</strong></p><p>范围：{suite.scope}</p>
  {sourceError&&<p role="status">来源暂时无法定位：{sourceError}</p>}
  {!!suite.pendingQuestions.length&&<details open><summary>整体待确认（{suite.pendingQuestions.length}）</summary><ul>{suite.pendingQuestions.map((q,i)=><li key={i}>{q}</li>)}</ul></details>}
  {suite.cases.map(c=><article key={c.id} className="manual-test-case" data-case-id={c.id}>
   <h2>{c.id} · {c.title}</h2><p className="manual-test-meta">{c.module} · {c.priority} · {testCaseTypeLabels[c.type]} · 未执行</p>
   <h3>前置条件</h3>{c.preconditions.length?<ul>{c.preconditions.map((v,i)=><li key={i}>{v}</li>)}</ul>:<p>无</p>}
   {!!c.testData.length&&<><h3>测试数据</h3><ul>{c.testData.map((v,i)=><li key={i}>{v}</li>)}</ul></>}
   <table><thead><tr><th>步骤</th><th>操作</th><th>预期结果</th></tr></thead><tbody>{c.steps.map((s,i)=><tr key={i}><td>{i+1}</td><td>{s.action}</td><td>{s.expected}</td></tr>)}</tbody></table>
   <p>需求 / 规则：{c.requirementRefs.map(r=>r.requirementId+(r.constraintIds.length?' / '+r.constraintIds.join('、'):'')).join('；')||'未关联需求记录'}</p>
   <details><summary>来源版本（{c.sourceIds.length}）</summary>{suite.sourceSnapshots.filter(s=>c.sourceIds.includes(s.id)).map(s=><p key={s.id}><strong>{s.path}</strong>{onRevealSource&&<button type="button" onClick={()=>{setSourceError('');void onRevealSource(s).catch(e=>setSourceError(e instanceof Error?e.message:String(e)));}}>定位来源文件</button>}<br/>版本：{s.versionId} · {s.truncated?'已读片段':'已读正文'}{' · 位置：'+(s.locator||'文件正文，未提供细节位置')}<br/><small>目录：{s.mountId}<br/>SHA-256：{s.contentHash}</small></p>)}</details>
   {!!c.pendingQuestions.length&&<details open><summary>待确认</summary><ul>{c.pendingQuestions.map((v,i)=><li key={i}>{v}</li>)}</ul></details>}
  </article>)}
  <p className="detail-muted">来源按生成时的真实阅读版本记录；保存和导出时再次核对。所有内容修改请回到会话。</p>
 </section>;
}
