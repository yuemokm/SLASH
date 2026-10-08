import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import type {DecisionHistoryEntry,DecisionRecord,DecisionSourceRef,DecisionStatus} from '../shared/types.js';

const idSchema=z.string().trim().min(1).max(200);
const textSchema=z.string().trim().min(1).max(20_000);
const shortTextSchema=z.string().trim().min(1).max(500);
const timestampSchema=z.string().datetime({offset:true});
const sourceRefSchema=z.object({kind:z.enum(['conversation','file','requirement','artifact','review','run','manual']),id:idSchema,label:z.string().trim().max(500).optional(),path:z.string().trim().max(32_767).optional()}).strict();
const historySchema=z.object({from:z.enum(['pending','confirmed','rejected','needs_verification','superseded']),to:z.enum(['pending','confirmed','rejected','needs_verification','superseded']),at:timestampSchema,actor:shortTextSchema.optional(),note:textSchema.optional()}).strict();
export const decisionRecordSchema=z.object({
 id:idSchema,
 workspaceId:idSchema,
 kind:z.enum(['assumption','confirmed_fact','design_tradeoff','delivery_blocker','decision']),
 title:shortTextSchema,
 description:textSchema,
 status:z.enum(['pending','confirmed','rejected','needs_verification','superseded']),
 sourceRefs:z.array(sourceRefSchema).min(1).max(50),
 requirementIds:z.array(idSchema).max(200),
 artifactIds:z.array(idSchema).max(200),
 conversationIds:z.array(idSchema).max(200),
 impact:textSchema,
 nextAction:textSchema,
 confirmedBy:shortTextSchema.optional(),
 confirmedAt:timestampSchema.optional(),
 createdAt:timestampSchema,
 updatedAt:timestampSchema,
 history:z.array(historySchema).max(100),
}).strict().superRefine((value,ctx)=>{
 const fields=[['sourceRefs',value.sourceRefs.map(item=>item.id)],['requirementIds',value.requirementIds],['artifactIds',value.artifactIds],['conversationIds',value.conversationIds]] as const;
 for(const [field,values] of fields)if(new Set(values).size!==values.length)ctx.addIssue({code:'custom',path:[field],message:'引用 ID 不能重复'});
 if(value.status==='confirmed'&&(!value.confirmedBy||!value.confirmedAt))ctx.addIssue({code:'custom',path:['confirmedBy'],message:'已确认决策必须记录确认人和时间'});
});

type DecisionState={schemaVersion:1;revision:number;records:DecisionRecord[];updatedAt:string};
export type DecisionInput=Omit<DecisionRecord,'id'|'status'|'confirmedAt'|'createdAt'|'updatedAt'|'history'> & {status?:DecisionStatus};
export type DecisionRepositoryKv={get<T>(key:string,fallback:T):T;set(key:string,value:unknown):void};

function emptyState(at:string):DecisionState{return{schemaVersion:1,revision:0,records:[],updatedAt:at};}
function copy<T>(value:T):T{return structuredClone(value);}
function fail(code:string,message:string):never{throw Error(`${code}: ${message}`);}

export class DecisionRepository{
 private readonly key:string;
 private readonly clock:()=>string;
 private readonly makeId:()=>string;
 constructor(private readonly kv:DecisionRepositoryKv,options:{key:string;clock?:()=>string;id?:()=>string}){this.key=options.key;this.clock=options.clock??(()=>new Date().toISOString());this.makeId=options.id??randomUUID;this.read();}
 private read(){const raw=this.kv.get<unknown>(this.key,null);if(raw===null){const state=emptyState(this.clock());this.kv.set(this.key,state);return state;}const parsed=z.object({schemaVersion:z.literal(1),revision:z.number().int().nonnegative(),records:z.array(decisionRecordSchema).max(100_000),updatedAt:timestampSchema}).strict().safeParse(raw);if(!parsed.success)fail('DECISION_RECORDS_INVALID',parsed.error.issues.map(issue=>`${issue.path.join('.')}: ${issue.message}`).join('; '));return parsed.data;}
 private mutate<T>(expectedRevision:number|undefined,change:(state:DecisionState,at:string)=>T):T{const state=this.read();if(expectedRevision!==undefined&&state.revision!==expectedRevision)fail('DECISION_REVISION_CONFLICT',`期望 ${expectedRevision}，实际 ${state.revision}`);const at=this.clock();const result=change(state,at);state.revision+=1;state.updatedAt=at;const parsed=z.object({schemaVersion:z.literal(1),revision:z.number().int().nonnegative(),records:z.array(decisionRecordSchema).max(100_000),updatedAt:timestampSchema}).strict().parse(state);this.kv.set(this.key,parsed);return copy(result);}
 snapshot(){return copy(this.read());}
 list(workspaceId:string){return copy(this.read().records.filter(record=>record.workspaceId===workspaceId).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)));}
 create(input:DecisionInput,expectedRevision?:number){return this.mutate(expectedRevision,(state,at)=>{const value=decisionRecordSchema.parse({...input,id:this.makeId(),status:input.status??'pending',createdAt:at,updatedAt:at,history:[]});state.records.push(value);return value;});}
 transition(id:string,status:DecisionStatus,details:{actor?:string;note?:string}={},expectedRevision?:number){return this.mutate(expectedRevision,(state,at)=>{const record=state.records.find(item=>item.id===id);if(!record)fail('DECISION_NOT_FOUND',id);if(record.status===status)return record;const allowed:Record<DecisionStatus,DecisionStatus[]>={pending:['confirmed','rejected','needs_verification','superseded'],confirmed:['pending','needs_verification','superseded'],rejected:['pending','superseded'],needs_verification:['pending','confirmed','rejected','superseded'],superseded:[]};if(!allowed[record.status].includes(status))fail('INVALID_DECISION_TRANSITION',`${record.status} -> ${status}`);if(status==='confirmed'&&!details.actor?.trim())fail('DECISION_CONFIRMER_REQUIRED','确认决策必须填写确认人');const next=decisionRecordSchema.parse({...record,status,confirmedBy:status==='confirmed'?details.actor?.trim():record.confirmedBy,confirmedAt:status==='confirmed'?at:record.confirmedAt,updatedAt:at,history:[...record.history,{from:record.status,to:status,at,actor:details.actor?.trim()||undefined,note:details.note?.trim()||undefined} as DecisionHistoryEntry]});Object.assign(record,next);return record;});}
}

export function decisionRepositoryKey(workspaceId:string){return `decision-records:v1:${workspaceId}`;}
