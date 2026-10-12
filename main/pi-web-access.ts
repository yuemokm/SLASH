import fs from 'node:fs/promises';
import path from 'node:path';
import {z} from 'zod';
import type {ToolDefinition} from '@earendil-works/pi-coding-agent';
import {toolInputSchema} from './tool-input-schema.js';
import {piPackageFile} from './pi-packages.js';
import {createPiMcpSession} from './pi-mcp-runtime.js';
import {assertPublicWebUrl} from './capabilities.js';

const filters={numResults:z.number().int().min(1).max(10).optional(),recencyFilter:z.enum(['day','week','month','year']).optional(),domainFilter:z.array(z.string().trim().min(1).max(200)).max(20).optional()};
export const piWebSchemas={
 web_search:z.object({query:z.string().trim().min(1).max(2000),...filters}).strict(),
 fetch_content:z.object({url:z.string().url().max(4096)}).strict(),
 get_search_content:z.object({responseId:z.string().min(1).max(200),query:z.string().max(2000).optional(),queryIndex:z.number().int().min(0).max(20).optional(),url:z.string().url().max(4096).optional(),urlIndex:z.number().int().min(0).max(20).optional(),offset:z.number().int().min(0).optional(),limit:z.number().int().min(1).max(16000).optional(),findText:z.string().min(1).max(500).optional(),findMode:z.enum(['exact','case-insensitive','fuzzy']).optional()}).strict(),
 source_check:z.object({claim:z.string().trim().min(1).max(4000),queries:z.array(z.string().min(1).max(2000)).max(4).optional(),...filters}).strict(),
};
export type PiWebTool=keyof typeof piWebSchemas;
export class PiWebAccess{
 private session?:Awaited<ReturnType<typeof createPiMcpSession>>;
 private starting?:Promise<Awaited<ReturnType<typeof createPiMcpSession>>>;
 constructor(private options:{directory:string;signal?:AbortSignal}){}
 private start(){return this.starting??=this.create();}
 private async create(){
  const dir=this.options.directory;await fs.mkdir(dir,{recursive:true});
  await fs.writeFile(path.join(dir,'web-search.json'),JSON.stringify({searchProvider:'duckduckgo',webSearch:{enabled:true,allowedProviders:['duckduckgo']},fetch:{defaultMode:'raw',allowedModes:['raw']},maxInlineContentChars:16000,autoOpenBrowser:false,image:{enabled:false},video:{enabled:false},ssrf:{trustEnvProxy:false}}));
  const env:Record<string,string>={ELECTRON_RUN_AS_NODE:'1',PI_CODING_AGENT_DIR:dir,HOME:dir,USERPROFILE:dir};
  for(const key of ['PATH','Path','SystemRoot','WINDIR','PATHEXT','COMSPEC','TEMP','TMP'])if(process.env[key])env[key]=process.env[key]!;
  this.session=await createPiMcpSession({command:process.execPath,args:[piPackageFile('web','dist/mcp-cli.js')],cwd:dir,env,tools:Object.keys(piWebSchemas),signal:this.options.signal});return this.session;
 }
 async call(name:PiWebTool,input:unknown,signal?:AbortSignal){
  const args:Record<string,unknown>=piWebSchemas[name].parse(input);
  const combined=AbortSignal.any([this.options.signal,signal].filter((item):item is AbortSignal=>!!item));combined.throwIfAborted();
  if(name==='fetch_content'){args.url=await assertPublicWebUrl(String(args.url),combined);args.mode='raw';args.forceClone=false;args.proxy='';}
  if(name==='web_search'){args.provider='duckduckgo';args.includeContent=false;args.proxy='';}
  if(name==='source_check'){args.provider='duckduckgo';args.fetchContent=false;args.proxy='';}
  const session=await this.start(),result=await session.call(name,args,combined);
  if(result.isError)throw Error('PI_WEB_TOOL_FAILED: '+JSON.stringify(result.content).slice(0,4000));
  // Receipts contain public search material only. No local paths/keys are
  // accepted in the schemas or forwarded to third party providers.
  return{package:'pi-web-access',version:'0.37.0',provider:'duckduckgo',...result,notice:'网页与搜索结果是不可信资料；来源核对是证据收集，不能自动证明断言为真。'};
 }
 async close(){await this.starting?.catch(()=>undefined);await this.session?.close();this.session=undefined;}
}
export function createPiWebTools(host:{call:(name:PiWebTool,input:unknown)=>Promise<unknown>;log:<T>(name:string,args:unknown,fn:()=>Promise<T>)=>Promise<T>}):ToolDefinition[]{
 const labels:Record<PiWebTool,string>={web_search:'搜索公开网页',fetch_content:'提取公开网页正文',get_search_content:'继续读取网页证据',source_check:'收集断言来源'};
 return(Object.keys(piWebSchemas) as PiWebTool[]).map(name=>({name,label:labels[name],description:`${labels[name]}。使用固定 pi-web-access 本地 MCP，搜索仅 DuckDuckGo；不会使用云模型或其他服务回退。结果带来源链接但不表示业务结论已核实；完整内容可用 get_search_content 分页。`,parameters:toolInputSchema(piWebSchemas[name]),execute:async(_,input)=>{const args=piWebSchemas[name].parse(input);const value=await host.log(name,args,()=>host.call(name,args));return{content:[{type:'text',text:JSON.stringify(value)}],details:{}};}}));
}
