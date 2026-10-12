import http from 'node:http';
import {randomUUID} from 'node:crypto';
import {auth,type OAuthClientProvider,UnauthorizedError} from '@modelcontextprotocol/sdk/client/auth.js';
import type {OAuthClientInformationMixed,OAuthTokens} from '@modelcontextprotocol/sdk/shared/auth.js';
import type {McpAuthStatus} from '../shared/mcp-connections.js';
import {McpCredentialVault,mcpBinding,type McpConnection} from './mcp-credentials.js';
import {McpSafeError,safeMcpMessage} from './mcp-errors.js';
import {createAuthorizedOAuthFetch,resolveAuthorizedTarget,networkAddressScope,networkGrantRevision,type NetworkGrant,type ResolvedAddress} from './network-target-policy.js';
import {mcpNetworkOriginSchema} from '../shared/mcp-connections.js';

type Session={binding:string;abort:AbortController;server?:http.Server;timer?:ReturnType<typeof setTimeout>;reject?:(reason:unknown)=>void;status:McpAuthStatus};
type Options={vault:McpCredentialVault;current:(id:string)=>McpConnection|undefined;openExternal:(url:string)=>Promise<unknown>;fetch?:typeof fetch;resolve?:(hostname:string)=>Promise<ResolvedAddress[]>;timeoutMs?:number;allowLocalFixture?:boolean};
export function mcpNetworkGrant(connection:McpConnection):NetworkGrant{
 const url=new URL(connection.url!),host=url.hostname.replace(/^\[|\]$/g,'').toLowerCase();
 const origins=(connection.mcpNetworkAllowedOrigins??[]).map(value=>mcpNetworkOriginSchema.parse(value));
 // An explicitly configured intranet address authorizes its own origin only.
 if(url.protocol==='https:'&&(networkAddressScope(host)==='private'||(!host.includes('.')&&!host.includes(':'))||host.endsWith('.local')||host.endsWith('.internal')))origins.push(url.origin);
 const allowedOrigins=[...new Set(origins)].sort(),binding=mcpBinding(connection);
 return{connectionId:connection.id,binding,allowedOrigins,allowPrivate:true,revision:JSON.stringify(allowedOrigins)};
}
export function mcpNetworkBinding(connection:McpConnection){return mcpBinding(connection)+'\n'+(connection.url?networkGrantRevision(mcpNetworkGrant(connection)):'');}
export class McpOAuthBroker{
 private sessions=new Map<string,Session>();private states=new Map<string,McpAuthStatus>();
 constructor(private options:Options){}
 private enabled(connection:McpConnection){return connection.kind==='mcp'&&!!connection.url&&connection.mcpAuth==='oauth';}
 status(connection:McpConnection):McpAuthStatus{
  if(!this.enabled(connection))return{connectionId:connection.id,status:'anonymous',message:'匿名连接'};
  const session=this.sessions.get(connection.id);if(session&&session.binding!==mcpNetworkBinding(connection))this.cancel(connection.id);
  if(this.sessions.has(connection.id))return this.sessions.get(connection.id)!.status;
  try{if(this.options.vault.read(connection)?.tokens)return{connectionId:connection.id,status:'authenticated',message:'已保存登录凭据；请测试当前可用性'};}catch{return{connectionId:connection.id,status:'error',message:'系统安全存储不可用或凭据无法解密'};}
  const state=this.states.get(connection.id);return state?.status==='authenticated'?{connectionId:connection.id,status:'signed_out',message:'登录凭据已失效，请重新登录'}:state??{connectionId:connection.id,status:'signed_out',message:'尚未网页登录'};
 }
 cancel(id:string){this.options.vault.invalidateSession(id);const session=this.sessions.get(id);if(session){session.abort.abort();session.reject?.(new McpSafeError('cancelled','登录已取消'));this.cleanup(id,session);}this.states.set(id,{connectionId:id,status:'signed_out',message:'登录已取消'});return this.states.get(id)!;}
 disconnect(id:string){this.cancel(id);this.options.vault.clear(id);this.states.set(id,{connectionId:id,status:'signed_out',message:'已清除本机登录；服务商账号中的授权可在其管理页面撤销'});return this.states.get(id)!;}
 invalidate(id:string){this.disconnect(id);this.states.delete(id);}
 close(){for(const id of [...this.sessions.keys()])this.cancel(id);}
 private cleanup(id:string,session:Session){clearTimeout(session.timer);session.server?.close();session.server?.closeAllConnections();if(this.sessions.get(id)===session)this.sessions.delete(id);}
 private networkOptions(connection:McpConnection,signal?:AbortSignal){
  const binding=mcpNetworkBinding(connection),generation=this.options.vault.generation(connection.id);
  return{connectionId:connection.id,binding:mcpBinding(connection),grant:mcpNetworkGrant(connection),signal,resolve:this.options.resolve,fetch:this.options.fetch,fixtureOrigin:this.options.allowLocalFixture?new URL(connection.url!).origin:undefined,assertCurrent:()=>{const current=this.options.current(connection.id);if(!current?.enabled||mcpNetworkBinding(current)!==binding||this.options.vault.generation(connection.id)!==generation)throw new McpSafeError('cancelled','连接权限已变更或登录已取消，操作已停止');}};
 }
 transportFetch(connection:McpConnection,signal?:AbortSignal){return createAuthorizedOAuthFetch(this.networkOptions(connection,signal));}
 private provider(connection:McpConnection,redirectUrl:string,interactive?:{session:Session;state:string;setAuthorizationOrigin:(origin:string)=>void}):OAuthClientProvider{
  let saved=interactive?undefined:this.options.vault.read(connection);let client:OAuthClientInformationMixed|undefined=saved?.client,tokens:OAuthTokens|undefined=saved?.tokens,verifier='';
  const generation=this.options.vault.generation(connection.id);
  const assertCurrent=()=>{const current=this.options.current(connection.id);if(!current?.enabled||mcpNetworkBinding(current)!==mcpNetworkBinding(connection)||this.options.vault.generation(connection.id)!==generation)throw new McpSafeError('cancelled','登录已取消、凭据已注销或连接已变更');};
  const persist=()=>{if(interactive)return;assertCurrent();this.options.vault.write(connection,{client,tokens,redirectUrl});};
  const provider:OAuthClientProvider={
   redirectUrl,clientMetadata:{client_name:'Slash',redirect_uris:[redirectUrl],grant_types:['authorization_code','refresh_token'],response_types:['code'],token_endpoint_auth_method:'none'},
   state:()=>interactive?.state??randomUUID(),clientInformation:()=>{assertCurrent();return client;},saveClientInformation:value=>{assertCurrent();client=value;persist();},tokens:()=>{assertCurrent();return tokens;},
   saveTokens:value=>{assertCurrent();tokens=value;if(interactive){if(interactive.session.abort.signal.aborted||this.sessions.get(connection.id)!==interactive.session)throw new McpSafeError('cancelled','连接已变更或登录已取消');this.options.vault.write(connection,{client,tokens,redirectUrl});}else persist();},
   redirectToAuthorization:async url=>{assertCurrent();if(!interactive)throw new McpSafeError('needs_auth','需要在连接页面点击“网页登录”');await resolveAuthorizedTarget(url,this.networkOptions(connection,interactive.session.abort.signal));if(url.searchParams.get('state')!==interactive.state)throw new McpSafeError('oauth_failed','授权状态校验失败');assertCurrent();interactive.setAuthorizationOrigin(url.origin);await this.options.openExternal(url.href);},
   saveCodeVerifier:value=>{verifier=value;},codeVerifier:()=>{if(!verifier)throw new McpSafeError('oauth_failed','登录会话已过期');return verifier;},
   invalidateCredentials:scope=>{if(scope==='all'||scope==='client')client=undefined;if(scope==='all'||scope==='tokens')tokens=undefined;if(scope==='all'||scope==='verifier')verifier='';persist();},
  };return provider;
 }
 /** Background transports may refresh existing tokens, but never start DCR or open a browser when signed out. */
 transportProvider(connection:McpConnection){if(!this.enabled(connection))return;const saved=this.options.vault.read(connection);if(!saved?.tokens)return;return this.provider(connection,saved.redirectUrl??'http://127.0.0.1/callback');}
 async login(connection:McpConnection){
  if(!this.enabled(connection)||!connection.enabled)throw new McpSafeError('oauth_failed','请先保存并启用 OAuth HTTP 连接');
  await resolveAuthorizedTarget(connection.url!,this.networkOptions(connection));this.options.vault.assertAvailable();this.options.vault.read(connection);this.cancel(connection.id);
  const session:Session={binding:mcpNetworkBinding(connection),abort:new AbortController(),status:{connectionId:connection.id,status:'pending',message:'请在浏览器完成登录；可以随时取消'}};
  this.sessions.set(connection.id,session);this.states.delete(connection.id);
  // The SDK owns metadata discovery, DCR, PKCE and token exchange. We only bind its callback to this one local session.
  void this.run(connection,session).catch(error=>{if(!session.abort.signal.aborted&&this.sessions.get(connection.id)===session)this.states.set(connection.id,{connectionId:connection.id,status:'error',message:safeMcpMessage(error)});}).finally(()=>this.cleanup(connection.id,session));
  return session.status;
 }
 private async run(connection:McpConnection,session:Session){
  const state=randomUUID(),callbackPath=`/mcp-oauth/${randomUUID()}`;
  let complete!:(code:string)=>void;const callback=new Promise<string>((resolve,reject)=>{complete=resolve;session.reject=reject;});void callback.catch(()=>{});
  let received=false;
  const server=http.createServer((req,res)=>{
   res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','text/plain; charset=utf-8');res.setHeader('Content-Security-Policy',"default-src 'none'; frame-ancestors 'none'");
   const url=new URL(req.url??'/', 'http://127.0.0.1');
   if(req.method!=='GET'||url.pathname!==callbackPath||url.searchParams.get('state')!==state||received){res.writeHead(400);res.end('登录回调无效');return;}
   if(url.searchParams.has('error')){received=true;res.end('登录未完成，请返回 Slash');session.reject?.(new McpSafeError('oauth_failed','服务商未批准登录'));return;}
   const code=url.searchParams.get('code');if(!code||code.length>8192){res.writeHead(400);res.end('登录回调缺少授权码');return;}
   received=true;res.end('已收到登录确认，请返回 Slash 查看结果');complete(code);
  });session.server=server;
  await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  if(session.abort.signal.aborted)return;
  const address=server.address();if(!address||typeof address==='string')throw new McpSafeError('oauth_failed','无法创建本机登录回调');
  const redirectUrl=`http://127.0.0.1:${address.port}${callbackPath}`;
  const provider=this.provider(connection,redirectUrl,{session,state,setAuthorizationOrigin:()=>{}});
  const fetchFn=this.transportFetch(connection,session.abort.signal);
  session.timer=setTimeout(()=>{session.abort.abort();session.reject?.(new McpSafeError('cancelled','登录超时'));this.states.set(connection.id,{connectionId:connection.id,status:'error',message:'登录超时，请重新登录'});this.cleanup(connection.id,session);},this.options.timeoutMs??300_000);session.timer.unref();
  const result=await auth(provider,{serverUrl:connection.url!,fetchFn});
  if(result==='REDIRECT'){const code=await callback;const completed=await auth(provider,{serverUrl:connection.url!,authorizationCode:code,fetchFn});if(completed!=='AUTHORIZED')throw new McpSafeError('oauth_failed','登录未完成');}
  const current=this.options.current(connection.id);
  if(session.abort.signal.aborted||this.sessions.get(connection.id)!==session||!current?.enabled||mcpNetworkBinding(current)!==session.binding)return;
  this.states.set(connection.id,{connectionId:connection.id,status:'authenticated',message:'网页登录完成，请运行连接测试'});
 }
}
export {UnauthorizedError};
