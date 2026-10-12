import {z} from 'zod';

export const mcpNetworkOriginSchema=z.string().max(2048).refine(value=>{try{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password&&!url.search&&!url.hash&&url.pathname==='/'&&(value===url.origin||value===url.origin+'/');}catch{return false;}},'请填写完整的 HTTPS 服务地址，不包含路径、账号或参数').transform(value=>new URL(value).origin);
export const mcpPublisherSchema=z.object({provider:z.literal('netlify'),siteId:z.string().regex(/^[A-Za-z0-9_-]{1,100}$/)}).strict();
export const mcpConnectionFields={mcpPublisher:mcpPublisherSchema.optional(),mcpAuth:z.enum(['none','oauth']).optional(),mcpPreset:z.enum(['vercel','supabase']).optional(),mcpNetworkAllowedOrigins:z.array(mcpNetworkOriginSchema).max(16).optional()};
export type McpConnectionOptions={mcpPublisher?:z.infer<typeof mcpPublisherSchema>;mcpAuth?:'none'|'oauth';mcpPreset?:'vercel'|'supabase';mcpNetworkAllowedOrigins?:string[]};
export type McpAuthStatus={connectionId:string;status:'anonymous'|'signed_out'|'pending'|'authenticated'|'error';message:string};
export type McpFormField={type?:string;title?:string;description?:string;enum?:string[];enumNames?:string[];oneOf?:Array<{const:string;title:string}>;items?:{enum?:string[];anyOf?:Array<{const:string;title:string}>};minLength?:number;maxLength?:number;minimum?:number;maximum?:number;minItems?:number;maxItems?:number;format?:string};
export type McpElicitationView={id:string;connectionId:string;connectionName:string;serverOrigin:string;mode:'form'|'url';message:string;urlOrigin?:string;fields?:Record<string,McpFormField>;required?:string[];expiresAt:string};
const id=z.string().regex(/^[\w.-]{1,100}$/);
const content=z.record(z.string().max(200),z.union([z.string().max(10000),z.number().finite(),z.boolean(),z.array(z.string().max(1000)).max(100)])).refine(value=>Object.keys(value).length<=30);
export const mcpRequestSchemas=[
 z.object({type:z.literal('mcpPublisherCredential'),id,siteId:mcpPublisherSchema.shape.siteId,token:z.string().min(10).max(4096).regex(/^[\x21-\x7e]+$/)}).strict(),
 z.object({type:z.literal('mcpPublisherStatus'),id}).strict(),
 z.object({type:z.literal('mcpPublisherVerify'),id,siteId:mcpPublisherSchema.shape.siteId}).strict(),
 z.object({type:z.literal('prototypePublicationStatus'),id}).strict(),
 z.object({type:z.literal('mcpPublisherDisconnect'),id,siteId:mcpPublisherSchema.shape.siteId}).strict(),
 z.object({type:z.literal('mcpAuthStatus'),id}),
 z.object({type:z.literal('mcpAuthLogin'),id}),
 z.object({type:z.literal('mcpAuthCancel'),id}),
 z.object({type:z.literal('mcpAuthDisconnect'),id}),
 z.object({type:z.literal('mcpElicitations')}),
 z.object({type:z.literal('mcpElicitationOpen'),id}),
 z.object({type:z.literal('mcpElicitationRespond'),id,action:z.enum(['accept','decline','cancel']),content:content.optional()}),
] as const;
export type McpRequest=z.infer<(typeof mcpRequestSchemas)[number]>;
export type McpCall=(request:McpRequest)=>Promise<unknown>;

export function officialMcpPreset(preset:'vercel'|'supabase',options:{projectRef?:string;readOnly?:boolean}={}){
 if(preset==='vercel')return{name:'Vercel',provider:'vercel',url:'https://mcp.vercel.com',mcpPreset:preset,mcpAuth:'oauth' as const};
 const url=new URL('https://mcp.supabase.com/mcp');
 const projectRef=options.projectRef?.trim();
 if(projectRef){if(!/^[a-z0-9]{8,64}$/.test(projectRef))throw Error('Supabase 项目编号仅支持小写字母与数字（8–64 位）');url.searchParams.set('project_ref',projectRef);}
 url.searchParams.set('read_only',options.readOnly===false?'false':'true');
 return{name:'Supabase',provider:'supabase',url:url.href,mcpPreset:preset,mcpAuth:'oauth' as const};
}
