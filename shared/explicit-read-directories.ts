import {z} from 'zod';

/** Host-issued history. This record never supplies directory authority by itself. */
export const explicitDirectoryReadGrantSchema=z.object({
 version:z.literal(1),
 runId:z.string().min(1).max(200),
 mountId:z.string().min(1).max(200),
 requestHash:z.string().regex(/^[a-f0-9]{64}$/),
 inputRecordId:z.uuid().optional(),
 inputRequestId:z.uuid().optional(),
 directory:z.string().min(1).max(32767),
 userPathQuote:z.string().min(1).max(32767),
 createdAt:z.string().datetime({offset:true}),
}).strict();
export type ExplicitDirectoryReadGrant=z.infer<typeof explicitDirectoryReadGrantSchema>;
