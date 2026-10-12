import {z} from 'zod';

export const TASK_MODEL_VIEW_LIMIT=12000;
const id=z.string().min(1).max(200),hash=z.string().regex(/^[a-f0-9]{64}$/);
export const taskModelViewSections=['summary','requests','outputs','criteria','baseline','sources','reads','prd','report','history'] as const;
export const taskModelViewRequestSchema=z.object({
 runId:id.optional().describe('省略查看当前Run；查看同会话其他Run时只传宿主真实runId，不能猜测或使用占位值'),section:z.enum(taskModelViewSections).default('summary'),
 sourceId:id.optional().describe('文件版本sourceId；用于sources或reads，不能当readId/evidenceId'),
 readId:id.optional().describe('某次宿主读取回执readId；仅用于reads，不赋予跨Run证据权限'),
 reportId:id.optional().describe('具体历史检查reportId；仅用于report'),
 itemId:id.optional().describe('该section中具体request/output/criterion/baseline/PRD条目的id'),
 limit:z.number().int().min(1).max(20).default(10),
 cursor:z.object({position:z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),textOffset:z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),version:hash}).strict().optional().describe('原样复制nextCursor；版本变化从第一页重读，不自行推算偏移'),
}).strict().superRefine((value,ctx)=>{
 if(value.sourceId&&!['sources','reads'].includes(value.section))ctx.addIssue({code:'custom',path:['sourceId'],message:'sourceId只用于sources/reads'});
 if(value.readId&&value.section!=='reads')ctx.addIssue({code:'custom',path:['readId'],message:'readId只用于reads'});
 if(value.reportId&&value.section!=='report')ctx.addIssue({code:'custom',path:['reportId'],message:'reportId只用于report'});
 if(value.itemId&&!['requests','outputs','criteria','baseline','prd'].includes(value.section))ctx.addIssue({code:'custom',path:['itemId'],message:'itemId只用于具体合同条目'});
});
export type TaskModelViewRequest=z.infer<typeof taskModelViewRequestSchema>;
export type TaskModelViewCursor=NonNullable<TaskModelViewRequest['cursor']>;
export type TaskModelViewItem={id:string;data:unknown}|{id:string;encoding:'json';itemHash:string;totalCharacters:number;textOffset:number;text:string;complete:false};
export type TaskModelView={
 schemaVersion:1;runId:string;section:TaskModelViewRequest['section'];state:'available'|'not_applicable';
 contract?:{id:string;revision:number;contractHash:string};version:string;items:TaskModelViewItem[];
 coverage:{partial:boolean;totalItems:number;omittedItems:number;fragmentedItems:number};nextCursor?:TaskModelViewCursor;
 notice:string;
};
export const taskModelViewResponseSchema=z.object({schemaVersion:z.literal(1),runId:id,section:z.enum(taskModelViewSections),state:z.enum(['available','not_applicable']),contract:z.object({id,revision:z.number().int().positive(),contractHash:hash}).strict().optional(),version:hash,items:z.array(z.union([
 z.object({id,data:z.unknown()}).strict(),
 z.object({id,encoding:z.literal('json'),itemHash:hash,totalCharacters:z.number().int().positive(),textOffset:z.number().int().nonnegative(),text:z.string().min(1),complete:z.literal(false)}).strict(),
])).max(20),coverage:z.object({partial:z.boolean(),totalItems:z.number().int().nonnegative(),omittedItems:z.number().int().nonnegative(),fragmentedItems:z.number().int().nonnegative()}).strict(),nextCursor:z.object({position:z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),textOffset:z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),version:hash}).strict().optional(),notice:z.string().max(2000)}).strict().refine(value=>JSON.stringify(value).length<=TASK_MODEL_VIEW_LIMIT,'完整模型响应最多12000字符');
