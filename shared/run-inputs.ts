import {z} from 'zod';

export const RUN_INPUT_LIMITS=Object.freeze({messages:20,messageCharacters:20_000,totalCharacters:100_000,wireCharacters:100_000});
export const runInputDeliverySchema=z.enum(['steer','follow_up']);
export const runInputEnqueueSchema=z.object({runId:z.string().min(1).max(200),requestId:z.uuid(),text:z.string().min(1).max(RUN_INPUT_LIMITS.messageCharacters).refine(value=>Boolean(value.trim()),'追加指令不能为空'),delivery:runInputDeliverySchema}).strict();
export const runInputClearSchema=z.object({runId:z.string().min(1).max(200)}).strict();
export const runInputMutateSchema=z.object({runId:z.string().min(1).max(200),inputId:z.uuid(),expectedRevision:z.number().int().nonnegative(),action:z.enum(['edit','cancel','send_now']),text:z.string().min(1).max(RUN_INPUT_LIMITS.messageCharacters).refine(value=>Boolean(value.trim()),'追加指令不能为空').optional()}).strict().superRefine((input,ctx)=>{if(input.action==='edit'?!input.text:input.text!==undefined)ctx.addIssue({code:'custom',path:['text'],message:'只有编辑操作必须提供补充正文'});});
export type RunInputMutation=z.infer<typeof runInputMutateSchema>;
export const runInputRecordSchema=z.object({id:z.uuid(),requestId:z.uuid(),delivery:runInputDeliverySchema,text:z.string().min(1).max(RUN_INPUT_LIMITS.messageCharacters),status:z.enum(['queued','delivered','unknown','cancelled']),createdAt:z.iso.datetime(),revision:z.number().int().nonnegative().optional(),updatedAt:z.iso.datetime().optional(),submittedAt:z.iso.datetime().optional(),deliveredAt:z.iso.datetime().optional(),nativeMessageTimestamp:z.number().int().nonnegative().optional(),wireHash:z.string().regex(/^[a-f0-9]{64}$/).optional(),reason:z.string().max(300).optional()}).strict();
export type RunInputRecord=z.infer<typeof runInputRecordSchema>;
export type RunInputEnqueue=z.infer<typeof runInputEnqueueSchema>;
export type RunInputReceipt=Pick<RunInputRecord,'id'|'requestId'|'status'>;
export const RUN_INPUT_DELIVERY_NOTICE='已送达表示Agent已收到补充，不代表任务完成。重启后未确认送达的内容不会自动重发。';
export const RUN_INPUT_REASON_LABELS:Readonly<Record<string,string>>=Object.freeze({RUN_INPUT_SKILL_NOT_FOUND:'没有找到可用技能，追加指令未发送。',RUN_INPUT_SKILL_CHANGED:'技能内容已变化，请在新任务中重新加载。',RUN_INPUT_AUTHORIZATION_CHANGED:'目录或能力授权已撤销，追加指令未发送。',RUN_INPUT_CANCELLED:'任务已取消，追加指令未发送。',RUN_INPUT_RUN_ENDED:'本轮任务已结束，追加指令未发送。',RUN_INPUT_PREPARATION_UNAVAILABLE:'追加指令未能准备完成，请核对后重新发送。',RUN_INPUT_PREPARED_BUDGET_EXCEEDED:'展开后的追加指令超过本轮输入限制，未发送。',RUN_INPUT_SUBMISSION_UNCONFIRMED:'无法确认追加指令是否已提交，请先核对，不会自动重发。',RUN_INPUT_CLEAR_UNCONFIRMED:'无法确认追加指令是否已被清除，不会自动重发。',RUN_INPUT_RESTART_UNCONFIRMED:'应用退出前未确认送达，不会自动重发。',RUN_INPUT_CLEARED:'已清除待发送指令。'});
export const runInputRecordsSchema=z.array(runInputRecordSchema).max(RUN_INPUT_LIMITS.messages).refine(records=>new Set(records.map(record=>record.id)).size===records.length&&new Set(records.map(record=>record.requestId)).size===records.length,'追加指令标识须唯一').refine(records=>records.reduce((total,record)=>total+record.text.length,0)<=RUN_INPUT_LIMITS.totalCharacters,'本轮追加指令总量超限');

/** On restart, never infer native delivery from the host's submission intent. */
export function recoverRunInputs(value:unknown):RunInputRecord[]{return runInputRecordsSchema.parse(value).map(record=>record.status==='queued'?{...record,status:'unknown',reason:'RUN_INPUT_RESTART_UNCONFIRMED'}:record);}
