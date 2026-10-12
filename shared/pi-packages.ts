import {z} from 'zod';
export type PiObservabilityView={enabled:boolean;baseUrl:string;publicKey:string;hasSecret:boolean;mode:'metadata'};
export type PiPackageView={id:string;name:string;version:string;license:string;installed:boolean;error?:string};
export type PiPackagesView={packages:PiPackageView[];observability:PiObservabilityView};
export type PiChildTaskView={id:string;parentRunId:string;agentId?:string;agentName?:string;state:'running'|'succeeded'|'failed'|'cancelled';purpose:'research'|'check';toolCount:number;durationMs:number;modelId:string;error?:string};
export type PiPlanReviewView={reviewId:string;url:string;planHash:string;status:'awaiting_user'|'approved'|'needs_changes'|'cancelled'};
export const piPackageRequestSchemas=[
 z.object({type:z.literal('piPackages')}),
 z.object({type:z.literal('piPlanReviewCancel'),runId:z.string().trim().min(1).max(200)}),
 z.object({type:z.literal('piPlanReviewOpen'),runId:z.string().trim().min(1).max(200)}),
 z.object({type:z.literal('piObservabilitySave'),config:z.object({enabled:z.boolean(),baseUrl:z.string().trim().max(4096),publicKey:z.string().trim().max(2000),secretKey:z.string().trim().max(10000).optional(),mode:z.literal('metadata')}).strict()}),
] as const;
