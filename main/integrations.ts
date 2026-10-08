import {spawn} from 'node:child_process';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type {Connection,OperationStatus} from '../shared/types.js';

const MAX_OUTPUT=5_000_000;

export class ExternalCallError extends Error {
 constructor(public outcome:'failed'|'outcome_unknown',message:string){super(message);this.name='ExternalCallError';}
}

export function validateExecutable(command:string){
 if(!command.trim()||/[\0\r\n]/.test(command))throw new ExternalCallError('failed','可执行文件路径无效');
 if(/[.](?:cmd|bat|ps1)$/i.test(command.trim()))throw new ExternalCallError('failed','不支持 .cmd、.bat 或 .ps1 包装器；请选择可直接启动的 .exe 文件');
}

function record(value:unknown):Record<string,unknown>|undefined{return value!==null&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:undefined;}
function readPath(source:unknown,path:string[]):unknown{let cursor:unknown=source;for(const key of path){const next=record(cursor);if(!next)return undefined;cursor=next[key];}return cursor;}

export function classifyReceipt(receipt:unknown):{status:Extract<OperationStatus,'succeeded'|'failed'|'outcome_unknown'>;diagnostic:string;remoteId?:string;url?:string}{
 const candidates=[receipt,readPath(receipt,['data']),readPath(receipt,['result']),readPath(receipt,['structuredContent'])];
 const objects=candidates.map(record).filter((item):item is Record<string,unknown>=>!!item);
 const statusValues=objects.flatMap(item=>[item.status,item.state]).filter((item):item is string=>typeof item==='string').map(item=>item.toLowerCase());
 const unknownStatuses=['pending','processing','queued','partial','partial_success','unknown','commit_unknown','accepted','in_progress'];
 const hasUnknownState=statusValues.some(item=>unknownStatuses.includes(item))||objects.some(item=>typeof item.code==='number'&&item.code!==0);
 const explicitFailure=objects.some(item=>item.success===false||item.ok===false||item.isError===true||Boolean(item.error))||statusValues.some(item=>['failed','failure','error','rejected','cancelled','unauthorized','forbidden','invalid','invalid_request'].includes(item));
 const explicitSuccess=objects.some(item=>item.success===true||item.ok===true||item.code===0)||statusValues.some(item=>['succeeded','success','completed','complete','ok','published','created','updated'].includes(item));
 const remoteId=objects.map(item=>item.remoteId??item.documentId??item.docId??item.id).find((item):item is string=>typeof item==='string'&&item.length>0);
 const url=objects.map(item=>item.url??item.link).find((item):item is string=>typeof item==='string'&&/^https?:\/\//i.test(item));
 if(hasUnknownState)return{status:'outcome_unknown',diagnostic:'远端回执显示操作仍在处理、仅部分完成或结果未知；请核对远端后再决定是否重试',remoteId,url};
 if(explicitFailure)return{status:'failed',diagnostic:'远端回执明确报告失败',remoteId,url};
 if(explicitSuccess)return{status:'succeeded',diagnostic:'远端回执包含明确成功状态',remoteId,url};
 return{status:'outcome_unknown',diagnostic:'已收到结构化回执，但其中没有可确认业务成功的状态字段；请核对远端后再决定是否重试',remoteId,url};
}

export function runCli(executable:string,args:string[],content:string,cwd:string):Promise<unknown>{
 validateExecutable(executable);
 if(args.some(arg=>typeof arg!=='string'||arg.length>4000||/[\0\r\n]/.test(arg)))return Promise.reject(new ExternalCallError('failed','CLI 参数无效'));
 return new Promise((resolve,reject)=>{
  const child=spawn(executable,args,{cwd,windowsHide:true,shell:false,stdio:['pipe','pipe','pipe']});
  let stdout='',stderr='',timedOut=false,overflow=false,settled=false;
  const finish=(fn:()=>void)=>{if(settled)return;settled=true;clearTimeout(timeout);fn();};
  const timeout=setTimeout(()=>{timedOut=true;child.kill();},90_000);
  child.stdout.on('data',buffer=>{stdout+=buffer.toString();if(stdout.length>MAX_OUTPUT){overflow=true;child.kill();}});
  child.stderr.on('data',buffer=>{if(stderr.length<50_000)stderr+=(buffer.toString().slice(0,50_000-stderr.length));});
  child.on('error',error=>finish(()=>reject(new ExternalCallError('failed','无法启动 CLI：'+error.message))));
  child.on('close',code=>finish(()=>{
   if(timedOut)return reject(new ExternalCallError('outcome_unknown','调用超时，远端可能已接受请求；请核对远端，不要重复创建'));
   if(overflow)return reject(new ExternalCallError('outcome_unknown','CLI 返回内容超过 5 MB，进程已停止；请核对远端结果'));
   if(code!==0)return reject(new ExternalCallError('outcome_unknown','CLI 以非零状态退出，远端写入结果无法据此确认：'+(stderr.trim().slice(0,1200)||`退出码 ${code}`)));
   try{resolve(JSON.parse(stdout));}catch{reject(new ExternalCallError('outcome_unknown','CLI 未返回 JSON 回执，无法确认远端结果；请核对远端'))}
  }));
  child.stdin.on('error',()=>{});
  child.stdin.end(content);
 });
}

function validateMcpArgs(value:unknown,depth=0):void{
 if(depth>10)throw new ExternalCallError('failed','MCP 参数嵌套过深');
 if(typeof value==='string'&&value.length>50_000)throw new ExternalCallError('failed','MCP 参数字符串过长');
 if(Array.isArray(value)){if(value.length>1000)throw new ExternalCallError('failed','MCP 参数数组过长');for(const item of value)validateMcpArgs(item,depth+1);return;}
 if(value&&typeof value==='object')for(const [key,item] of Object.entries(value)){if(['__proto__','prototype','constructor'].includes(key))throw new ExternalCallError('failed','MCP 参数包含不安全字段');validateMcpArgs(item,depth+1);}
}

export async function mcpCall(connection:Connection,name:string,args:Record<string,unknown>){
 if(!/^[\w./:-]{1,200}$/.test(name))throw new ExternalCallError('failed','MCP 工具名称无效');
 validateMcpArgs(args);
 if(JSON.stringify(args).length>100_000)throw new ExternalCallError('failed','MCP 参数超过 100 KB');
 if(connection.url&&!/^https?:\/\//i.test(connection.url))throw new ExternalCallError('failed','MCP 仅支持 HTTP 或 HTTPS 地址');
 if(connection.command)validateExecutable(connection.command);
 const client=new Client({name:'slash',version:'0.1.0'});let invoked=false;
 try{
  await client.connect(connection.url?new StreamableHTTPClientTransport(new URL(connection.url)):new StdioClientTransport({command:connection.command,args:connection.args,stderr:'pipe'}));
  const catalog=await client.listTools();
  if(!catalog.tools.some(tool=>tool.name===name))throw new ExternalCallError('failed','工具不在服务声明的能力列表中');
  invoked=true;
  return await client.callTool({name,arguments:args},undefined,{timeout:90_000});
 }catch(error){
  if(error instanceof ExternalCallError)throw error;
  const message=error instanceof Error?error.message:String(error);
  throw new ExternalCallError(invoked?'outcome_unknown':'failed',(invoked?'MCP 调用结果未知：':'MCP 连接或能力检查失败：')+message);
 }finally{await client.close().catch(()=>{});}
}
