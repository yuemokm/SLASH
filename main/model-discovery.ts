import type {ModelDiscoveryResult,ModelProtocol} from '../shared/types.js';
import {modelProxyFetch} from './model-proxy.js';

const MAX_BYTES=2_000_000,MAX_MODELS=2000,MAX_PAGES=20;
type DiscoveryInput={baseUrl:string;protocol:ModelProtocol;proxyUrl?:string|null};
const object=(value:unknown):value is Record<string,unknown>=>Boolean(value&&typeof value==='object'&&!Array.isArray(value));
async function readPayload(response:Response){
 if(Number(response.headers.get('content-length')??0)>MAX_BYTES)throw Error('模型列表响应过大');
 if(!response.body)throw Error('模型列表响应为空');
 const reader=response.body.getReader(),chunks:Uint8Array[]=[];let bytes=0;
 try{while(true){const next=await reader.read();if(next.done)break;bytes+=next.value.byteLength;if(bytes>MAX_BYTES)throw Error('模型列表响应过大');chunks.push(next.value);}}
 finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
 try{return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;}catch{throw Error('上游未返回有效的 JSON 模型列表');}
}
/** Read-only discovery. Never infer call protocol, tools, vision or limits from a catalog entry. */
export async function discoverModels(input:DiscoveryInput,key:string,fetcher:typeof fetch=fetch):Promise<ModelDiscoveryResult>{
 if(!key)throw Error('请先填写 API 密钥，再获取模型列表；也可直接手动填写模型 ID。');
 const endpoint=new URL(input.baseUrl);
 if(endpoint.username||endpoint.password||endpoint.search||endpoint.hash||!['https:','http:'].includes(endpoint.protocol))throw Error('API 地址须为 HTTP 或 HTTPS，不含凭据、查询或片段。');
 const basePath=endpoint.pathname.replace(/\/+$/,'');
 endpoint.pathname=(input.protocol==='anthropic-messages'&&!basePath?'/v1':basePath)+'/models';
 const headers:Record<string,string>=input.protocol==='anthropic-messages'?{'x-api-key':key,'anthropic-version':'2023-06-01'}:{Authorization:`Bearer ${key}`};
 const transport=input.proxyUrl?modelProxyFetch(input.proxyUrl):fetcher,signal=AbortSignal.timeout(15_000);
 const models=new Map<string,{id:string;name:string}>(),cursors=new Set<string>();let truncated=false;
 for(let page=0;page<MAX_PAGES;page++){
  const response=await transport(endpoint,{headers,redirect:'error',signal});
  if(!response.ok){
   const hint=response.status===401||response.status===403?'请检查密钥及账号权限。':response.status===404||response.status===405?'此上游可能没有模型列表接口，可手动填写模型 ID。':'请稍后重试，或手动填写模型 ID。';
   throw Error(`获取模型列表失败（HTTP ${response.status}）。${hint}`);
  }
  const payload=await readPayload(response);
  if(!object(payload)||!Array.isArray(payload.data))throw Error('上游返回的模型列表格式不兼容，可手动填写模型 ID。');
  for(const item of payload.data){
   if(!object(item)||typeof item.id!=='string')continue;
   const id=item.id.trim();if(!id||id.length>200||/[\s,，;；]/.test(id))continue;
   if(!models.has(id)&&models.size>=MAX_MODELS){truncated=true;break;}
   models.set(id,{id,name:typeof item.display_name==='string'&&item.display_name.trim()?item.display_name.trim().slice(0,100):id.slice(0,100)});
  }
  if(truncated||payload.has_more!==true)break;
  const cursor=typeof payload.last_id==='string'?payload.last_id:'';
  if(!cursor||cursors.has(cursor))throw Error('上游模型列表分页无效，可重试或手动填写模型 ID。');
  cursors.add(cursor);endpoint.searchParams.set('after_id',cursor);
  if(page===MAX_PAGES-1)truncated=true;
 }
 return{models:[...models.values()].sort((a,b)=>a.id.localeCompare(b.id)),truncated,notice:truncated?'列表过长，仅展示已获取的模型；未列出的模型仍可手动添加。':models.size?'可选择多个模型；能否用于当前协议，请保存后单独测试。':'上游返回空列表，可重试或手动填写模型 ID。'};
}
