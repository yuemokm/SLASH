import {spawn} from 'node:child_process';
import {lookup} from 'node:dns/promises';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import {randomUUID} from 'node:crypto';
import type {ApprovalRequest,PermissionCapability,PermissionDecision,PermissionSettings,PermissionMode,AgentMode} from '../shared/types.js';
import {toolApprovalTimeoutMs,type ApprovalResolutionResult} from '../shared/approval.js';

const MAX_WEB_BYTES=2_000_000;
const MAX_PROCESS_BYTES=2_000_000;
const MAX_REDIRECTS=5;
const WEB_TIMEOUT_MS=20_000;
const PROCESS_TIMEOUT_MS=120_000;
const APPROVAL_TIMEOUT_MS=toolApprovalTimeoutMs;
const SENSITIVE_QUERY=/^(?:access_?token|api_?key|auth|authorization|client_?secret|credential|key|password|secret|signature|token|x-amz-(?:credential|security-token|signature))$/i;

export type ApprovalResolution='allow_once'|'allow'|'deny';
export type ApprovalRecord=ApprovalRequest&{status:ApprovalRequest['status']|'cancelled'|'expired';resolvedAt?:string;reason?:string};
type Waiter={resolve:()=>void;reject:(error:Error)=>void;timer:NodeJS.Timeout};

function capabilityError(code:string,message:string){return Error(`${code}: ${message}`);}
function now(){return new Date().toISOString();}
function isBlockedV4(address:string){
 const parts=address.split('.').map(Number);if(parts.length!==4||parts.some(part=>!Number.isInteger(part)||part<0||part>255))return true;
 const [a,b]=parts;
 return a===0||a===10||a===127||a>=224||(a===100&&b>=64&&b<=127)||(a===169&&b===254)||(a===172&&b>=16&&b<=31)||(a===192&&b===0)||(a===192&&b===168)||(a===198&&b>=18&&b<=19);
}
function isBlockedAddress(address:string){
 const version=net.isIP(address);if(version===4)return isBlockedV4(address);if(version!==6)return true;
 const normalized=address.toLowerCase().split('%')[0];
 if(normalized==='::'||normalized==='::1'||normalized.startsWith('fc')||normalized.startsWith('fd')||/^fe[89ab]/.test(normalized)||normalized.startsWith('::ffff:'))return true;
 const first=Number.parseInt(normalized.split(':')[0]||'0',16);
 return !(first>=0x2000&&first<=0x3fff)||normalized.startsWith('2001:db8:');
}
async function resolvePublicAddress(hostname:string,deadlineAt:number,signal?:AbortSignal){
 hostname=hostname.replace(/^\[|\]$/g,'');const direct=net.isIP(hostname);if(direct){if(isBlockedAddress(hostname))throw capabilityError('NETWORK_TARGET_DENIED','目标是本机、内网、链路本地或保留地址');return{address:hostname,family:direct as 4|6};}
 const remaining=deadlineAt-Date.now();if(remaining<=0)throw capabilityError('TIMEOUT','网页读取超过 20 秒');let timer:NodeJS.Timeout|undefined;
 let abort:((()=>void))|undefined;const aborted=new Promise<never>((_,reject)=>{abort=()=>reject(capabilityError('CANCELLED','网页读取已取消'));if(signal?.aborted)abort();else signal?.addEventListener('abort',abort,{once:true});});
 const addresses=await Promise.race([lookup(hostname,{all:true,verbatim:true}),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(capabilityError('TIMEOUT','网页域名解析超时')),remaining);}),aborted]).finally(()=>{if(timer)clearTimeout(timer);if(abort)signal?.removeEventListener('abort',abort);});
 if(!addresses.length||addresses.some(item=>isBlockedAddress(item.address)))throw capabilityError('NETWORK_TARGET_DENIED','目标解析到本机、内网、链路本地或保留地址');
 return addresses[0];
}
function validateWebUrl(input:string){
 let url:URL;try{url=new URL(input)}catch{throw capabilityError('VALIDATION_FAILED','网页地址无效');}
 if(!['http:','https:'].includes(url.protocol))throw capabilityError('VALIDATION_FAILED','网页阅读只支持 HTTP 或 HTTPS');
 if(url.username||url.password)throw capabilityError('CREDENTIAL_LEAK_BLOCKED','网页地址不能包含用户名或密码');
 if(url.hostname.toLowerCase()==='localhost'||url.hostname.endsWith('.local'))throw capabilityError('NETWORK_TARGET_DENIED','不允许访问本机或局域网名称');
 for(const key of url.searchParams.keys())if(SENSITIVE_QUERY.test(key))throw capabilityError('CREDENTIAL_LEAK_BLOCKED',`网页地址包含可能泄露凭据的参数 ${key}`);
 if(url.port&&url.port!=='80'&&url.port!=='443')throw capabilityError('NETWORK_TARGET_DENIED','网页阅读只允许标准 HTTP/HTTPS 端口');
 return url;
}

