import {z} from 'zod';
import type {ImageAttachmentRef} from './vision.js';

export const CONTEXT_ATTACHMENT_LIMITS={count:8,fileBytes:12*1024*1024,textCharacters:40_000,totalCharacters:60_000} as const;
export const CONTEXT_TEXT_EXTENSIONS=['txt','md','markdown','csv','tsv','json','jsonl','html','htm','xml','yaml','yml','toml','ini','log','sql','js','jsx','ts','tsx','mjs','cjs','css','scss','py','java','c','h','cpp','hpp','cs','go','rs','sh','ps1','bat','vue','svelte','svg'] as const;
export const CONTEXT_ATTACHMENT_ACCEPT=['png','jpg','jpeg','webp','gif','pdf','docx','xlsx','pptx',...CONTEXT_TEXT_EXTENSIONS].map(value=>'.'+value).join(',');
export const documentAttachmentSchema=z.object({id:z.string().uuid(),name:z.string().min(1).max(255),mimeType:z.string(),size:z.number().int().nonnegative(),sha256:z.string().regex(/^[a-f0-9]{64}$/),createdAt:z.string(),kind:z.literal('document'),parserVersion:z.string(),textHash:z.string().regex(/^[a-f0-9]{64}$/),characters:z.number().int().positive(),includedCharacters:z.number().int().positive().max(CONTEXT_ATTACHMENT_LIMITS.textCharacters),truncated:z.boolean(),limitations:z.array(z.string()).max(20)}).strict();
export type DocumentAttachmentRef=z.infer<typeof documentAttachmentSchema>;
export type ContextAttachmentRef=ImageAttachmentRef|DocumentAttachmentRef;
export function isDocumentAttachment(ref:ContextAttachmentRef):ref is DocumentAttachmentRef{return 'kind'in ref&&ref.kind==='document';}
export function attachmentFormat(name:string){return name.split('.').at(-1)?.toUpperCase()||'文件';}
