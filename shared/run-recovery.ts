import {z} from 'zod';

// Host-owned records. No model tool accepts or changes these fields.
export const recoveryRecordSchema=z.object({
 operationId:z.string().min(1),runId:z.string().min(1),tool:z.string().min(1),
 effect:z.enum(['read','draft','record','validation','connection','process','memory','runtime','unknown']),
 dispatch:z.enum(['not_sent','may_have_run','settled']),
 resolution:z.enum(['pending','verified_done','verified_not_done']),
 evidenceRefs:z.array(z.string().max(5000)),resolvedBy:z.enum(['host','user']).optional(),
 scopeHash:z.string().optional(),requestHash:z.string().optional(),
 summary:z.string().max(2000).optional(),
 processingCopy:z.object({id:z.string(),contentHash:z.string(),source:z.object({mountId:z.string(),path:z.string(),contentHash:z.string()}).strict().optional()}).strict().optional(),
 observedProcessingCopy:z.object({id:z.string(),contentHash:z.string()}).strict().optional(),
 updatedAt:z.string(),
}).strict();
export type RecoveryRecord=z.infer<typeof recoveryRecordSchema>;
export const reconcileRunOperationSchema=z.object({
 runId:z.string().min(1),operationId:z.string().min(1),expectedUpdatedAt:z.string(),
 contextToken:z.string().regex(/^[a-f0-9]{64}$/),
 resolution:z.enum(['verified_done','verified_not_done']),
 evidence:z.string().trim().min(8).max(5000),
}).strict();
export type ReconcileRunOperationInput=z.infer<typeof reconcileRunOperationSchema>;
export const runRecoveryViewSchema=z.object({runId:z.string(),contextToken:z.string(),blocked:z.boolean(),records:z.array(recoveryRecordSchema)}).strict();
export type RunRecoveryView=z.infer<typeof runRecoveryViewSchema>;
