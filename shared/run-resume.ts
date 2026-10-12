import {z} from 'zod';

/** Explicit opt-in; an omitted value keeps the existing Pi transcript. */
export const freshContextResumeSchema=z.object({
 summary:z.string().trim().min(1).max(12000).refine(value=>!value.includes('\0'),'恢复摘要不能包含空字符'),
}).strict();
export type FreshContextResume=z.infer<typeof freshContextResumeSchema>;

/** Host-owned recovery metadata, never accepted as a session path from IPC. */
export type RunContextResume={mode:'fresh';summary:string;originalInputHash:string;parentSessionFile?:string};
