import {z} from 'zod';
import {createKnowledgeBaseSchema,updateKnowledgeSourcesSchema} from './knowledge-base.js';

const id=z.string().min(1).max(200);
export const embeddingConnectionSchema=z.object({endpoint:z.string().url().max(2000).refine(value=>{const url=new URL(value);return !url.username&&!url.password&&!url.search&&!url.hash&&(url.protocol==='https:'||url.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(url.hostname));},'使用HTTPS或本机服务地址，不允许地址携带凭据'),model:z.string().trim().min(1).max(200),revision:z.string().trim().min(1).max(200),dimensions:z.number().int().min(1).max(8192)}).strict();
export type EmbeddingConnection=z.infer<typeof embeddingConnectionSchema>;
export type EmbeddingConnectionView={connection?:EmbeddingConnection;hasKey:boolean;encryptionAvailable:boolean};
export const knowledgeDesktopRequestSchemas=[
 z.object({type:z.literal('knowledgeList')}).strict(),
 z.object({type:z.literal('knowledgeGet'),id}).strict(),
 createKnowledgeBaseSchema.extend({type:z.literal('knowledgeCreate')}),
 z.object({type:z.literal('knowledgeSetSources'),id,sources:updateKnowledgeSourcesSchema}).strict(),
 z.object({type:z.literal('knowledgeInspectLocal'),id}).strict(),
 z.object({type:z.literal('knowledgeRevealSource'),id,chunkId:id}).strict(),
 z.object({type:z.literal('knowledgeRemove'),id}).strict(),
] as const;
