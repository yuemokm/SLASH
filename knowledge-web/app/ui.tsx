'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Answer, Base, Citation } from '../lib/contracts';
type Config={url:string;key:string}|null;
export default function KnowledgePage({config,fixture}:{config:Config;fixture:boolean}) {
  const [client] = useState<SupabaseClient|null>(()=>config ? createClient(config.url,config.key):null);
  const [token,setToken]=useState(''),[email,setEmail]=useState(''),[password,setPassword]=useState('');
  const [authMode,setAuthMode]=useState<'login'|'register'>('login');
  const [bases,setBases]=useState<Base[]>([]),[kb,setKb]=useState(''),[question,setQuestion]=useState('');
  const [answer,setAnswer]=useState<Answer|null>(null),[source,setSource]=useState<Citation|null>(null);
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
  const epoch=useRef(0), pending=useRef<AbortController|null>(null);
  async function api(path:string, init:RequestInit={}, auth=token) {
    const response=await fetch(path,{...init,headers:{'Content-Type':'application/json',Authorization:`Bearer ${auth}`,...init.headers},cache:'no-store'});
    const value=await response.json();
    if(!response.ok) throw Error(value.error?.message??'服务暂时不可用。');
    return value;
  }
  useEffect(()=>{
    if(!client)return;
    const {data}=client.auth.onAuthStateChange((_event,session)=>setToken(session?.access_token??''));
    void client.auth.getSession().then(({data})=>setToken(data.session?.access_token??''));
    return ()=>data.subscription.unsubscribe();
  },[client]);
  useEffect(()=>{
    epoch.current++; pending.current?.abort(); setBusy(false);setAnswer(null);setSource(null);setNotice('');setBases([]);setKb('');
    if(!token)return;
    const controller=new AbortController();
    void api('/api/knowledge-bases',{signal:controller.signal}).then(value=>{setBases(value.bases);setKb(value.bases[0]?.id??'');}).catch(e=>{if(!controller.signal.aborted)setError(e.message);});
    return ()=>controller.abort();
  },[token]); // access token refresh reloads the authorized collection list
  async function login(event:FormEvent) {
    event.preventDefault(); if(!client)return;setBusy(true);setError('');setNotice('');
    try{
      if(authMode==='register') {
        const {data,error}=await client.auth.signUp({email:email.trim(),password,options:{emailRedirectTo:`${window.location.origin}/`}});
        if(error)throw Error(error.code==='weak_password'?'密码不符合要求，请使用至少8位且更难猜的密码。':error.code==='over_email_send_rate_limit'?'验证邮件发送过于频繁，请稍后再试。':'注册未完成，请核对邮箱和密码，或联系维护者确认是否已开放注册。');
        setAuthMode('login');
        if(!data.session)setNotice('请检查邮箱并打开确认链接，再回来登录。已有账号可直接登录；资料访问仍需维护者授权。');
      } else {
        const {error}=await client.auth.signInWithPassword({email:email.trim(),password});
        if(error)throw Error(error.code==='email_not_confirmed'?'邮箱尚未确认，请先打开邮箱中的确认链接。':'登录失败，请核对邮箱、密码或联系知识库维护者。');
      }
      setPassword('');
    }catch(e){setError((e as Error).message);}finally{setBusy(false);}
  }
  async function submit(event:FormEvent) {
    event.preventDefault(); const current=++epoch.current;pending.current?.abort();
    const controller=new AbortController();pending.current=controller;setBusy(true);setError('');setNotice('');setAnswer(null);setSource(null);
    try{const value=await api('/api/ask',{method:'POST',body:JSON.stringify({kbId:kb,question}),signal:controller.signal});if(current===epoch.current)setAnswer(value);}catch(e){if(!controller.signal.aborted)setError((e as Error).message);}finally{if(current===epoch.current)setBusy(false);}
  }
  async function openSource(citation:Citation) {
    const current=epoch.current;
    setError('');setSource(null);
    try{const {source:verified}=await api(citation.href);if(current===epoch.current)setSource({...citation,excerpt:verified.text});}catch(e){if(current===epoch.current){setAnswer(null);setError((e as Error).message);}}
  }
  async function feedback(helpful:boolean) {
    if(!answer)return;const current=epoch.current;try{await api('/api/feedback',{method:'POST',body:JSON.stringify({receiptId:answer.receiptId,helpful})});if(current===epoch.current)setNotice(fixture?'演示反馈已接收（不存入云端）。':'反馈已保存，谢谢。');}catch(e){if(current===epoch.current)setError((e as Error).message);}
  }
  return <main>
    <header><a href="/" className="brand" aria-label="Slash资料问答首页">/ <span>slash</span></a><span className="subtle">资料问答</span>{token&&<button className="quiet" onClick={()=>{epoch.current++;pending.current?.abort();setToken('');setBusy(false);setAnswer(null);setSource(null);void client?.auth.signOut();}}>退出登录</button>}</header>
    <section className="intro"><div className="eyebrow">KNOWLEDGE / ASK</div><h1>在资料里，找到依据。</h1><p>根据已发布资料回答。每个结论都可以回到对应来源核对。</p></section>
    {fixture&&<aside className="banner">本地隔离演示 · 使用固定样例，无云端连接，不代表真实问答效果。</aside>}
    {!config&&!fixture&&<section className="panel"><h2>问答服务尚未配置</h2><p>请联系维护者完成账号、知识库和模型配置，再使用分享链接访问。</p></section>}
    {!token&&(config||fixture)&&<section className="panel login"><h2>{authMode==='register'?'注册问答账号':'登录后查看授权资料'}</h2><p className="subtle">使用自己的邮箱注册并确认后，请维护者授权需要的知识库。</p>{fixture ? <button onClick={()=>{setError('');setToken('local-fixture');}}>进入本地演示</button>:<><form onSubmit={login}><label>邮箱<input type="email" autoComplete="username" required value={email} onChange={e=>setEmail(e.target.value)}/></label><label>密码<input type="password" autoComplete={authMode==='register'?'new-password':'current-password'} minLength={authMode==='register'?8:undefined} required value={password} onChange={e=>setPassword(e.target.value)}/></label><button disabled={busy}>{busy?'正在处理…':authMode==='register'?'注册并发送确认邮件':'登录'}</button></form><button className="quiet" disabled={busy} onClick={()=>{setAuthMode(authMode==='login'?'register':'login');setPassword('');setError('');setNotice('');}}>{authMode==='login'?'没有账号？注册':'已有账号？登录'}</button></>}</section>}
    {token&&<><form className="question" onSubmit={submit}><label className="collection">知识库<select value={kb} disabled={busy} onChange={e=>{epoch.current++;setKb(e.target.value);setAnswer(null);setSource(null);setError('');setNotice('');}}><option value="" disabled>选择已授权知识库</option>{bases.map(b=><option key={b.id} value={b.id}>{b.title}</option>)}</select></label><label htmlFor="question">你想了解什么？</label><textarea id="question" placeholder="例如：门店的两种地址分别由谁维护？" value={question} maxLength={2000} required onChange={e=>setQuestion(e.target.value)}/><div className="question-footer"><span className="subtle">仅查询当前已发布版本</span><button disabled={busy||!kb||!question.trim()}>{busy?'正在查找依据…':'查找答案 →'}</button></div></form>{!bases.length&&<p className="subtle">暂无可访问的知识库。请联系维护者确认访问权限和发布状态。</p>}</>}
    {error&&<p role="alert" className="error">{error}</p>}
    {answer&&<article className="answer" aria-live="polite"><div className="answer-heading"><h2>回答</h2><span className="status">{answer.status==='supported'?'已关联来源':answer.status==='conflict'?'资料存在冲突':'当前资料没有依据'}</span></div>{answer.paragraphs.map((p,i)=><p key={i}>{p.text} {p.sourceIds.map(id=><button className="cite" key={id} aria-label={`查看引用${answer.sources.find(s=>s.id===id)?.title??id}`} onClick={()=>{const c=answer.sources.find(s=>s.id===id);if(c)void openSource(c);}}>[{answer.sources.findIndex(s=>s.id===id)+1}]</button>)}</p>)}{answer.sources.length>0&&<details><summary>查看 {answer.sources.length} 处资料来源</summary>{answer.sources.map((s,i)=><div className="source-row" key={s.id}><a href={s.href} onClick={e=>{e.preventDefault();void openSource(s);}}>{i+1}. {s.title}</a><span>{s.sourceVersion}</span></div>)}</details>}<div className="answer-footer"><span className="subtle">资料版本：{answer.indexVersion}</span><div><button className="quiet" onClick={()=>void feedback(true)}>有帮助</button><button className="quiet" onClick={()=>void feedback(false)}>需核对</button></div></div></article>}
    {source&&<section className="source-detail" aria-label="来源原文"><div className="answer-heading"><h2>{source.title}</h2><button className="quiet" onClick={()=>setSource(null)}>收起</button></div><p className="subtle">{source.sourceVersion} · {typeof source.locator.startLine==='number'?`第 ${source.locator.startLine}–${source.locator.endLine} 行`:'原文片段'}</p><pre>{source.excerpt}</pre><p className="subtle">索引 {source.indexVersion} · 正文校验 {source.textHash.slice(0,12)}</p></section>}
    {notice&&<p role="status" className="subtle">{notice}</p>}<footer>来源可追溯，答案仍需结合业务场景核对。资料不足时会明确说明。</footer>
  </main>;
}
