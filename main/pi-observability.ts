import {createHash} from 'node:crypto';
import path from 'node:path';
import {z} from 'zod';
import type {ExtensionFactory,ExtensionContext} from '@earendil-works/pi-coding-agent';
import {piPackageRoot,startAuxiliaryWorker,type AuxiliaryWorker} from './pi-auxiliary-worker.js';

export const piObservabilityConfigSchema=z.object({enabled:z.boolean().default(false),baseUrl:z.string().trim().default(''),publicKey:z.string().trim().default(''),secretKey:z.string().trim().default(''),mode:z.literal('metadata').default('metadata')}).superRefine((value,ctx)=>{if(!value.enabled)return;if(!value.publicKey||!value.secretKey)ctx.addIssue({code:'custom',message:'启用观测前请填写公钥和密钥'});try{const url=new URL(value.baseUrl);if(url.protocol!=='https:'&&!(url.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(url.hostname)))throw Error();if(url.username||url.password||url.search||url.hash)throw Error();}catch{ctx.addIssue({code:'custom',path:['baseUrl'],message:'请填写 HTTPS 地址；本机测试可使用 localhost HTTP'});}});
export type PiObservabilityConfig=z.infer<typeof piObservabilityConfigSchema>;
const id=(value:unknown)=>createHash('sha256').update(String(value??'')).digest('hex').slice(0,24);
const safeName=(value:unknown)=>String(value??'').replace(/[^A-Za-z0-9._:/-]/g,'_').slice(0,120);
function numericUsage(value:any){if(!value||typeof value!=='object')return undefined;const out:Record<string,unknown>={};for(const key of ['input','output','cacheRead','cacheWrite','cacheWrite1h','totalTokens'])if(typeof value[key]==='number'&&Number.isFinite(value[key]))out[key]=value[key];if(value.cost&&typeof value.cost==='object'){const cost:Record<string,number>={};for(const key of ['input','output','cacheRead','cacheWrite','total'])if(typeof value.cost[key]==='number'&&Number.isFinite(value.cost[key]))cost[key]=value.cost[key];out.cost=cost;}return out;}
/** Strict allowlist: provider payloads, prompts, images, tool args/results, paths and error details never cross the process boundary. */
export function piObservabilityMetadataEvent(name:string,input:unknown){
 const event=(input??{}) as Record<string,any>;const base:Record<string,unknown>={type:name};
 if(name==='before_agent_start')return{...base,prompt:'[content omitted by Slash metadata policy]',images:[]};
 if(name==='message_update'||name==='message_end'){const message=event.message??{};return{...base,message:{role:message.role==='assistant'?'assistant':'other',content:[{type:'text',text:'[content omitted]'}],model:safeName(message.model),provider:safeName(message.provider),api:safeName(message.api),stopReason:['stop','length','toolUse','error','aborted'].includes(message.stopReason)?message.stopReason:undefined,errorMessage:message.stopReason==='error'?'Model request failed':undefined,usage:numericUsage(message.usage)}};}
 if(name==='tool_execution_start')return{...base,toolCallId:id(event.toolCallId),toolName:safeName(event.toolName),args:{content:'[arguments omitted]'}};
 if(name==='tool_execution_end')return{...base,toolCallId:id(event.toolCallId),toolName:safeName(event.toolName),isError:event.isError===true,result:{content:[{type:'text',text:'[result omitted]'}],usage:numericUsage(event.result?.usage)}};
 if(name==='session_shutdown')return{...base,reason:'quit'};
 return base;
}
export type PiObservabilityExtension=ExtensionFactory&{close:()=>Promise<void>};
export function createPiObservabilityExtension(input:Partial<PiObservabilityConfig>&{signal?:AbortSignal;onDiagnostic?:(message:string)=>void}):PiObservabilityExtension{
 const report=(message:string)=>{try{input.onDiagnostic?.(message);}catch{}};
 const config=piObservabilityConfigSchema.parse(input);let worker:AuxiliaryWorker|undefined;let closing=false;let closingPromise:Promise<void>|undefined;let queue=Promise.resolve();let queuedEvents=0;
 const close=()=>{if(closingPromise)return closingPromise;closing=true;closingPromise=(async()=>{const target=worker;if(!target)return;const timer=setTimeout(()=>{void target.close().catch(()=>{});},4000);try{await queue.catch(()=>{});try{target.send({name:'session_shutdown',event:{reason:'quit'},context:{sessionId:'closed'}});await target.next();}catch{}}finally{clearTimeout(timer);await target.close();worker=undefined;}})();return closingPromise;};
 const factory:PiObservabilityExtension=Object.assign(async(pi:Parameters<ExtensionFactory>[0])=>{
  if(!config.enabled)return; // No package import, environment config discovery, worker or network activity while disabled.
  if(input.signal?.aborted)return;
  try{
   worker=await startAuxiliaryWorker(`
import {createInterface} from 'node:readline';
const {default:extension}=await jiti.import(${JSON.stringify(path.join(piPackageRoot('@langfuse/pi-observability-plugin'),'src','index.ts'))});
const handlers=new Map();
extension({on:(name,handler)=>{const rows=handlers.get(name)??[];rows.push(handler);handlers.set(name,rows);},exec:async()=>({code:1,stdout:'',stderr:''})});
emit({type:'ready',events:[...handlers.keys()]});
const rl=createInterface({input:process.stdin});let queue=Promise.resolve();
rl.on('line',line=>{queue=queue.then(async()=>{try{const request=JSON.parse(line);const data=request.context??{};const ctx={hasUI:false,cwd:'[workspace omitted]',model:data.model,sessionManager:{getSessionId:()=>data.sessionId??'slash',getEntries:()=>[]}};for(const handler of handlers.get(request.name)??[])await handler(request.event,ctx);emit({type:'ok'});}catch{emit({type:'error',message:'Observability event failed'});}});});
`,{LANGFUSE_TRACING_ENABLED:'true',LANGFUSE_PUBLIC_KEY:config.publicKey,LANGFUSE_SECRET_KEY:config.secretKey,LANGFUSE_BASE_URL:config.baseUrl,LANGFUSE_MEDIA_UPLOAD_ENABLED:'false',OTEL_EXPORTER_OTLP_TIMEOUT:'2000'});
   const ready=await worker.next();if(ready.type!=='ready')throw Error('PI_OBSERVABILITY_START_FAILED');
   const events=['session_start','before_agent_start','before_provider_request','message_end','tool_execution_start','tool_execution_end','agent_settled','session_shutdown'] as const;
   const forward=(name:string,event:unknown,ctx:ExtensionContext)=>{if(closing||!worker)return;if(queuedEvents>=128){report('观测积压超限，已停止本次观测；任务继续。');void close().catch(()=>{});return;}queuedEvents++;const target=worker;const context={sessionId:id(ctx.sessionManager.getSessionId()),model:ctx.model?{id:safeName(ctx.model.id),provider:safeName(ctx.model.provider)}:undefined};const safeEvent=piObservabilityMetadataEvent(name,event);queue=queue.then(async()=>{target.send({name,event:safeEvent,context});const result=await target.next(4000);if(result.type!=='ok')throw Error('PI_OBSERVABILITY_EVENT_FAILED');}).catch(()=>{report('观测事件发送失败，任务执行不受影响。');void close().catch(()=>{});}).finally(()=>{queuedEvents--;});};
   for(const name of events)(pi.on as (name:string,handler:(event:unknown,ctx:ExtensionContext)=>Promise<void>)=>void)(name,async(event,ctx)=>{forward(name,event,ctx);if(name==='session_shutdown')await close();});
   input.signal?.addEventListener('abort',()=>{void close().catch(()=>{});},{once:true});if(input.signal?.aborted)await close();
  }catch{await worker?.close();worker=undefined;report('Langfuse 观测无法启动，任务继续。');}
 },{close});return factory;
}
