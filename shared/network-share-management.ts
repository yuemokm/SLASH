import {z} from 'zod';

export const shareAccountSchema=z.string().trim().min(1).max(256).refine(value=>!/[\u0000-\u001f]/.test(value),'账号包含控制字符');
const shareName=z.string().min(1).max(80).refine(value=>!/["\\/\[\]:|<>+=;,?*\u0000-\u001f]/.test(value)&&!/[ .]$/.test(value)&&value!=='.'&&value!=='..'&&!/^(?:ADMIN|IPC|[A-Z])\$$/i.test(value),'不能管理系统共享或无效共享名');
const localTarget={shareName,expectedPath:z.string().min(1).max(32767)};
const mappingTarget={drive:z.string().regex(/^[D-Z]:$/),expectedRemotePath:z.string().min(5).max(1024)};
export const sharePermissionInspectSchema=z.object({type:z.literal('sharePermissionInspect'),...localTarget}).strict();
export const sharePermissionUpdateSchema=z.object({type:z.literal('sharePermissionUpdate'),...localTarget,expectedFingerprint:z.string().regex(/^[a-f0-9]{64}$/),previousAccount:shareAccountSchema.optional(),account:shareAccountSchema,access:z.enum(['read_only','read_write'])}).strict();
export const shareStopSchema=z.object({type:z.literal('shareStop'),...localTarget}).strict();
export const shareDisconnectSchema=z.object({type:z.literal('shareDisconnect'),...mappingTarget,clearCredentials:z.boolean().default(false)}).strict();
export const shareReconnectSchema=z.object({type:z.literal('shareReconnect'),...mappingTarget,authentication:z.object({mode:z.literal('username-password'),username:shareAccountSchema,password:z.string().min(1).max(1024),saveCredentials:z.boolean().default(false)}).strict(),clearCredentials:z.boolean().default(false)}).strict();
export type SharePermissionUpdate=z.infer<typeof sharePermissionUpdateSchema>;
export type ShareStop=z.infer<typeof shareStopSchema>;
export type ShareDisconnect=z.input<typeof shareDisconnectSchema>;
export type ShareReconnect=z.input<typeof shareReconnectSchema>;
export type SharePermissionView={shareName:string;path:string;fingerprint:string;accounts:Array<{account:string;type:'Allow'|'Deny';access:'Read'|'Change'|'Full';sid?:string;canonicalName?:string;principalKind?:'user'|'group'|'unknown'}>;notice:string};
export function shareAuthorizationSelection(identity:{qualifiedName:string;sid?:string;status?:'verified'|'unavailable'},view:SharePermissionView){
 const verified=identity.status==='verified'&&!!identity.sid&&!!identity.qualifiedName;
 const current=verified?view.accounts.find(item=>item.sid===identity.sid&&item.principalKind!=='group'&&item.type==='Allow'):undefined;
 const denied=verified&&view.accounts.some(item=>item.sid===identity.sid&&item.type==='Deny');
 return{previousAccount:denied?'':current?.account??'',account:verified?identity.qualifiedName:'',access:(denied||current?.access==='Read'?'read_only':'read_write') as 'read_only'|'read_write',currentGranted:!!current&&!denied,currentDenied:denied,identityVerified:verified};
}
export type ShareManagementResult={status:'succeeded'|'failed'|'conflict'|'outcome_unknown'|'partial';diagnostic:string;mappingRemoved?:boolean;credentialsCleared?:boolean;diagnosticCode?:string};
