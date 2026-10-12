import {useRef,useState} from 'react';
import type {Request} from '../shared/types';

type ObservabilityView={enabled:boolean;baseUrl:string;publicKey:string;hasSecret:boolean;mode:'metadata'};
type PackageStatus={id:string;name:string;version:string;installed:boolean;error?:string};
type PackagesView={packages:PackageStatus[];observability:ObservabilityView};
const names:Record<string,string>={memory:'项目记忆',web:'网页研究',mcp:'外部工具连接',subagents:'子任务',lens:'草稿代码检查',plan:'方案批注',observability:'运行观测'};
/** Secret stays in the password input and is never merged into the global app state. */
export function PiPackagesSettings({call,onNotice,onError}:{call:(request:Request)=>Promise<unknown>;onNotice:(message:string)=>void;onError:(message:string)=>void}){
 const [view,setView]=useState<PackagesView>();const [draft,setDraft]=useState<ObservabilityView>();const [loading,setLoading]=useState(false);const secret=useRef<HTMLInputElement>(null);
 const load=async()=>{setLoading(true);try{const result=await call({type:'piPackages'}) as PackagesView;setView(result);setDraft(result.observability);}catch(error){onError(error instanceof Error?error.message:String(error));}finally{setLoading(false);}};
 const save=async()=>{if(!draft)return;setLoading(true);try{const result=await call({type:'piObservabilitySave',config:{enabled:draft.enabled,baseUrl:draft.baseUrl,publicKey:draft.publicKey,mode:'metadata',...(secret.current?.value?{secretKey:secret.current.value}:{})}}) as ObservabilityView;setDraft(result);setView(previous=>previous?{...previous,observability:result}:previous);if(secret.current)secret.current.value='';onNotice(result.enabled?'已启用运行观测，仅发送统计信息。':'运行观测已关闭。');}catch(error){onError(error instanceof Error?error.message:String(error));}finally{setLoading(false);}};
 return <details className="settings-advanced" data-setting-id="pi-packages" onToggle={event=>{if(event.currentTarget.open&&!view&&!loading)void load();}}>
  <summary>高级：现成能力与运行观测</summary>
  <div className="settings-advanced-body">
   {loading&&!view&&<p role="status">正在读取能力状态…</p>}
   {view&&<><div className="settings-group"><div className="settings-group-title"><div><h3>Pi 能力包</h3><small>显示固定版本安装状态；真实业务能力以各次工具回执为准。</small></div></div>{view.packages.map(item=><div className="settings-row" key={item.id}><div><b>{names[item.id]??item.name}</b><small>{item.name} · {item.version}</small></div><span>{item.installed?'已安装':'不可用'}</span></div>)}</div>
    {draft&&<div className="settings-group"><div className="settings-group-title"><div><h3>Langfuse 运行观测</h3><small>默认关闭。启用后向所填服务发送耗时、token 和工具状态；不发送正文、图片和文件路径。</small></div></div>
     <div className="settings-row"><div><b>启用观测</b><small>启用后从新任务开始；保存关闭会立即停止当前观测。观测失败不阻止任务。</small></div><button type="button" role="switch" aria-label="启用 Langfuse 运行观测" aria-checked={draft.enabled} className={`switch ${draft.enabled?'on':''}`} disabled={loading} onClick={()=>setDraft({...draft,enabled:!draft.enabled})}><span/></button></div>
     <label className="field">服务地址<input aria-label="Langfuse 服务地址" placeholder="https://cloud.langfuse.com" value={draft.baseUrl} onChange={event=>setDraft({...draft,baseUrl:event.target.value})}/></label>
     <label className="field">公钥<input aria-label="Langfuse 公钥" autoComplete="off" value={draft.publicKey} onChange={event=>setDraft({...draft,publicKey:event.target.value})}/></label>
     <label className="field">密钥<input ref={secret} aria-label="Langfuse 密钥" type="password" autoComplete="new-password" placeholder={draft.hasSecret?'已保存；留空保留':'填写服务密钥'}/></label>
     <small>当前使用统计模式，不能查看会话全文；第三方插件仍处于实验阶段。</small>
     <div className="settings-actions"><button type="button" disabled={loading} onClick={()=>void save()}>{loading?'保存中…':'保存观测设置'}</button></div>
    </div>}
   </>}
  </div>
 </details>;
}
