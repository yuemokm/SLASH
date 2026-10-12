import {z} from 'zod';

const positive=z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const tokenObservation=z.union([positive,z.literal('absent'),z.literal('unknown')]);
export const productionWireSafeParametersSchema=z.object({
 source:z.enum(['pi-on-payload','unknown']),
 thinkingType:z.enum(['absent','enabled','disabled','adaptive','unrecognized','unknown']),
 reasoningEffort:z.enum(['absent','none','minimal','low','medium','high','xhigh','max','unrecognized','unknown']),
 maxTokens:tokenObservation,maxCompletionTokens:tokenObservation,maxOutputTokens:tokenObservation,
 nativeContextWindow:z.union([positive,z.literal('unknown')]),
}).strict();
export type ProductionWireSafeParameters=z.infer<typeof productionWireSafeParametersSchema>;
export const productionWireSafeEventSchema=z.object({
 eventId:z.string().uuid(),runId:z.string().uuid().nullable(),streamId:z.string().min(1).max(100),sequence:positive,
 type:z.enum(['state','status','delta','unknown']),occurredAt:z.string().datetime(),payloadValid:z.boolean(),
 source:z.enum(['provider_request','compaction_start','compaction_end','context_usage','auto_retry_start','auto_retry_end','other']),
 activity:z.enum(['model','tool','retry_wait','compacting','settled','missing','unknown']),
 compaction:z.object({reason:z.enum(['manual','threshold','overflow','unknown']),status:z.enum(['running','completed','failed','cancelled','unknown'])}).strict().optional(),
 parameters:productionWireSafeParametersSchema.optional(),
}).strict();
export type ProductionWireSafeEvent=z.infer<typeof productionWireSafeEventSchema>;
const digest=z.string().regex(/^[a-f0-9]{64}$/);
export const productionWireObservationEvidenceSchema=z.object({
 schemaVersion:z.literal(1),scope:z.literal('main_agent_session_payloads'),phaseBasis:z.literal('event_window_correlation'),
 runId:z.string().uuid(),streamId:z.string().min(1).max(100),safeEvents:z.array(productionWireSafeEventSchema).max(100000),
 window:z.object({count:z.number().int().nonnegative(),minSequence:positive.nullable(),maxSequence:positive.nullable(),complete:z.boolean(),reasons:z.array(z.string().regex(/^[A-Z_]+$/)),projectionHash:digest}).strict(),
 observations:z.array(z.object({sequence:positive,eventId:z.string().uuid(),stage:z.enum(['main_session','native_compaction','unknown']),purposeBasis:z.literal('event_window_correlation'),safeParameters:productionWireSafeParametersSchema,compactionStartSequence:positive.optional()}).strict()),
 nativeCompactionWindows:z.array(z.object({startSequence:positive,endSequence:positive,reason:z.enum(['manual','threshold','overflow']),endStatus:z.enum(['completed','failed','cancelled']),requestSequences:z.array(positive)}).strict()),
 mainProfileSignatures:z.array(z.object({signature:digest,parameters:productionWireSafeParametersSchema,count:positive}).strict()),
 latestRequestParameters:productionWireSafeParametersSchema.nullable(),latestMainSessionParameters:productionWireSafeParametersSchema.nullable(),
 comparable:z.boolean(),comparisonReasons:z.array(z.string().regex(/^[A-Z_]+$/)),providerInternalCapability:z.literal('unknown'),
}).strict();
export type ProductionWireObservationEvidence=z.infer<typeof productionWireObservationEvidenceSchema>;
export const productionWireCanonicalIdentitySchema=z.object({schemaVersion:z.literal(1),scope:z.literal('main_agent_session_payloads'),phaseBasis:z.literal('event_window_correlation'),mainProfile:productionWireSafeParametersSchema}).strict();
export type ProductionWireCanonicalIdentity=z.infer<typeof productionWireCanonicalIdentitySchema>;
