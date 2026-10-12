import {z} from 'zod';

/** Host-owned failure metadata. Never classify a returned document/web body. */
export const toolFailureSchema=z.discriminatedUnion('kind',[
 z.object({kind:z.literal('correctable'),code:z.string().min(1),message:z.string(),toolName:z.string().optional(),action:z.literal('correct_input')}),
 z.object({kind:z.literal('permission'),code:z.string().min(1),message:z.string(),toolName:z.string().optional(),action:z.literal('respect_permission')}),
 z.object({kind:z.literal('cancelled'),code:z.string().min(1),message:z.string(),toolName:z.string().optional(),action:z.literal('stop_run')}),
 z.object({kind:z.literal('fatal'),code:z.string().min(1),message:z.string(),toolName:z.string().optional(),action:z.literal('stop_run')}),
 z.object({kind:z.literal('unknown'),code:z.string().min(1),message:z.string(),toolName:z.string().optional(),action:z.literal('reconcile_before_retry')}),
]);
export type ToolFailure=z.infer<typeof toolFailureSchema>;
export const toolFailureExamples:ToolFailure[]=[
 {kind:'correctable',code:'VERSION_CONFLICT',message:'重新读取当前版本',action:'correct_input'},
 {kind:'permission',code:'PERMISSION_DENIED',message:'目录未授权',action:'respect_permission'},
 {kind:'cancelled',code:'CANCELLED',message:'任务已停止',action:'stop_run'},
 {kind:'fatal',code:'TOOL_CATALOG_CONTROLLED_SHELL_MISMATCH',message:'受控工具身份不一致',action:'stop_run'},
 {kind:'unknown',code:'PROCESS_OUTCOME_UNKNOWN',message:'命令可能已产生副作用',action:'reconcile_before_retry'},
];
export class HostToolError extends Error {
 constructor(public readonly failure:ToolFailure){super(failure.message);this.name='HostToolError';}
}
const fatalCode=/^(?:TOOL_CATALOG_(?:NOT_READY|REGISTRY_MISMATCH|CONTROLLED_SHELL_MISMATCH|RELOAD_FAILED)|TOOL_BUDGET_EXCEEDED|TIME_BUDGET_EXCEEDED|INTERNAL_ERROR|HOST_INVARIANT_FAILED|DATABASE_CORRUPT|STORE_UNAVAILABLE|SQLITE_(?:CORRUPT|NOTADB|IOERR|FULL|MISUSE)(?:_.*)?|EIO|ENOSPC|PI_[A-Z_]*HOST_UNAVAILABLE)$/;
const unknownCode=/^(?:PROCESS_OUTCOME_UNKNOWN|PI_MEMORY_OUTCOME_UNKNOWN|EXTERNAL_OUTCOME_UNKNOWN|EXTERNAL_RESULT_UNKNOWN|RUN_REQUIRES_RECONCILIATION)$/;
export function classifyToolFailure(error:unknown,context:{toolName?:string;cancelled?:boolean}={}):ToolFailure{
 if(error instanceof HostToolError)return toolFailureSchema.parse({...error.failure,...(context.toolName?{toolName:context.toolName}:{})});
 const message=error instanceof Error?error.message:String(error);
 const nativeCode=error&&typeof error==='object'&&'code'in error&&typeof error.code==='string'?error.code:undefined;
 const code=nativeCode??message.match(/^([A-Z][A-Z0-9_]+)(?::|$)/)?.[1]??(error instanceof z.ZodError?'TOOL_INPUT_INVALID':'TOOL_ERROR');
 const base={code,message,...(context.toolName?{toolName:context.toolName}:{})};
 // Cancellation does not erase a known failure or an unknown external effect.
 if(unknownCode.test(code))return{...base,kind:'unknown',action:'reconcile_before_retry'};
 const sqliteFatal=code==='ERR_SQLITE_ERROR'&&error&&typeof error==='object'&&'errcode'in error&&typeof error.errcode==='number'&&[10,11,13,21,26].includes(error.errcode&255);
 if(fatalCode.test(code)||sqliteFatal)return{...base,kind:'fatal',action:'stop_run'};
 if(code==='CANCELLED'||code==='ABORT_ERR'||(error instanceof Error&&error.name==='AbortError'))return{...base,kind:'cancelled',action:'stop_run'};
 if(/(?:PERMISSION|AUTHORIZATION|APPROVAL|PLAN_TOOL|NETWORK_TARGET|CREDENTIAL_LEAK|REFERENCE_PROCESS|TASK_REPAIR_SIDE_EFFECT).*?(?:DENIED|CHANGED|BLOCKED|REJECTED)|^PERMISSION_DENIED$/.test(code))return{...base,kind:'permission',action:'respect_permission'};
 return{...base,kind:'correctable',action:'correct_input'};
}
export function toolFailureStopsRun(failure:ToolFailure){return failure.kind==='fatal'||failure.kind==='unknown'||failure.kind==='cancelled';}