export type WebReadResult={url:string;status:number;contentType:string;title?:string;text:string;bytes:number;truncated:false};
export async function readPublicWebPage(input:string,signal?:AbortSignal,redirects=0,deadlineAt=Date.now()+WEB_TIMEOUT_MS):Promise<WebReadResult>{
 const url=validateWebUrl(input);if(signal?.aborted)throw capabilityError('CANCELLED','网页读取已取消');const selected=await resolvePublicAddress(url.hostname,deadlineAt,signal);
 return await new Promise<WebReadResult>((resolve,reject)=>{
  let settled=false;const finish=(fn:()=>void)=>{if(settled)return;settled=true;signal?.removeEventListener('abort',abort);fn();};
  const abort=()=>{request.destroy(capabilityError('CANCELLED','网页读取已取消'));};
  const transport=url.protocol==='https:'?https:http;
  const request=transport.request(url,{method:'GET',headers:{Accept:'text/html,application/xhtml+xml,application/json,text/plain,application/xml,text/xml;q=0.9,*/*;q=0.1','User-Agent':'slash/0.1'},lookup:(_hostname,_options,callback)=>callback(null,selected.address,selected.family)},response=>{
   const status=response.statusCode??0;
   if(status>=300&&status<400&&response.headers.location){response.resume();if(redirects>=MAX_REDIRECTS)return finish(()=>reject(capabilityError('TOO_MANY_REDIRECTS','网页重定向次数超过限制')));let next:string;try{next=new URL(response.headers.location,url).toString()}catch{return finish(()=>reject(capabilityError('VALIDATION_FAILED','网页返回无效重定向地址')));}return finish(()=>{void readPublicWebPage(next,signal,redirects+1,deadlineAt).then(resolve,reject);});}
   if(status<200||status>=300){response.resume();return finish(()=>reject(capabilityError('HTTP_ERROR',`网页返回 HTTP ${status}`)));}
   const contentType=String(response.headers['content-type']??'').toLowerCase();if(!/(?:^|[;/\s])(?:text\/|application\/(?:json|xml|xhtml\+xml|javascript))/.test(contentType)){response.resume();return finish(()=>reject(capabilityError('UNSUPPORTED_CONTENT_TYPE',`网页内容类型不支持：${contentType||'unknown'}`)));}
   const declared=Number(response.headers['content-length']??0);if(Number.isFinite(declared)&&declared>MAX_WEB_BYTES){response.resume();return finish(()=>reject(capabilityError('RESPONSE_TOO_LARGE','网页内容超过 2 MB')));}
   const chunks:Buffer[]=[];let bytes=0;response.on('data',(chunk:Buffer)=>{bytes+=chunk.length;if(bytes>MAX_WEB_BYTES){request.destroy(capabilityError('RESPONSE_TOO_LARGE','网页内容超过 2 MB'));return;}chunks.push(chunk);});
   response.on('aborted',()=>finish(()=>reject(capabilityError('NETWORK_ERROR','网页响应在完成前中断'))));response.on('error',error=>finish(()=>reject(error)));
   response.on('end',()=>finish(()=>{const text=Buffer.concat(chunks).toString('utf8');const title=contentType.includes('html')?text.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/\s+/g,' ').trim():undefined;resolve({url:url.toString(),status,contentType,title,text,bytes,truncated:false});}));
  });
  request.setTimeout(Math.max(1,deadlineAt-Date.now()),()=>request.destroy(capabilityError('TIMEOUT','网页读取超过 20 秒')));
  request.on('error',error=>finish(()=>reject(error)));
  if(signal){if(signal.aborted)return abort();signal.addEventListener('abort',abort,{once:true});}
  request.end();
 });
}

