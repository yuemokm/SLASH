import {useEffect,useRef,useState} from 'react';
import type {Connection,DeliveryPreflight,ExternalResult,FileRef,Request} from '../shared/types';

function ResultCard({result}:{result:ExternalResult}){
 const labels:Record<string,string>={pending:'等待审批',preview:'仅预览',succeeded:'已确认成功',failed:'明确失败',outcome_unknown:'结果待核对',executing:'执行中'};
 return <div className={`result-card ${result.status}`} role="status" aria-live="polite">
  <div><strong>{labels[result.status]||result.status}</strong><code>{result.operationId}</code></div>
  <p>{result.diagnostic}</p>
  {(result.remoteId||result.url)&&<small>{result.remoteId||result.url}</small>}
  {result.receipt!==undefined&&<details><summary>查看远端回执</summary><pre>{JSON.stringify(result.receipt,null,2)}</pre></details>}
 </div>;
}

type Provider='feishu'|'dingtalk';
type ChecklistField='contentReviewed'|'destinationConfirmed';
const statusLabels:Record<string,string>={passed:'通过',warning:'需留意',blocked:'阻断',unknown:'待确认'};

export function Delivery({connections,file,sourceHash,call}:{connections:Connection[];file:FileRef;sourceHash?:string;call:(request:Request)=>Promise<unknown>}){
 const available=connections.filter(connection=>connection.kind==='cli'&&connection.enabled&&(connection.provider==='feishu'||connection.provider==='dingtalk'));
 const [target,setTarget]=useState('');
 const selected=available.find(connection=>connection.id===target);
 const [provider,setProvider]=useState<Provider>('feishu');
 const defaultTitle=file.path.split(/[\\/]/).pop()?.replace(/\.md$/i,'')||'未命名成果';
 const [title,setTitle]=useState(defaultTitle);
 const [remote,setRemote]=useState('');
 const [result,setResult]=useState<ExternalResult>();
 const [busy,setBusy]=useState(false);
 const [preflight,setPreflight]=useState<DeliveryPreflight>();
 const [preflightBusy,setPreflightBusy]=useState(false);
 const [error,setError]=useState('');
 const revision=useRef(0);
 const signature=`${file.mountId}|${file.path}|${sourceHash||''}|${target}|${provider}|${title.trim()}|${remote.trim()}`;
 const signatureRef=useRef(signature);
 useEffect(()=>{signatureRef.current=signature;},[signature]);
 useEffect(()=>{signatureRef.current=signature;setPreflight(undefined);setResult(undefined);setError('');setTitle(defaultTitle);setRemote('');revision.current+=1;},[file.mountId,file.path,sourceHash]);
 const requestTarget=()=>({connectionId:target,mountId:file.mountId,path:file.path,title:title.trim(),provider,remoteId:remote.trim()||undefined,sourceHash:sourceHash||''});
 const runPreflight=async():Promise<DeliveryPreflight|undefined>=>{
  if(!target||!sourceHash||selected?.provider!==provider||!title.trim())return undefined;
  const requestSignature=signature;const token=++revision.current;setPreflightBusy(true);setError('');
  try{const checked=await call({type:'deliveryPreflight',...requestTarget(),sourceHash});if(token===revision.current&&signatureRef.current===requestSignature)setPreflight(checked as DeliveryPreflight);return checked as DeliveryPreflight;}
  catch(reason){if(token===revision.current)setError(reason instanceof Error?reason.message:String(reason));return undefined;}
  finally{if(token===revision.current)setPreflightBusy(false);}
 };
 const updateChecklist=async(field:ChecklistField,value:boolean)=>{
  if(!target||!sourceHash||selected?.provider!==provider||!title.trim())return;
  const requestSignature=signature;const token=++revision.current;setPreflightBusy(true);setError('');
  try{const checked=await call({type:'deliveryChecklist',...requestTarget(),sourceHash,patch:{[field]:value}});if(token===revision.current&&signatureRef.current===requestSignature)setPreflight(checked as DeliveryPreflight);}
  catch(reason){if(token===revision.current)setError(reason instanceof Error?reason.message:String(reason));}
  finally{if(token===revision.current)setPreflightBusy(false);}
 };
 const deliver=async(dryRun:boolean)=>{
  setBusy(true);setError('');
  try{
   if(!sourceHash||!/^[a-f0-9]{64}$/i.test(sourceHash))throw Error('请重新打开当前文件，确认读取版本后再发布');
   if(!target||selected?.provider!==provider||!title.trim())throw Error('请选择匹配的 CLI 连接并填写交付标题');
   const checked=await runPreflight();
   if(!checked)throw Error('请先完成交付前检查');
   if(!checked.allowed&&!dryRun)throw Error(`交付前检查未通过：${checked.checks.filter(item=>item.status==='blocked').map(item=>item.detail).join('；')}`);
   setResult(await call({type:'deliver',connectionId:target,mountId:file.mountId,path:file.path,title:title.trim(),provider,remoteId:remote.trim()||undefined,sourceHash,dryRun}) as ExternalResult);
  }catch(reason){setResult({operationId:'未创建',status:'failed',diagnostic:reason instanceof Error?reason.message:String(reason)});}
  finally{setBusy(false);}
 };
 const selectionChanged=(field:'target'|'provider'|'title'|'remote',value:string)=>{
  if(field==='target'){setTarget(value);const item=available.find(connection=>connection.id===value);if(item?.provider==='feishu'||item?.provider==='dingtalk')setProvider(item.provider);}
 if(field==='provider')setProvider(value as Provider);
 if(field==='title')setTitle(value);
 if(field==='remote')setRemote(value);
  revision.current+=1;setPreflight(undefined);setResult(undefined);setError('');
  queueMicrotask(()=>{signatureRef.current=`${file.mountId}|${file.path}|${sourceHash||''}|${field==='target'?value:target}|${field==='provider'?value:provider}|${field==='title'?value:title}|${field==='remote'?value:remote}`;});
 };
 return <details className="delivery">
  <summary>交付到在线文档</summary>
  {!available.length&&<p className="inline-hint">请先在“连接管理”添加并启用官方 CLI。</p>}
  <div className="form-grid">
   <label>服务商<select value={provider} disabled={busy||preflightBusy} onChange={event=>selectionChanged('provider',event.target.value)}><option value="feishu">飞书</option><option value="dingtalk">钉钉</option></select></label>
   <label>CLI 连接<select value={target} disabled={busy||preflightBusy} onChange={event=>selectionChanged('target',event.target.value)}><option value="">选择连接</option>{available.map(connection=><option key={connection.id} value={connection.id}>{connection.name}{connection.provider?` · ${connection.provider}`:''}</option>)}</select></label>
  </div>
  <label>交付标题<input value={title} disabled={busy||preflightBusy} onChange={event=>selectionChanged('title',event.target.value)} placeholder="例如：客户准入 PRD"/></label>
  {selected?.provider&&selected.provider!==provider&&<p className="field-error">所选连接属于 {selected.provider==='feishu'?'飞书':'钉钉'}，请切换服务商。</p>}
  <label>已有文档 ID / URL（更新时填写）<input value={remote} disabled={busy||preflightBusy} onChange={event=>selectionChanged('remote',event.target.value)} placeholder="留空将创建新文档"/></label>
  {!sourceHash&&<p className="inline-hint">重新打开当前文件后才能绑定版本并发布。</p>}
  {error&&<p className="field-error" role="alert">{error}</p>}
  <section className="delivery-preflight" aria-label="交付前检查">
   <div className="delivery-preflight-head"><div><b>交付前检查</b><small>{preflight?`检查于 ${new Date(preflight.checkedAt).toLocaleTimeString()}`:'发布前检查版本、质量、评审和目标'}</small></div><button type="button" disabled={preflightBusy||busy||!target||selected?.provider!==provider||!sourceHash||!title.trim()} onClick={()=>void runPreflight()}>{preflightBusy?'检查中…':'检查交付条件'}</button></div>
   {preflight?<>
    <div className="delivery-preflight-list">{preflight.checks.map(item=><div className={`delivery-preflight-row ${item.status}`} key={item.id}><span className="delivery-preflight-dot" aria-hidden="true"/><div><b>{item.label} · {statusLabels[item.status]||item.status}</b><small>{item.detail}</small></div></div>)}</div>
    <div className="delivery-checklist">
     <label><input type="checkbox" checked={preflight.checklist.contentReviewed} disabled={preflightBusy||busy} onChange={event=>void updateChecklist('contentReviewed',event.target.checked)}/> 我已检查当前成果内容和版本</label>
     <label><input type="checkbox" checked={preflight.checklist.destinationConfirmed} disabled={preflightBusy||busy} onChange={event=>void updateChecklist('destinationConfirmed',event.target.checked)}/> 我已确认服务商、文档目标和更新范围</label>
    </div>
   </>:<p className="inline-hint">选择连接后检查；在线发布还需要确认内容和目标。</p>}
  </section>
  <div className="button-row"><button disabled={!target||busy||preflightBusy||selected?.provider!==provider||!sourceHash||!title.trim()} onClick={()=>void deliver(true)}>预览请求</button><button className="primary" disabled={!target||busy||preflightBusy||selected?.provider!==provider||!sourceHash||!title.trim()} onClick={()=>void deliver(false)}>确认{remote?'更新':'创建'}</button></div>
  {result&&<ResultCard result={result}/>} 
 </details>;
}

