import {useEffect,useState} from 'react';
import type {Request} from '../shared/types';
import {subagentSettingsSchema} from '../shared/subagent-settings';
import {announceSubagentSettings,SUBAGENT_SETTINGS_CHANGED} from './subagent-settings-state';
import './subagent-settings.css';

const scope='全局设置，仅对新任务生效；不会停止正在运行的任务。';
export function ComposerSubagentToggle({call,onNotice}:{call:(request:Request)=>Promise<unknown>;onNotice:(message:string)=>void}){
 const [enabled,setEnabled]=useState<boolean>();
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const [reload,setReload]=useState(0);
 useEffect(()=>{
  let live=true;
  const changed=(event:Event)=>{const config=subagentSettingsSchema.safeParse((event as CustomEvent).detail);if(config.success){setEnabled(config.data.enabled);setError('');}};
  window.addEventListener(SUBAGENT_SETTINGS_CHANGED,changed);
  void call({type:'subagentSettingsGet'}).then(value=>{if(live){setEnabled(subagentSettingsSchema.parse(value).enabled);setError('');}}).catch(reason=>{if(live)setError(reason instanceof Error?reason.message:String(reason));});
  return()=>{live=false;window.removeEventListener(SUBAGENT_SETTINGS_CHANGED,changed);};
 },[call,reload]);
 const toggle=async()=>{
  if(enabled===undefined||busy)return;
  setBusy(true);setError('');
  try{announceSubagentSettings(await call({type:'subagentSettingsSetEnabled',enabled:!enabled}));onNotice(`子 Agent 已${enabled?'关闭':'开启'}，从新任务生效。`);}
  catch(reason){setError(reason instanceof Error?reason.message:String(reason));}
  finally{setBusy(false);}
 };
 return <div className="composer-subagent-control"><button type="button" role="switch" aria-label="子 Agent" aria-checked={enabled??false} aria-busy={busy||enabled===undefined&&!error} title={`子 Agent ${enabled===undefined?'正在读取':enabled?'已开启':'已关闭'}。${scope}${error?` 保存失败：${error}`:''}`} disabled={busy||enabled===undefined} className={`composer-subagent-toggle ${enabled?'on':''}`} onClick={()=>void toggle()}><span>子 Agent</span><span className="composer-subagent-track" aria-hidden="true"><i/></span>{(busy||enabled===undefined)&&<small>{busy?'保存中':'读取中'}</small>}</button>{error&&<button type="button" className="composer-subagent-retry" title={error} onClick={()=>enabled===undefined?setReload(value=>value+1):void toggle()} aria-label="重试子 Agent 设置"><span role="status">{enabled===undefined?'读取失败':'未保存'} · 重试</span></button>}</div>;
}
