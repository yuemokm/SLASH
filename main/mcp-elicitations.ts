import {randomUUID} from 'node:crypto';
import {AjvJsonSchemaValidator} from '@modelcontextprotocol/sdk/validation/ajv';
import type {ElicitRequest,ElicitResult} from '@modelcontextprotocol/sdk/types.js';
import type {McpElicitationView} from '../shared/mcp-connections.js';
import {mcpBinding,type McpConnection} from './mcp-credentials.js';
import {McpSafeError} from './mcp-errors.js';

type Pending={view:McpElicitationView;binding:string;params:ElicitRequest['params'];resolve:(result:ElicitResult)=>void;timer:ReturnType<typeof setTimeout>;opened:boolean;removeAbort:()=>void};
/** Transient human-only confirmation queue. It is deliberately separate from permission 'allow'. */
export class McpElicitationBroker{
 private pending=new Map<string,Pending>();
 constructor(private options:{current:(id:string)=>McpConnection|undefined;openExternal:(url:string)=>Promise<unknown>;timeoutMs?:number}){}
 list(){return[...this.pending.values()].map(item=>structuredClone(item.view));}
 private current(item:Pending){const connection=this.options.current(item.view.connectionId);return!!connection&&connection.enabled&&mcpBinding(connection)===item.binding;}
 request(connection:McpConnection,params:ElicitRequest['params'],signal?:AbortSignal):Promise<ElicitResult>{
  if(signal?.aborted||this.pending.size>=10||params.message.length>8000||JSON.stringify(params).length>50000||params.task)return Promise.resolve({action:'decline'});
  const current=this.options.current(connection.id);if(!current||!current.enabled||mcpBinding(current)!==mcpBinding(connection))return Promise.resolve({action:'cancel'});
  const mode=params.mode??'form';let urlOrigin:string|undefined;
  if(params.mode==='url'){try{const url=new URL(params.url);if(url.protocol!=='https:'||url.username||url.password)throw Error();urlOrigin=url.origin;}catch{return Promise.resolve({action:'decline'});}}
  else{
   const fields=Object.entries(params.requestedSchema.properties);
   if(fields.length>30||fields.some(([key,field])=>/password|secret|token|api.?key|private.?key|密码|密钥|令牌/i.test(`${key} ${field.title??''} ${field.description??''}`)))return Promise.resolve({action:'decline'});
  }
  return new Promise(resolve=>{
   const id=randomUUID(),timeout=this.options.timeoutMs??85_000;
   const view:McpElicitationView={id,connectionId:connection.id,connectionName:connection.name,serverOrigin:connection.url?new URL(connection.url).origin:'本机 MCP 程序',mode,message:params.message,urlOrigin,expiresAt:new Date(Date.now()+timeout).toISOString(),...('requestedSchema'in params?{fields:structuredClone(params.requestedSchema.properties),required:params.requestedSchema.required}: {})};
   const timer=setTimeout(()=>this.finish(id,{action:'cancel'}),timeout);timer.unref();
   const abort=()=>this.finish(id,{action:'cancel'});signal?.addEventListener('abort',abort,{once:true});
   this.pending.set(id,{view,binding:mcpBinding(connection),params,resolve,timer,opened:false,removeAbort:()=>signal?.removeEventListener('abort',abort)});
  });
 }
 private finish(id:string,result:ElicitResult){const item=this.pending.get(id);if(!item)return;clearTimeout(item.timer);item.removeAbort();this.pending.delete(id);item.resolve(result);}
 async open(id:string){const item=this.pending.get(id);if(!item||!this.current(item)||item.params.mode!=='url')throw new McpSafeError('elicitation_failed','确认请求已过期或连接已变更');await this.options.openExternal(item.params.url);if(this.pending.get(id)===item)item.opened=true;return{opened:true};}
 respond(id:string,action:ElicitResult['action'],content?:ElicitResult['content']){
  const item=this.pending.get(id);if(!item)throw new McpSafeError('elicitation_failed','确认请求已过期');
  if(!this.current(item)){this.finish(id,{action:'cancel'});throw new McpSafeError('elicitation_failed','连接已变更，确认已取消');}
  if(action==='accept'){
   if(item.params.mode==='url'){if(!item.opened)throw new McpSafeError('elicitation_failed','请先打开服务商网页完成确认');content=undefined;}
   else{
    const schema={...item.params.requestedSchema,additionalProperties:false};
    try{if(!new AjvJsonSchemaValidator().getValidator(schema)(content??{}).valid)throw Error();}catch{throw new McpSafeError('elicitation_failed','填写内容不符合服务商要求，请检查必填项和取值');}
   }
  }
  this.finish(id,{action,...(action==='accept'&&content?{content}:{})});return{resolved:true};
 }
 cancelConnection(id:string){for(const item of [...this.pending.values()])if(item.view.connectionId===id)this.finish(item.view.id,{action:'cancel'});}
 close(){for(const id of [...this.pending.keys()])this.finish(id,{action:'cancel'});}
}