export function McpExecute({connections,call}:{connections:Connection[];call:(request:Request)=>Promise<unknown>}){
 const [id,setId]=useState('');const [name,setName]=useState('');const [args,setArgs]=useState('{}');const [result,setResult]=useState<ExternalResult>();const [busy,setBusy]=useState(false);const [error,setError]=useState('');
 const execute=async()=>{setBusy(true);setError('');try{const parsed=JSON.parse(args) as unknown;if(!parsed||Array.isArray(parsed)||typeof parsed!=='object')throw Error('参数必须是 JSON 对象');setResult(await call({type:'mcpCall',connectionId:id,tool:name,args:parsed as Record<string,unknown>}) as ExternalResult);}catch(reason){setError(String(reason));}finally{setBusy(false);}};
 return <section className="panel">
  <div className="section-heading"><div><span className="eyebrow">手动工具</span><h2>执行 MCP 工具</h2></div></div>
  <p className="muted">先检查服务公开的工具名称与参数。点击执行代表你确认这次外部操作。</p>
  <label>MCP 服务<select value={id} onChange={event=>setId(event.target.value)}><option value="">选择服务</option>{connections.filter(connection=>connection.kind==='mcp'&&connection.enabled).map(connection=><option value={connection.id} key={connection.id}>{connection.name}</option>)}</select></label>
  <label>工具名称<input value={name} onChange={event=>setName(event.target.value)} placeholder="例如 publish_site"/></label>
  <label>JSON 参数<textarea className="json" value={args} onChange={event=>setArgs(event.target.value)}/></label>
  {error&&<p className="field-error">{error}</p>}
  <button className="primary" disabled={busy||!id||!name} onClick={()=>void execute()}>确认执行</button>
  {result&&<ResultCard result={result}/>} 
 </section>;
}
