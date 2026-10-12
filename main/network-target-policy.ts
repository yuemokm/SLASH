import {lookup} from 'node:dns/promises';
import {isIP} from 'node:net';
import {Agent} from 'undici';
import {McpSafeError} from './mcp-errors.js';

/** Host-owned grant: metadata and model output cannot create one. */
export type NetworkGrant={connectionId:string;binding:string;allowedOrigins:string[];allowPrivate:boolean;revision:string};
export type ResolvedAddress={address:string;family:4|6};
export type NetworkPolicyOptions={connectionId:string;binding:string;grant?:NetworkGrant;assertCurrent?:()=>void;signal?:AbortSignal;fixtureOrigin?:string;resolve?:(hostname:string)=>Promise<ResolvedAddress[]>;fetch?:typeof fetch};
type AddressScope='public'|'private'|'forbidden';
const denied=()=>new McpSafeError('oauth_failed','登录服务请求访问未授权的内部或不安全地址，已停止；请检查连接中的允许地址');

function v4Scope(address:string):AddressScope{
 const [a,b,c]=address.split('.').map(Number);
 if(a===10||(a===172&&b>=16&&b<=31)||(a===192&&b===168))return 'private';
 if(a===0||a===127||a>=224||(a===100&&b>=64&&b<=127)||(a===169&&b===254)||(a===192&&b===0&&(c===0||c===2))||(a===192&&b===88&&c===99)||(a===198&&(b===18||b===19))||(a===198&&b===51&&c===100)||(a===203&&b===0&&c===113))return 'forbidden';
 return 'public';
}
function ipv6Words(address:string){
 const halves=address.toLowerCase().split('::');
 const words=(value:string)=>value?value.split(':').flatMap(part=>part.includes('.')?(()=>{const p=part.split('.').map(Number);return[(p[0]<<8)|p[1],(p[2]<<8)|p[3]];})():[parseInt(part,16)]):[];
 const left=words(halves[0]),right=words(halves[1]??'');return halves.length===2?[...left,...Array(8-left.length-right.length).fill(0),...right]:left;
}
/** Mapped IPv6 receives exactly the underlying IPv4 classification. */
export function networkAddressScope(address:string):AddressScope{
 const family=isIP(address);if(family===4)return v4Scope(address);if(family!==6||address.includes('%'))return 'forbidden';
 const words=ipv6Words(address);
 if(words.slice(0,5).every(word=>word===0)&&words[5]===0xffff)return v4Scope(`${words[6]>>8}.${words[6]&255}.${words[7]>>8}.${words[7]&255}`);
 if((words[0]&0xfe00)===0xfc00)return 'private';
 if((words[0]&0xe000)!==0x2000||words[0]===0x2002||(words[0]===0x2001&&(words[1]<0x200||words[1]===0xdb8))||(words[0]===0x3fff&&words[1]<0x1000))return 'forbidden';
 return 'public';
}

export function validateNetworkUrl(input:string|URL,fixtureOrigin?:string){
 let url:URL;try{url=new URL(input);}catch{throw denied();}
 if(url.username||url.password||url.hash||(url.protocol!=='https:'&&!(fixtureOrigin&&url.origin===fixtureOrigin&&url.protocol==='http:')))throw denied();
 return url;
}
export function networkGrantRevision(grant?:NetworkGrant){return JSON.stringify(grant??null);}
export async function resolveAuthorizedTarget(input:string|URL,options:NetworkPolicyOptions){
 options.assertCurrent?.();if(options.signal?.aborted)throw new McpSafeError('cancelled','连接操作已取消');
 const url=validateNetworkUrl(input,options.fixtureOrigin),hostname=url.hostname.replace(/^\[|\]$/g,'');
 const grant=options.grant;
 if(grant&&(grant.connectionId!==options.connectionId||grant.binding!==options.binding||!grant.revision))throw denied();
 const privateAllowed=!!grant?.allowPrivate&&grant.allowedOrigins.includes(url.origin);
 const fixture=options.fixtureOrigin===url.origin&&(hostname==='127.0.0.1'||hostname==='localhost'||hostname.endsWith('.test'));
 let timer:ReturnType<typeof setTimeout>|undefined,abort:(()=>void)|undefined;
 const aborted=new Promise<never>((_,reject)=>{abort=()=>reject(new McpSafeError('cancelled','连接操作已取消'));if(options.signal?.aborted)abort();else options.signal?.addEventListener('abort',abort,{once:true});});
 const resolved=isIP(hostname)?[{address:hostname,family:isIP(hostname) as 4|6}]:await Promise.race([
  (options.resolve??(async name=>await lookup(name,{all:true,verbatim:true}) as ResolvedAddress[]))(hostname),
  new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new McpSafeError('connection_failed','连接地址解析超时')),10_000);}),aborted,
 ]).finally(()=>{clearTimeout(timer);if(abort)options.signal?.removeEventListener('abort',abort);});
 // Direct literals do not await DNS, but still remove the cancellation listener.
 clearTimeout(timer);if(abort)options.signal?.removeEventListener('abort',abort);
 if(!resolved.length||resolved.some(item=>!isIP(item.address)||item.family!==isIP(item.address)||(!(fixture&&item.address==='127.0.0.1')&&(networkAddressScope(item.address)==='forbidden'||(networkAddressScope(item.address)==='private'&&!privateAllowed)))))throw denied();
 options.assertCurrent?.();if(options.signal?.aborted)throw new McpSafeError('cancelled','连接操作已取消');
 return{url,address:resolved[0]};
}

/** Every request re-resolves and pins an accepted address; no automatic redirect or ambient proxy. */
export function createAuthorizedOAuthFetch(options:NetworkPolicyOptions):typeof fetch{
 return async(input,init)=>{
  const signal=init?.signal??(input instanceof Request?input.signal:undefined);
  const combined=signal&&options.signal?AbortSignal.any([signal,options.signal]):signal??options.signal;
  const selected=await resolveAuthorizedTarget(input instanceof Request?input.url:String(input),{...options,signal:combined??undefined});
  const dispatcher=new Agent({connect:{lookup:(_hostname,lookupOptions,callback)=>{const answer=selected.address;if(lookupOptions.all)callback(null,[answer]);else callback(null,answer.address,answer.family);}},headersTimeout:20_000,bodyTimeout:0});
  try{
   options.assertCurrent?.();
   // Node's native fetch accepts native Request objects and the public undici dispatcher API.
   const response=await(options.fetch??globalThis.fetch)(input,{...init,signal:combined,redirect:'manual',dispatcher} as RequestInit);
   options.assertCurrent?.();
   if(response.status>=300&&response.status<400){await response.body?.cancel();throw new McpSafeError('oauth_failed','登录或连接地址发生重定向，已停止；请核对服务地址');}
   // close() drains an already-started body, including streaming MCP responses.
   void dispatcher.close().catch(()=>{});return response;
  }catch(error){await dispatcher.destroy().catch(()=>{});throw error;}
 };
}
