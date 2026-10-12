import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {productionWireSafeEventSchema,productionWireObservationEvidenceSchema,productionWireCanonicalIdentitySchema,type ProductionWireSafeEvent,type ProductionWireSafeParameters,type ProductionWireObservationEvidence} from '../shared/production-wire-observations.js';

function sorted(value:unknown):unknown{if(Array.isArray(value))return value.map(sorted);if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([,item])=>item!==undefined).sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>[key,sorted(item)]));return value;}
export function productionWireProjectionHash(value:unknown){return createHash('sha256').update(JSON.stringify(sorted(value))).digest('hex');}
function known(parameters:ProductionWireSafeParameters){return parameters.source==='pi-on-payload'&&!Object.values(parameters).some(value=>value==='unknown'||value==='unrecognized');}

/** Only the complete observed main-session event stream is classified. This does not certify provider internals. */
export function analyzeProductionWireObservations(input:{runId:string;streamId:string;events:ProductionWireSafeEvent[]}):ProductionWireObservationEvidence{
 const events=input.events.map(event=>productionWireSafeEventSchema.parse(event)).sort((a,b)=>a.sequence-b.sequence),reasons=new Set<string>();
 const observations:ProductionWireObservationEvidence['observations']=[],windows:ProductionWireObservationEvidence['nativeCompactionWindows']=[];
 const ids=new Set<string>(),sequences=new Set<number>();let active:ProductionWireSafeEvent|undefined;
 let lastTime=-Infinity;
 if(input.streamId!=='run:'+input.runId)reasons.add('STREAM_BINDING_MISMATCH');
 if(!events.length)reasons.add('EMPTY_WINDOW');
 for(let index=0;index<events.length;index++){
  const event=events[index];
  if(event.sequence!==index+1)reasons.add('SEQUENCE_GAP');
  if(sequences.has(event.sequence))reasons.add('DUPLICATE_SEQUENCE');if(ids.has(event.eventId))reasons.add('DUPLICATE_EVENT');sequences.add(event.sequence);ids.add(event.eventId);
  if(event.streamId!==input.streamId||event.runId!==input.runId)reasons.add('EVENT_BINDING_MISMATCH');
  if(!event.payloadValid)reasons.add('INVALID_PAYLOAD');if(event.type==='unknown')reasons.add('UNKNOWN_EVENT_TYPE');
  const time=Date.parse(event.occurredAt);if(time<lastTime)reasons.add('TIME_ORDER_AMBIGUOUS');lastTime=time;
  if(event.type!=='status'){if(event.source!=='other')reasons.add('SOURCE_TYPE_MISMATCH');continue;}
  if(event.source==='compaction_start'){
   if(active)reasons.add('OVERLAPPING_COMPACTION');
   if(event.activity!=='compacting'||event.compaction?.status!=='running'||!event.compaction||event.compaction.reason==='unknown')reasons.add('INVALID_COMPACTION_START');
   active=event;
  }else if(event.source==='compaction_end'){
   if(!active){reasons.add('UNPAIRED_COMPACTION_END');continue;}
   if(event.activity!=='model'||!event.compaction||event.compaction.reason==='unknown'||event.compaction.reason!==active.compaction?.reason||event.compaction.status==='running'||event.compaction.status==='unknown')reasons.add('INVALID_COMPACTION_END');
   else windows.push({startSequence:active.sequence,endSequence:event.sequence,reason:event.compaction.reason,endStatus:event.compaction.status,requestSequences:observations.filter(row=>row.compactionStartSequence===active!.sequence).map(row=>row.sequence)});
   active=undefined;
  }else if(event.source==='provider_request'){
   const parameters=event.parameters??{source:'unknown',thinkingType:'unknown',reasoningEffort:'unknown',maxTokens:'unknown',maxCompletionTokens:'unknown',maxOutputTokens:'unknown',nativeContextWindow:'unknown'};
   if(!known(parameters))reasons.add('UNKNOWN_PARAMETERS');
   let stage:'main_session'|'native_compaction'|'unknown'='unknown';
   if(active){if(event.activity==='compacting'&&event.compaction?.status==='running'&&event.compaction.reason===active.compaction?.reason&&event.compaction.reason!=='unknown')stage='native_compaction';}
   else if((event.activity==='model'||event.activity==='retry_wait')&&event.compaction?.status!=='running')stage='main_session';
   if(stage==='unknown')reasons.add('UNKNOWN_REQUEST_STAGE');
   observations.push({sequence:event.sequence,eventId:event.eventId,stage,purposeBasis:'event_window_correlation',safeParameters:parameters,...(stage==='native_compaction'?{compactionStartSequence:active!.sequence}:{})});
  }
 }
 if(active)reasons.add('UNCLOSED_COMPACTION');
 const profiles=new Map<string,{signature:string;parameters:ProductionWireSafeParameters;count:number}>();
 for(const item of observations.filter(item=>item.stage==='main_session')){const signature=productionWireProjectionHash(item.safeParameters),prior=profiles.get(signature);if(prior)prior.count++;else profiles.set(signature,{signature,parameters:item.safeParameters,count:1});}
 const comparisonReasons=[...reasons];if(!profiles.size)comparisonReasons.push('NO_MAIN_REQUEST');if(profiles.size>1)comparisonReasons.push('MAIN_PROFILE_DRIFT');
 const complete=reasons.size===0;
 return productionWireObservationEvidenceSchema.parse({schemaVersion:1,scope:'main_agent_session_payloads',phaseBasis:'event_window_correlation',runId:input.runId,streamId:input.streamId,safeEvents:events,window:{count:events.length,minSequence:events[0]?.sequence??null,maxSequence:events.at(-1)?.sequence??null,complete,reasons:[...reasons].sort(),projectionHash:productionWireProjectionHash(events)},observations,nativeCompactionWindows:windows,mainProfileSignatures:[...profiles.values()].sort((a,b)=>a.signature.localeCompare(b.signature)),latestRequestParameters:observations.at(-1)?.safeParameters??null,latestMainSessionParameters:observations.filter(item=>item.stage==='main_session').at(-1)?.safeParameters??null,comparable:complete&&profiles.size===1,comparisonReasons:[...new Set(comparisonReasons)].sort(),providerInternalCapability:'unknown'});
}

