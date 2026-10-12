import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {ElicitRequestSchema,type Tool} from '@modelcontextprotocol/sdk/types.js';
import {createHash} from 'node:crypto';
import {McpOAuthBroker,UnauthorizedError,mcpNetworkBinding,mcpNetworkGrant} from './mcp-oauth.js';
import {createAuthorizedOAuthFetch} from './network-target-policy.js';
import {McpElicitationBroker} from './mcp-elicitations.js';
import {mcpBinding,type McpConnection} from './mcp-credentials.js';
import {McpSafeError} from './mcp-errors.js';
import type {OAuthClientProvider} from '@modelcontextprotocol/sdk/client/auth.js';

type Runtime={oauth:McpOAuthBroker;elicitations:McpElicitationBroker;current?:(id:string)=>McpConnection|undefined;redact?:(value:string)=>string};
let runtime:Runtime|undefined;
const active=new Map<string,Set<()=>Promise<void>>>();
export function configureMcpRuntime(value:Runtime|undefined){runtime=value;}
export function cancelMcpConnection(id:string){for(const close of active.get(id)??[])void close();}
export function trackMcpSession(id:string,dispose:()=>Promise<void>){const close=async()=>{active.get(id)?.delete(close);if(!active.get(id)?.size)active.delete(id);await dispose();};const sessions=active.get(id)??new Set();sessions.add(close);active.set(id,sessions);return close;}
export function redactMcpResult<T>(value:T):T{const redact=runtime?.redact;if(!redact)return value;const visit=(input:unknown):unknown=>typeof input==='string'?redact(input):Array.isArray(input)?input.map(visit):input&&typeof input==='object'?Object.fromEntries(Object.entries(input).map(([key,item])=>[key,visit(item)])):input;return visit(value) as T;}
export function assertMcpCurrent(connection:McpConnection){if(runtime?.current){const current=runtime.current(connection.id);if(!current?.enabled||mcpNetworkBinding(current)!==mcpNetworkBinding(connection))throw new McpSafeError('cancelled','连接已变更或禁用，操作已停止');}}
/** SDK auth retries are useful for reads but must not replay a submitted external action. */
export function mcpSingleSubmissionFetch(provider?:OAuthClientProvider,fetchFn:typeof fetch=fetch):typeof fetch{
 return async(input,init)=>{
  let toolCall=false;if(typeof init?.body==='string')try{const body=JSON.parse(init.body);toolCall=(Array.isArray(body)?body:[body]).some(item=>item?.method==='tools/call');}catch{}
  const response=await fetchFn(input,init);
  if(toolCall&&(response.status===401||response.status===403)){await response.body?.cancel();if(response.status===401)await provider?.invalidateCredentials?.('tokens');throw new McpSafeError('needs_auth','已提交工具请求后授权失效；结果未知，请核对远端并重新登录，不要重复创建');}
  return response;
 };
}
export async function readMcpCatalog(client:Pick<Client,'listTools'>,options:{budgetMs?:number;signal?:AbortSignal}={}){
 const budget=Math.max(1,Math.min(30_000,options.budgetMs??30_000)),deadline=Date.now()+budget;
 const tools:Tool[]=[],names=new Set<string>(),cursors=new Set<string>();let cursor:string|undefined,bytes=0;
 for(let page=0;page<50;page++){
  const remaining=deadline-Date.now();if(remaining<=0||options.signal?.aborted)throw new McpSafeError('catalog_limit','MCP 工具目录未能在总计 30 秒内完整读取，请稍后检查');
  let result:Awaited<ReturnType<Client['listTools']>>;
  try{result=await client.listTools(cursor?{cursor}:undefined,{timeout:Math.min(20_000,remaining),signal:options.signal});}catch(error){if(options.signal?.aborted||Date.now()>=deadline)throw new McpSafeError('catalog_limit','MCP 工具目录读取超时或已取消；尚未完整核对能力');throw error;}
  bytes+=JSON.stringify(result).length;if(bytes>2_000_000)throw new McpSafeError('catalog_limit','MCP 工具目录超过安全上限，请限制服务暴露的工具');
  for(const tool of result.tools){if(!/^[\w./:-]{1,200}$/.test(tool.name)||names.has(tool.name))throw new McpSafeError('catalog_limit','MCP 工具目录包含重复或无效名称');names.add(tool.name);tools.push(tool);if(tools.length>2000)throw new McpSafeError('catalog_limit','MCP 工具数量超过 2000，请限制服务范围');}
  cursor=result.nextCursor;if(!cursor)return{tools,complete:true as const,pages:page+1,hash:createHash('sha256').update(JSON.stringify(tools.map(tool=>({name:tool.name,inputSchema:tool.inputSchema})).sort((a,b)=>a.name.localeCompare(b.name)))).digest('hex')};
  if(cursors.has(cursor))throw new McpSafeError('catalog_limit','MCP 工具目录分页重复，未能完成能力核对');cursors.add(cursor);
 }
 throw new McpSafeError('catalog_limit','MCP 工具目录超过 50 页，未能完成能力核对');
}
export async function connectMcp(connection:McpConnection){
 assertMcpCurrent(connection);
 const abort=new AbortController();
 const client=new Client({name:'slash',version:'0.3.12'},{capabilities:runtime?{elicitation:{form:{},url:{}}}:{}});
 if(runtime){const bridge=runtime.elicitations;client.setRequestHandler(ElicitRequestSchema,(request,extra)=>bridge.request(connection,request.params,AbortSignal.any([abort.signal,extra.signal])));}
 const provider=connection.url?runtime?.oauth.transportProvider(connection):undefined;
 const networkFetch=connection.url?(runtime?.oauth.transportFetch(connection,abort.signal)??createAuthorizedOAuthFetch({connectionId:connection.id,binding:mcpBinding(connection),grant:mcpNetworkGrant(connection),signal:abort.signal,assertCurrent:()=>assertMcpCurrent(connection)})):undefined;
 const transport=connection.url?new StreamableHTTPClientTransport(new URL(connection.url),{authProvider:provider,fetch:mcpSingleSubmissionFetch(provider,networkFetch)}):new StdioClientTransport({command:connection.command,args:connection.args,stderr:'pipe'});
 const close=async()=>{abort.abort();active.get(connection.id)?.delete(close);if(!active.get(connection.id)?.size)active.delete(connection.id);await client.close().catch(()=>{});};
 const sessions=active.get(connection.id)??new Set();sessions.add(close);active.set(connection.id,sessions);
 try{await client.connect(transport,{timeout:20_000});assertMcpCurrent(connection);return{client,close};}
 catch(error){await close();if(error instanceof UnauthorizedError)throw new McpSafeError('needs_auth','服务需要登录，请在连接页面点击“网页登录”');throw error;}
}
export async function inspectMcp(connection:McpConnection){const session=await connectMcp(connection);try{const catalog=await readMcpCatalog(session.client);assertMcpCurrent(connection);return redactMcpResult({kind:'mcp' as const,tools:catalog.tools.map(tool=>({name:tool.name,description:(tool.description??'').slice(0,2000),inputSchema:tool.inputSchema})),catalogHash:catalog.hash,catalogComplete:catalog.complete,notice:'已读取完整 MCP 能力；发布仍需单独确认和核对回执'});}finally{await session.close();}}
export function pageMcpTools<T extends {name:string;description?:string}>(tools:T[],hash:string,options:{query?:string;cursor?:string;limit?:number}={}){
 const limit=Math.max(1,Math.min(50,Math.trunc(options.limit??25)));let offset=0;
 const query=options.query?.toLowerCase().trim();const scopeHash=createHash('sha256').update(hash+'\0'+(query??'')).digest('hex');
 if(options.cursor){const match=/^([a-f0-9]{64}):(\d{1,6})$/.exec(options.cursor);if(!match||match[1]!==scopeHash)throw new McpSafeError('catalog_limit','目录或筛选已变化，请从第一页重新检查');offset=Number(match[2]);}
 const sorted=[...tools].sort((a,b)=>a.name.localeCompare(b.name));const filtered=query?sorted.filter(tool=>`${tool.name} ${tool.description??''}`.toLowerCase().includes(query)):sorted;
 const next=offset+limit;return{tools:filtered.slice(offset,next),totalTools:tools.length,matchedTools:filtered.length,nextCursor:next<filtered.length?`${scopeHash}:${next}`:undefined,hasMore:next<filtered.length};
}
