import React, {useState} from 'react';
import type {Request, ShareSetupInfo} from '../shared/types';
import {shareAuthorizationSelection, type ShareManagementResult, type SharePermissionView} from '../shared/network-share-management';
import './ShareManagement.css';
import {ComposerSelect} from './ComposerSelect';

type Mapping=ShareSetupInfo['mappings'][number];
type LocalShare=ShareSetupInfo['existingShares'][number];
export function ShareManagement({setup,call,onRefresh,onNotice,onError,renderMappingStatus}:{setup?:ShareSetupInfo;call:(request:Request)=>Promise<unknown>;onRefresh:()=>Promise<void>;onNotice:(text:string)=>void;onError:(text:string)=>void;renderMappingStatus?:(item:Mapping)=>React.ReactNode}){
 const [local,setLocal]=useState<LocalShare>();
 const [permissions,setPermissions]=useState<SharePermissionView>();
 const [previousAccount,setPreviousAccount]=useState('');
 const [account,setAccount]=useState('');
 const [access,setAccess]=useState<'read_only'|'read_write'>('read_only');
 const [stop,setStop]=useState(false);
 const [mapping,setMapping]=useState<Mapping>();
 const [action,setAction]=useState<'disconnect'|'reconnect'>('reconnect');
 const [username,setUsername]=useState('');
 const [password,setPassword]=useState('');
 const [saveCredentials,setSaveCredentials]=useState(false);
 const [clearCredentials,setClearCredentials]=useState(false);
 const [busy,setBusy]=useState(false);
 const [feedback,setFeedback]=useState<{error:boolean;text:string}>();
 const closeMapping=()=>{setMapping(undefined);setPassword('');setUsername('');setClearCredentials(false);setSaveCredentials(false);};
 const run=async(operation:()=>Promise<void>)=>{setBusy(true);setFeedback(undefined);try{await operation();}catch(e){const text=e instanceof Error?e.message:String(e);setFeedback({error:true,text});onError(text);}finally{setBusy(false);setPassword('');}};
 const report=(result:ShareManagementResult)=>{setFeedback({error:result.status!=='succeeded',text:result.diagnostic});(result.status==='succeeded'?onNotice:onError)(result.diagnostic);};
 const inspect=async(item:LocalShare)=>{closeMapping();setLocal(item);setStop(false);setPermissions(undefined);const p=await call({type:'sharePermissionInspect',shareName:item.name,expectedPath:item.path}) as SharePermissionView;setPermissions(p);const selection=shareAuthorizationSelection(setup?.currentUser??{qualifiedName:''},p);setPreviousAccount(selection.previousAccount);setAccount(selection.account);setAccess(selection.access);};
 const openMapping=(item:Mapping,kind:'disconnect'|'reconnect')=>{closeMapping();setMapping(item);setAction(kind);setLocal(undefined);setPermissions(undefined);setFeedback(undefined);};
 const supported=setup?.supported===true;
 return <div className="share-management">
  {feedback&&<div className={`inline-feedback ${feedback.error?'error':'success'}`} role={feedback.error?'alert':'status'}>{feedback.text}<button onClick={()=>setFeedback(undefined)} aria-label="关闭管理提示">×</button></div>}
  <section className="managed-shares local" aria-label="本机共享管理">
   <div className="section-heading"><div><span className="eyebrow">本机共享</span><h2>这台电脑正在分享的文件夹</h2></div><button disabled={busy} onClick={()=>void run(onRefresh)}>刷新</button></div>
   <div className="mapping-list">{setup?.existingShares.filter(item=>!item.special).map(item=><div key={item.name}>
    <div className="mapping-row"><div><b>{item.name}</b><small>{item.path}</small></div><div className="mapping-actions"><button disabled={busy||!supported} onClick={()=>void run(()=>inspect(item))}>管理授权</button><button className="danger-text" disabled={busy||!supported} onClick={()=>{setLocal(item);setPermissions(undefined);setStop(true);closeMapping();}}>停止对外共享</button></div></div>
    {local?.name===item.name&&<div className="share-management-form">
     {stop?<><p>停止后，同事将无法继续通过此共享入口访问，现有连接可能中断。本地文件夹和文件会保留。</p><div className="share-management-actions"><button className="danger-text" disabled={busy} onClick={()=>void run(async()=>{report(await call({type:'shareStop',shareName:item.name,expectedPath:item.path}) as ShareManagementResult);setLocal(undefined);await onRefresh();})}>{busy?'正在核对…':'确认停止共享'}</button><button disabled={busy} onClick={()=>setLocal(undefined)}>取消</button></div></>:permissions?<>
      <b>当前显式共享授权</b><ul className="share-account-list">{permissions.accounts.map(a=><li key={a.account+a.type}><span>{a.account} · {a.principalKind==='group'?'组':a.principalKind==='user'?'用户':'身份待核对'}</span><span>{a.type==='Deny'?'拒绝访问':a.access==='Read'?'只读':a.access==='Full'?'完全控制':'读写'}</span></li>)}</ul>
      <fieldset disabled={busy}><label>替换哪条账号授权<ComposerSelect ariaLabel="替换哪条账号授权" value={previousAccount} options={[{value:"",label:"添加新账号，保留已有账号"},...permissions.accounts.filter(a=>a.type==='Allow').map(a=>({value:a.account,label:a.account+(a.principalKind==='group'?'（组）':a.principalKind==='user'?'（用户）':'（身份待核对）')}))]} onChange={value=>{setPreviousAccount(value);const entry=permissions.accounts.find(a=>a.account===value);setAccount(entry?.canonicalName||entry?.account||(setup?.currentUser.status==='verified'?setup.currentUser.qualifiedName:''));setAccess(entry?.access==='Read'?'read_only':'read_write');}}/></label></fieldset>
      <p className="muted">{!setup?.currentUser.sid||setup.currentUser.status!=='verified'?'当前身份暂不可核对，请手动输入其他 Windows 账号。':shareAuthorizationSelection(setup.currentUser,permissions).currentDenied?'当前账号存在显式拒绝，不能当作可访问账号；请在 Windows 核对拒绝规则。':shareAuthorizationSelection(setup.currentUser,permissions).currentGranted?'当前账号已有个人授权（按 SID 核对）。':'当前账号没有直接个人授权；默认添加当前账号，保留现有用户和组授权。'}</p><fieldset disabled={busy}><label>选择真实 Windows 账号<ComposerSelect ariaLabel="选择真实 Windows 账号" value={setup?.accounts.some(a=>a.qualifiedName===account)?account:'__manual__'} options={[...(setup?.accounts??[]).map(a=>({value:a.qualifiedName,label:a.qualifiedName+(a.current?'（当前账号）':''),description:a.principalSource||'已按 SID 核对'})),{value:'__manual__',label:'手动输入其他账号'}]} onChange={value=>setAccount(value==='__manual__'?'':value)}/></label></fieldset><label>新的授权账号<input value={account} disabled={busy} onChange={e=>setAccount(e.target.value)} autoComplete="off"/></label>
      <fieldset disabled={busy}><label>共享读写权限<ComposerSelect ariaLabel="共享读写权限" value={access} options={[{value:"read_only",label:"只读"},{value:"read_write",label:"读写"}]} onChange={value=>setAccess(value as typeof access)}/></label></fieldset>
      <p className="muted">{permissions.notice} 账号密码由 Windows 账号管理维护。</p>
      <div className="share-management-actions"><button disabled={busy||!account.trim()} onClick={()=>void run(async()=>{const result=await call({type:'sharePermissionUpdate',shareName:item.name,expectedPath:item.path,expectedFingerprint:permissions.fingerprint,previousAccount:previousAccount||undefined,account,access}) as ShareManagementResult;report(result);if(result.status==='succeeded')await inspect(item);else setPermissions(undefined);await onRefresh();})}>{busy?'正在核对…':'更新共享授权'}</button><button disabled={busy} onClick={()=>{setLocal(undefined);setPermissions(undefined);}}>取消</button></div>
     </>:<p className="muted">授权尚未读取或已经变化，请重新点击“管理授权”。</p>}
    </div>}
   </div>)}</div>{!setup?.existingShares.some(item=>!item.special)&&<p className="empty compact">这台电脑没有普通文件夹共享</p>}
  </section>
  <section className="managed-shares" aria-label="已连接共享管理">
   <div className="section-heading"><div><span className="eyebrow">这台电脑</span><h2>已连接的网络盘</h2></div></div>
   <div className="mapping-list">{setup?.mappings.map(item=><div key={item.drive}>
    <div className="mapping-row"><div className="drive-letter">{item.drive||'SMB'}</div><div><b>{item.remotePath}</b><small>{item.status||'状态未知'}</small>{renderMappingStatus?.(item)}</div><div className="mapping-actions"><button disabled={busy||!supported||!/^[D-Z]:$/.test(item.drive)} onClick={()=>openMapping(item,'reconnect')}>更新连接凭据</button><button className="danger-text" disabled={busy||!supported||!/^[D-Z]:$/.test(item.drive)} onClick={()=>openMapping(item,'disconnect')}>断开映射</button></div></div>
    {mapping?.drive===item.drive&&<div className="share-management-form">
     <b>{action==='reconnect'?'更新连接账号和密码':'断开所选映射'}</b><p>{action==='reconnect'?`将先断开 ${item.drive}，再用新凭据连接同一共享。正在打开的文件可能受影响，失败时原映射可能保持断开；这不会修改 Windows 账号密码或共享方授权。`:`仅移除 ${item.drive} 的映射和自动恢复记录，远端文件不会删除。`}</p>
     {action==='reconnect'&&<><label>连接账号<input disabled={busy} value={username} onChange={e=>setUsername(e.target.value)} autoComplete="off" placeholder="主机或域\\账号"/></label><label>连接密码<input disabled={busy} type="password" value={password} onChange={e=>setPassword(e.target.value)} autoComplete="new-password"/></label><label className="share-management-check"><input disabled={busy} type="checkbox" checked={saveCredentials} onChange={e=>setSaveCredentials(e.target.checked)}/>由 Windows 保存新凭据</label></>}
     <label className="share-management-check"><input disabled={busy} type="checkbox" checked={clearCredentials} onChange={e=>setClearCredentials(e.target.checked)}/>先清除该主机保存的 Windows 凭据</label>{clearCredentials&&<p className="muted">凭据按主机保存，清除可能影响此主机的其他共享下次认证；不会自动断开其他盘符。</p>}
     <div className="share-management-actions"><button disabled={busy||(action==='reconnect'&&(!username.trim()||!password))} onClick={()=>void run(async()=>{const auth={mode:'username-password' as const,username,password,saveCredentials};setPassword('');const result=await call(action==='reconnect'?{type:'shareReconnect',drive:item.drive,expectedRemotePath:item.remotePath,authentication:auth,clearCredentials}:{type:'shareDisconnect',drive:item.drive,expectedRemotePath:item.remotePath,clearCredentials}) as ShareManagementResult;report(result);closeMapping();await onRefresh();})}>{busy?'正在核对…':action==='reconnect'?'更新凭据并重连':'确认断开映射'}</button><button disabled={busy} onClick={closeMapping}>取消</button></div>
    </div>}
   </div>)}</div>{!setup?.mappings.length&&<p className="empty compact">还没有连接网络盘</p>}
  </section>
 </div>;
}
