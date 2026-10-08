import {z} from 'zod';

const target={mountId:z.string().min(1),path:z.string().min(1).max(32767)};
export const readDraftSchema=z.object({...target,offset:z.number().int().min(0).optional().describe('从 0 起的 UTF-16 字符偏移，不是行号；分页使用上次返回的 nextOffset，默认 0。'),limit:z.number().int().min(1).max(16000).optional().describe('最多返回的 UTF-16 字符数，不是行数；默认 8000，合法范围 1–16000。检查整文件时用完整块并按 nextOffset 分页，不要用几十字符反复遍历。')}).strict();
const replacement=z.object({oldText:z.string().min(1).max(200000),newText:z.string().max(200000)}).strict();
export const editDraftSchema=z.object({...target,changeId:z.string().min(1).optional(),expectedContentHash:z.string().regex(/^[a-f0-9]{64}$/),oldText:z.string().min(1).max(200000).optional(),newText:z.string().max(200000).optional(),edits:z.array(replacement).min(1).max(30).optional()}).strict().superRefine((v,ctx)=>{
 if(v.edits?(v.oldText!==undefined||v.newText!==undefined):(v.oldText===undefined||v.newText===undefined))ctx.addIssue({code:'custom',message:'使用 oldText/newText 或 edits，不能混用；批量替换均匹配同一原内容'});
});
export type ReadDraftInput=z.infer<typeof readDraftSchema>;
export type EditDraftInput=z.infer<typeof editDraftSchema>;
export type DraftReadReceipt={mountId:string;path:string;source?:'pending'|'applied';changeId?:string;contentHash:string;baseHash:string|null;content:string;offset:number;total:number;truncated:boolean;nextOffset?:number;notice:string};
export type DraftEditReceipt={changeId:string;path:string;status:'pending';contentHash:string;baseHash:string|null;diff:string;diffHash:string;diffTruncated:boolean;firstChangedLine?:number;notice:string};