export type ProcessResult={executable:string;args:string[];cwd:string;exitCode:number|null;signal:string|null;stdout:string;stderr:string;durationMs:number;status:'succeeded'|'failed'|'outcome_unknown'};
function redactProcessOutput(value:string){return value
 .replace(/\b(?:gh[pousr]|github_pat)_[A-Za-z0-9_]{20,}\b/g,'[REDACTED_TOKEN]')
 .replace(/\b(?:sk|pk)-[A-Za-z0-9_-]{16,}\b/g,'[REDACTED_TOKEN]')
 .replace(/((?:api[_-]?key|access[_-]?token|authorization|client[_-]?secret|password|secret)\s*[:=]\s*)[^\s,;]+/gi,'$1[REDACTED]');}
function validateProcessInput(executable:string,args:string[],cwd:string){
 if(!executable.trim()||/[\0\r\n]/.test(executable))throw capabilityError('VALIDATION_FAILED','可执行文件无效');
 if(/[.](?:cmd|bat|ps1)$/i.test(executable.trim()))throw capabilityError('VALIDATION_FAILED','run_process 不接受脚本包装器；PowerShell 请使用 powershell.exe 与参数数组');
 if(!cwd.trim()||/[\0\r\n]/.test(cwd))throw capabilityError('VALIDATION_FAILED','工作目录无效');
 if(args.length>200||args.some(arg=>typeof arg!=='string'||arg.length>8000||/[\0]/.test(arg)))throw capabilityError('VALIDATION_FAILED','进程参数无效或过长');
}
export function runControlledProcess(executable:string,args:string[],cwd:string,signal?:AbortSignal,timeoutMs=PROCESS_TIMEOUT_MS):Promise<ProcessResult>{
 validateProcessInput(executable,args,cwd);const started=Date.now();
 return new Promise((resolve,reject)=>{
  let stdout='',stderr='',overflow=false,timedOut=false,aborted=false,settled=false;
  const child=spawn(executable,args,{cwd,windowsHide:true,shell:false,stdio:['ignore','pipe','pipe'],env:{PATH:process.env.PATH??'',SystemRoot:process.env.SystemRoot??'',WINDIR:process.env.WINDIR??'',TEMP:process.env.TEMP??'',TMP:process.env.TMP??'',COMSPEC:process.env.COMSPEC??''}});
  const terminate=()=>{if(child.pid&&process.platform==='win32'){const killer=spawn('taskkill.exe',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,shell:false,stdio:'ignore'});killer.unref();}else child.kill('SIGTERM');};
  const abort=()=>{aborted=true;terminate();};const timer=setTimeout(()=>{timedOut=true;terminate();},Math.min(Math.max(timeoutMs,1000),PROCESS_TIMEOUT_MS));
  const finish=(fn:()=>void)=>{if(settled)return;settled=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);fn();};
  const append=(kind:'stdout'|'stderr',chunk:Buffer)=>{const value=chunk.toString();if(kind==='stdout')stdout+=value;else stderr+=value;if(Buffer.byteLength(stdout)+Buffer.byteLength(stderr)>MAX_PROCESS_BYTES){overflow=true;terminate();}};
  child.stdout.on('data',(chunk:Buffer)=>append('stdout',chunk));child.stderr.on('data',(chunk:Buffer)=>append('stderr',chunk));
  child.on('error',error=>finish(()=>reject(capabilityError('PROCESS_START_FAILED',error.message))));
  child.on('close',(exitCode,closeSignal)=>finish(()=>{
   const base={executable,args,cwd,exitCode,signal:closeSignal,stdout:redactProcessOutput(stdout.slice(0,MAX_PROCESS_BYTES)),stderr:redactProcessOutput(stderr.slice(0,MAX_PROCESS_BYTES)),durationMs:Date.now()-started};
   if(aborted||timedOut||overflow)return resolve({...base,status:'outcome_unknown'});
   resolve({...base,status:exitCode===0?'succeeded':'failed'});
  }));
  if(signal){if(signal.aborted)abort();else signal.addEventListener('abort',abort,{once:true});}
 });
}

