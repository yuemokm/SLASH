import React,{useEffect,useState} from 'react';
import './mcp-connections.css';
import {officialMcpPreset,type McpAuthStatus,type McpCall,type McpConnectionOptions} from '../shared/mcp-connections';

export function McpPresetPicker({value,url,onChange}:{value?:McpConnectionOptions['mcpPreset'];url:string;onChange:(value:McpConnectionOptions&{url:string;name?:string;provider?:string})=>void}){
 let projectRef='',readOnly=true;try{const parsed=new URL(url);projectRef=parsed.searchParams.get('project_ref')??'';readOnly=parsed.searchParams.get('read_only')!=='false';}catch{}
 const updateScope=(ref:string,readonly:boolean)=>{const next=new URL('https://mcp.supabase.com/mcp');if(ref)next.searchParams.set('project_ref',ref);next.searchParams.set('read_only',String(readonly));onChange({mcpPreset:'supabase',mcpAuth:'oauth',url:next.href});};
 return <>
  <label>服务预设<select value={value??''} onChange={event=>{const preset=event.target.value as McpConnectionOptions['mcpPreset'];onChange(preset?officialMcpPreset(preset):{mcpPreset:undefined,url,mcpAuth:'none'});}}><option value="">手动配置</option><option value="vercel">Vercel 官方 MCP</option><option value="supabase">Supabase 官方 MCP</option></select></label>
  {value==='vercel'&&<p className="muted" role="note">Vercel 要求审核 MCP 客户端。Slash 尚未取得审核回执，实际登录可能受限；连接使用真实 Slash 身份。</p>}
  {value==='supabase'&&<><label>限定 Supabase 项目（建议填写）<input value={projectRef} placeholder="Dashboard 中的 project reference" onChange={event=>updateScope(event.target.value.trim(),readOnly)}/><small>留空会连接账号范围；填写项目编号可缩小管理范围。</small></label><label className="check"><input type="checkbox" checked={readOnly} onChange={event=>updateScope(projectRef,event.target.checked)}/>仅允许读取</label>{!readOnly&&<p className="muted">允许管理写入；SQL、费用等服务商确认仍会单独显示。</p>}</>}
 </>;
}

export function McpAuthControls({id,enabled,call,onNotice,onError}:{id:string;enabled:boolean;call:McpCall;onNotice:(text:string)=>void;onError:(text:string)=>void}){
 const [status,setStatus]=useState<McpAuthStatus>();const[busy,setBusy]=useState(false);
 useEffect(()=>{let live=true;const update=()=>void call({type:'mcpAuthStatus',id}).then(value=>{if(live)setStatus(value as McpAuthStatus);}).catch(()=>{});update();const timer=setInterval(update,2000);return()=>{live=false;clearInterval(timer);};},[id,call]);
 const act=async(type:'mcpAuthLogin'|'mcpAuthCancel'|'mcpAuthDisconnect')=>{setBusy(true);try{const value=await call({type,id}) as McpAuthStatus;setStatus(value);onNotice(value.message);}catch(error){onError(error instanceof Error?error.message:'登录操作失败');}finally{setBusy(false);}};
 return <div className="mcp-auth-controls"><small role="status">{status?.message??'正在读取登录状态…'}</small><div className="button-row">{status?.status==='pending'?<button disabled={busy} onClick={()=>void act('mcpAuthCancel')}>取消登录</button>:<button disabled={!enabled||busy} onClick={()=>void act('mcpAuthLogin')}>网页登录</button>}<button disabled={busy} onClick={()=>void act('mcpAuthDisconnect')}>注销本机登录</button></div></div>;
}
