import {z} from 'zod';

const target={mountId:z.string().min(1),path:z.string().min(1).max(32767)};
export const readDraftSchema=z.object({...target,offset:z.number().int().min(0).optional().describe('从 0 起的 UTF-16 字符偏移，不是行号；分页使用上次返回的 nextOffset，默认 0。'),limit:z.number().int().min(1).max(16000).optional().describe('最多返回的 UTF-16 字符数，不是行数；默认 8000，合法范围 1–16000。检查整文件时用完整块并按 nextOffset 分页，不要用几十字符反复遍历。')}).strict();
const replacement=z.object({oldText:z.string().min(1).max(200000),newText:z.string().max(200000)}).strict();
const editTarget={...target,changeId:z.string().min(1).optional(),expectedContentHash:z.string().regex(/^[a-f0-9]{64}$/)};
// Both alternatives are strict and mutually exclusive in JSON Schema as well
// as Zod. A refinement alone is invisible to the model and Pi's validator.
export const editDraftSchema=z.union([
 z.object({...editTarget,...replacement.shape,edits:z.never().optional()}).strict(),
 z.object({...editTarget,edits:z.array(replacement).min(1).max(30),oldText:z.never().optional(),newText:z.never().optional()}).strict(),
]).meta({type:'object'});
export type ReadDraftInput=z.infer<typeof readDraftSchema>;
export type EditDraftInput=z.infer<typeof editDraftSchema>;
/** parentRunId is the pending Change's current owner, for prototype draft refs.
 * Applied reads omit it. It is not originRunId or the caller's current Run. */
export type DraftReadReceipt={mountId:string;path:string;source?:'pending'|'applied';changeId?:string;parentRunId?:string;contentHash:string;baseHash:string|null;content:string;offset:number;total:number;truncated:boolean;nextOffset?:number;notice:string};
/** Successful resumption edits return the owner after commit, not its ancestor. */
export type DraftEditReceipt={changeId:string;parentRunId:string;path:string;status:'pending';contentHash:string;baseHash:string|null;diff:string;diffHash:string;diffTruncated:boolean;firstChangedLine?:number;notice:string};