/** Internal consistency only. A collector must additionally re-read and bind the actual SQLite projection. */
export function verifyProductionWireObservations(value:unknown):value is ProductionWireObservationEvidence{
 try{const parsed=productionWireObservationEvidenceSchema.parse(value),rebuilt=analyzeProductionWireObservations({runId:parsed.runId,streamId:parsed.streamId,events:parsed.safeEvents});return productionWireProjectionHash(parsed)===productionWireProjectionHash(rebuilt);}catch{return false;}
}
export function canonicalProductionWireIdentity(value:ProductionWireObservationEvidence){
 if(!verifyProductionWireObservations(value)||!value.comparable||!value.window.complete||value.mainProfileSignatures.length!==1)throw Error('PRODUCTION_WIRE_IDENTITY_UNKNOWN');
 return productionWireCanonicalIdentitySchema.parse({schemaVersion:1,scope:value.scope,phaseBasis:value.phaseBasis,mainProfile:value.mainProfileSignatures[0].parameters});
}

const sources=['provider_request','compaction_start','compaction_end','context_usage','auto_retry_start','auto_retry_end'] as const;
const activities=['model','tool','retry_wait','compacting','settled'],thinking=['absent','enabled','disabled','adaptive','unrecognized'],efforts=['absent','none','minimal','low','medium','high','xhigh','max','unrecognized'];
function enumValue(value:unknown,allowed:readonly string[],missing='unknown'){return value==null?missing:allowed.includes(String(value))?String(value):'unknown';}
function numeric(value:unknown,missing:'absent'|'unknown'){return value==null?missing:typeof value==='number'&&Number.isSafeInteger(value)&&value>0?value:'unknown';}

/** Never selects the event text or JSON payload as a returned value. Bad records remain in the sequence. */
export function readProductionWireObservations(input:{databasePath:string;runId:string}):ProductionWireObservationEvidence{
 const db=new DatabaseSync(input.databasePath,{readOnly:true});
 try{
  db.exec('PRAGMA query_only=ON');
  const extract=(field:string)=>`CASE WHEN json_valid(payload) THEN json_extract(payload,'$.runtimeStatus.${field}') ELSE NULL END`;
  const rows=db.prepare(`SELECT event_id AS eventId,stream_id AS streamId,sequence,type,run_id AS runId,occurred_at AS occurredAt,
   CASE WHEN json_valid(payload) AND json_type(payload)='object' THEN json_extract(payload,'$.eventId')=event_id AND json_extract(payload,'$.streamId')=stream_id AND json_extract(payload,'$.sequence')=sequence AND json_extract(payload,'$.runId')=run_id AND json_extract(payload,'$.type')=type AND json_extract(payload,'$.occurredAt')=occurred_at AND NULLIF(json_extract(payload,'$.text'),'') IS text ELSE 0 END AS payloadValid,
   CASE WHEN type='status' AND text IN ('provider_request','compaction_start','compaction_end','context_usage','auto_retry_start','auto_retry_end') THEN text ELSE 'other' END AS source,
   ${extract('activity')} AS activity,${extract('compaction')} IS NOT NULL AS hasCompaction,${extract('compaction.reason')} AS reason,${extract('compaction.status')} AS compactionStatus,
   ${extract('requestDiagnostics')} IS NOT NULL AS hasParameters,${extract('requestDiagnostics.source')} AS parameterSource,${extract('requestDiagnostics.thinkingType')} AS thinkingType,${extract('requestDiagnostics.reasoningEffort')} AS reasoningEffort,
   ${extract('requestDiagnostics.maxTokens')} AS maxTokens,${extract('requestDiagnostics.maxCompletionTokens')} AS maxCompletionTokens,${extract('requestDiagnostics.maxOutputTokens')} AS maxOutputTokens,${extract('context.contextWindow')} AS nativeContextWindow
   FROM events WHERE stream_id=? ORDER BY sequence`).all('run:'+input.runId);
  const events=rows.map(row=>productionWireSafeEventSchema.parse({eventId:row.eventId,streamId:row.streamId,sequence:row.sequence,type:['state','status','delta'].includes(String(row.type))?row.type:'unknown',runId:row.runId,occurredAt:row.occurredAt,payloadValid:!!row.payloadValid,source:sources.includes(row.source as typeof sources[number])?row.source:'other',activity:enumValue(row.activity,activities,'missing'),...(row.hasCompaction?{compaction:{reason:enumValue(row.reason,['manual','threshold','overflow']),status:enumValue(row.compactionStatus,['running','completed','failed','cancelled'])}}:{}),...(row.hasParameters||row.source==='provider_request'?{parameters:{source:enumValue(row.parameterSource,['pi-on-payload']),thinkingType:enumValue(row.thinkingType,thinking),reasoningEffort:enumValue(row.reasoningEffort,efforts),maxTokens:numeric(row.maxTokens,'absent'),maxCompletionTokens:numeric(row.maxCompletionTokens,'absent'),maxOutputTokens:numeric(row.maxOutputTokens,'absent'),nativeContextWindow:numeric(row.nativeContextWindow,'unknown')}}:{})}));
  return analyzeProductionWireObservations({runId:input.runId,streamId:'run:'+input.runId,events});
 }finally{db.close();}
}