export class CapabilityApprovalBroker {
 private waiters=new Map<string,Waiter>();
 private controllers=new Map<string,Set<AbortController>>();
 constructor(private getPermissions:()=>PermissionSettings,private records:ApprovalRecord[],private persist:()=>void,private setPermission?:(capability:PermissionCapability,decision:PermissionDecision)=>void,private isRunActive?:(runId:string)=>boolean,private getRunMode?:(runId:string)=>PermissionMode|undefined,private getAgentMode?:(runId:string)=>AgentMode|undefined){
  for(const record of records)if(record.status==='pending'){record.status='expired';record.resolvedAt=now();record.reason='应用重启后不自动恢复旧审批等待';}
  persist();
 }
 list(conversationId?:string){for(const record of this.records)if(record.status==='pending')this.checkPending(record);return this.records.filter(record=>record.status==='pending'&&(!conversationId||record.conversationId===conversationId)).map(record=>({...record,details:record.details?{...record.details}:undefined}));}
 private decision(capability:PermissionCapability,runId?:string):PermissionDecision{const base=this.getPermissions()[capability]??'ask';const mode=runId&&this.getRunMode?.(runId);if(base==='deny')return'deny';if(mode==='full_access'||(mode==='accept_edits'&&capability==='artifact_write'))return'allow';return base;}
 async authorize(input:{runId:string;conversationId:string;capability:PermissionCapability;summary:string;details?:Record<string,unknown>}):Promise<void>{
  if(this.getAgentMode?.(input.runId)==='plan'&&!['workspace_read','web_read'].includes(input.capability))throw capabilityError('PLAN_TOOL_DENIED','研究型方案模式只允许只读资料和网页工具');
  if(this.isRunActive&&!this.isRunActive(input.runId))throw capabilityError('CANCELLED','任务已不再运行');
  const current=this.decision(input.capability,input.runId);if(current==='deny')throw capabilityError('PERMISSION_DENIED',`${input.capability} 已禁用`);if(current==='allow')return;
  const details=input.details?structuredClone(input.details):undefined;const record:ApprovalRecord={id:randomUUID(),runId:input.runId,conversationId:input.conversationId,capability:input.capability,summary:input.summary.slice(0,500),details,status:'pending',createdAt:now()};this.records.unshift(record);
  await new Promise<void>((resolve,reject)=>{const timer=setTimeout(()=>this.finish(record,'expired',capabilityError('APPROVAL_TIMEOUT','等待授权超时')),APPROVAL_TIMEOUT_MS);this.waiters.set(record.id,{resolve,reject,timer});this.persist();});
  if(this.decision(input.capability,input.runId)==='deny')throw capabilityError('PERMISSION_DENIED',`${input.capability} 在执行前已禁用`);if(this.isRunActive&&!this.isRunActive(input.runId))throw capabilityError('CANCELLED','任务已不再运行');
 }
 resolve(id:string,resolution:ApprovalResolution,reason?:string):ApprovalResolutionResult{
  const record=this.records.find(item=>item.id===id);if(!record)throw capabilityError('APPROVAL_UNAVAILABLE','这条授权请求已不可用，请刷新任务状态；没有执行操作或更改权限');
  if(record.status==='pending')this.checkPending(record);
  if(record.status!=='pending')return this.resolutionResult(record,false);
  if(resolution==='deny'){this.finish(record,'denied',capabilityError('PERMISSION_DENIED',reason?.slice(0,500)||'用户拒绝授权'));return this.resolutionResult(record,true);}
  if(resolution==='allow'){this.setPermission?.(record.capability,'allow');}
  this.finish(record,'allowed');return this.resolutionResult(record,true,resolution==='allow');
 }
 private resolutionResult(record:ApprovalRecord,changed:boolean,remembered=false):ApprovalResolutionResult{
  const outcome=changed?'resolved':record.status==='expired'?'expired':record.status==='cancelled'?'cancelled':record.status==='allowed'||record.status==='denied'?'already_resolved':'unavailable';
  const message=changed?(record.status==='denied'?'已拒绝这次工具调用':remembered?'已允许并记住此选择':'已允许这一次'):record.status==='expired'?'这条授权请求已过期，请从任务中继续；没有执行操作或更改权限':record.status==='cancelled'?'任务已取消，这条授权请求已结束；没有执行操作或更改权限':record.status==='allowed'?'这条请求已获授权，无需重复操作':record.status==='denied'?'这条请求已被拒绝，请从任务中继续':'这条授权请求已不可用，请刷新任务状态';
  return{...record,details:record.details?structuredClone(record.details):undefined,outcome,message};
 }
 private checkPending(record:ApprovalRecord){
  if(!this.waiters.has(record.id)){this.finish(record,'expired',capabilityError('APPROVAL_EXPIRED','这条授权请求已经没有等待中的工具调用'));return;}
  if(record.runId&&this.isRunActive&&!this.isRunActive(record.runId)){this.finish(record,'cancelled',capabilityError('CANCELLED','任务已不再运行'));return;}
  const createdAt=Date.parse(record.createdAt);if(!Number.isFinite(createdAt)||Date.now()>=createdAt+APPROVAL_TIMEOUT_MS){this.finish(record,'expired',capabilityError('APPROVAL_TIMEOUT','等待授权超时'));return;}
  if(record.runId&&this.getAgentMode?.(record.runId)==='plan'&&!['workspace_read','web_read'].includes(record.capability)){this.finish(record,'denied',capabilityError('PLAN_TOOL_DENIED','研究型方案模式只允许只读资料和网页工具'));return;}
  if(this.decision(record.capability,record.runId)==='deny')this.finish(record,'denied',capabilityError('PERMISSION_DENIED',`${record.capability} 已禁用`));
 }
 policyChanged(capability:PermissionCapability){
  for(const record of this.records.filter(item=>item.status==='pending'&&item.capability===capability)){this.checkPending(record);if(record.status==='pending'&&this.decision(capability,record.runId)==='allow')this.finish(record,'allowed');}
 }
 dispose(){for(const runId of new Set([...this.records.filter(record=>record.status==='pending').map(record=>record.runId).filter((id):id is string=>Boolean(id)),...this.controllers.keys()]))this.cancelRun(runId,'应用已关闭，旧授权请求不再执行');}
 cancelRun(runId:string,reason='任务已取消'){
  for(const record of this.records.filter(item=>item.status==='pending'&&item.runId===runId))this.finish(record,'cancelled',capabilityError('CANCELLED',reason));
  for(const controller of this.controllers.get(runId)??[])controller.abort();this.controllers.delete(runId);
 }
 async execute<T>(input:{runId:string;conversationId:string;capability:PermissionCapability;summary:string;details?:Record<string,unknown>},fn:(signal:AbortSignal)=>Promise<T>):Promise<T>{
  await this.authorize(input);if(this.decision(input.capability,input.runId)==='deny')throw capabilityError('PERMISSION_DENIED',`${input.capability} 在派发前已禁用`);
  if(this.isRunActive&&!this.isRunActive(input.runId))throw capabilityError('CANCELLED','任务已不再运行');
  const controller=new AbortController();const set=this.controllers.get(input.runId)??new Set<AbortController>();set.add(controller);this.controllers.set(input.runId,set);
  try{return await fn(controller.signal);}finally{set.delete(controller);if(!set.size)this.controllers.delete(input.runId);}
 }
 private finish(record:ApprovalRecord,status:'allowed'|'denied'|'cancelled'|'expired',error?:Error){
  if(record.status!=='pending')return;record.status=status;record.resolvedAt=now();if(error)record.reason=error.message.slice(0,1000);const waiter=this.waiters.get(record.id);if(waiter){clearTimeout(waiter.timer);this.waiters.delete(record.id);if(error)waiter.reject(error);else waiter.resolve();}this.persist();
 }
}
