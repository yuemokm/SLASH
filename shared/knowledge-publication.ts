import {z} from 'zod';
const id=z.string().min(1).max(160).regex(/^[a-zA-Z0-9_-]+$/);
const origin=z.string().url().max(2000).refine(value=>{try{const u=new URL(value);return !u.username&&!u.password&&!u.search&&!u.hash&&u.pathname==='/'&&(u.protocol==='https:'||u.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(u.hostname));}catch{return false;}},'请使用不含凭据或路径的HTTPS基础地址（本机测试可用HTTP）');
export const knowledgeCloudConfigSchema=z.object({supabaseUrl:origin,webUrl:origin,memberIds:z.array(z.union([z.string().uuid(),z.string().email().max(320)])).min(1).max(100).transform(values=>[...new Set(values.map(v=>v.toLowerCase()))].sort())}).strict();
export type KnowledgeCloudConfig=z.infer<typeof knowledgeCloudConfigSchema>;
export type KnowledgeCloudView={config?:KnowledgeCloudConfig;hasKey:boolean;encryptionAvailable:boolean;revision:number};
export type KnowledgePublicationRecord={operationId:string;projectId:string;knowledgeBaseId:string;action:'publish'|'revoke';target:string;webUrl:string;indexId?:string;manifestHash?:string;expectedActive:string|null;memberIds:string[];status:'outcome_unknown'|'succeeded'|'failed';createdAt:string;updatedAt:string;errorCode?:string;receipt?:Record<string,unknown>};
export type KnowledgePublicationPreflight={token:string;knowledgeBaseId:string;action:'publish'|'revoke';target:string;webUrl:string;expectedActive:string|null;indexId?:string;manifestHash?:string;memberIds:string[];memberAccounts:string[];documents?:number;chunks?:number;coverage?:string;expiresAt:string;notice:string};
export type KnowledgePublicationView={settings:KnowledgeCloudView;records:KnowledgePublicationRecord[]};
export const knowledgePublicationRequestSchemas=[
 z.object({type:z.literal('knowledgeCloudGet'),id}).strict(),
 z.object({type:z.literal('knowledgeCloudSave'),config:knowledgeCloudConfigSchema,apiKey:z.string().trim().min(1).max(20000).optional(),clearKey:z.boolean().optional()}).strict(),
 z.object({type:z.literal('knowledgeCloudPreflight'),id,action:z.enum(['publish','revoke'])}).strict(),
 z.object({type:z.literal('knowledgeCloudCommit'),id,token:z.string().uuid(),confirmed:z.literal(true)}).strict(),
 z.object({type:z.literal('knowledgeCloudReconcile'),id,operationId:z.string().uuid()}).strict(),
] as const;
