import {randomUUID} from 'node:crypto';
import {AsyncLocalStorage} from 'node:async_hooks';
import type {ToolDefinition} from '@earendil-works/pi-coding-agent';
import {createEventBus} from '@earendil-works/pi-coding-agent';
import {loadPiPackage,loadPiPackageDependency} from './pi-packages.js';

type McpResult={content?:unknown[];isError?:boolean;[key:string]:unknown};
type Adapter={ready():Promise<void>;close():Promise<void>;extensionFactory(api:unknown):void};
type AdapterModule={createHostManagedMcpAdapter(options:{servers:Record<string,{createTransport:()=>unknown;tools?:string[]}>;onToolCall:(call:{tool:string;arguments:Record<string,unknown>;dispatch:()=>Promise<McpResult>})=>Promise<McpResult>;requestTimeoutMs:number}):Adapter};
type StdioModule={StdioClientTransport:new(options:{command:string;args:string[];cwd?:string;env?:Record<string,string>;stderr:'pipe'})=>unknown};
type Validator=(input:unknown)=>boolean;
type AjvModule={default:new(options:Record<string,unknown>)=>{compile(schema:unknown):Validator}};
export class PiMcpCallError extends Error{constructor(public delivery:string){super(`MCP_${delivery.toUpperCase()}: 工具未返回可确认回执${delivery==='not_sent'?'，请求未发出':'；请核对效果，勿自动重试'}`);}}

/** SDK2 is resolved from adapter's dependency tree; SDK1 clients are never cast. */
export async function createPiMcpSession(options:{command:string;args:string[];cwd?:string;env?:Record<string,string>;tools?:string[];signal?:AbortSignal;beforeDispatch?:(name:string,args:Record<string,unknown>)=>void|Promise<void>}){
 const [{createHostManagedMcpAdapter},{StdioClientTransport},{default:Ajv}]=await Promise.all([
  loadPiPackage<AdapterModule>('mcp','/host-managed'),loadPiPackageDependency<StdioModule>('mcp','@modelcontextprotocol/client/stdio'),
  loadPiPackageDependency<AjvModule>('mcp','ajv'),
 ]);
 const tools=new Map<string,ToolDefinition>(),validators=new Map<string,Validator>(),ajv=new Ajv({strict:false,validateFormats:false}),events=createEventBus(),calls=new AsyncLocalStorage<{raw?:McpResult}>();
 // The only caller is the already authorized host path. One explicit claim per
 // dispatch, with no resource-following or ambient approvals.
 events.on('pi-mcp-adapter:tool-approval-request',(value:unknown)=>{const request=value as {origin:string;claim:(handler:()=>string)=>void};request.claim(()=>request.origin==='direct'?'allow_once':'deny');});
 const adapter=createHostManagedMcpAdapter({servers:{slash:{createTransport:()=>new StdioClientTransport({command:options.command,args:[...options.args],cwd:options.cwd,env:options.env,stderr:'pipe'}),tools:options.tools}},requestTimeoutMs:90_000,onToolCall:async call=>{await options.beforeDispatch?.(call.tool,call.arguments);const raw=await call.dispatch(),context=calls.getStore();if(context)context.raw=raw;return raw;}});
 const abort=()=>{void adapter.close();};options.signal?.addEventListener('abort',abort,{once:true});
 try{if(options.signal?.aborted)throw Error('CANCELLED');await adapter.ready();adapter.extensionFactory({events,registerTool:(tool:ToolDefinition)=>{validators.set(tool.name,ajv.compile(tool.parameters));tools.set(tool.name,tool);}});}
 catch(error){options.signal?.removeEventListener('abort',abort);await adapter.close();throw error;}
 return{names:()=>[...tools.values()].map(tool=>tool.label.replace(/^MCP: /,'')),async call(name:string,args:Record<string,unknown>,signal?:AbortSignal){const tool=[...tools.values()].find(tool=>tool.label===`MCP: ${name}`);if(!tool)throw Error('MCP_TOOL_NOT_DECLARED');if(!validators.get(tool.name)!(args))throw Error('MCP_ARGUMENTS_INVALID');return calls.run({},async()=>{const result=await tool.execute(randomUUID(),args,signal??options.signal,undefined,undefined as never),raw=calls.getStore()?.raw;if(raw)return raw;const delivery=String((result.details as Record<string,unknown>)?.error??'not_sent');throw new PiMcpCallError(delivery);});},async close(){options.signal?.removeEventListener('abort',abort);await adapter.close();}};
}
