import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {productionFileEvidenceSchema} from '../shared/production-agent-evaluation.js';
import {productionWireObservationEvidenceSchema,type ProductionWireObservationEvidence,type ProductionWireSafeParameters} from '../shared/production-wire-observations.js';
import {readProductionWireObservations,verifyProductionWireObservations,canonicalProductionWireIdentity,productionWireProjectionHash} from './production-wire-observations.js';
import {evaluationHash,requireEvaluationPath} from './quality-evaluation.js';
const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
export function productionEffectiveParametersFromWire(parameters:ProductionWireSafeParameters|null){
 if(!parameters)throw Error('PRODUCTION_WIRE_REQUEST_MISSING');
 const max=[parameters.maxTokens,parameters.maxCompletionTokens,parameters.maxOutputTokens].find(value=>typeof value==='number');
 return{contextWindow:parameters.nativeContextWindow,requestObservationSource:parameters.source,maxOutputTokens:max??([parameters.maxTokens,parameters.maxCompletionTokens,parameters.maxOutputTokens].every(v=>v==='absent')?'provider_default_observed_omission':'unknown'),thinkingType:parameters.thinkingType,reasoningEffort:parameters.reasoningEffort};
}
/** Re-read the full actual SQLite window. Self-consistent JSON alone is insufficient. */
export async function verifyProductionWireStep(input:{caseDir:string;record:any;start:any}){
 const {caseDir,record,start}=input;if(start.identityProfile!=='observed-wire-v1'||record.identityProfile!==start.identityProfile)throw Error('PRODUCTION_WIRE_PROFILE_UNBOUND');
 const reference=productionFileEvidenceSchema.parse(record.wireObservationEvidence),file=await requireEvaluationPath(caseDir,path.resolve(reference.path));
 if(file!==path.join(caseDir,`production-wire-${record.index}.json`)||await evaluationHash(file)!==reference.sha256)throw Error('PRODUCTION_WIRE_EVIDENCE_CHANGED');
 const evidence=productionWireObservationEvidenceSchema.parse(JSON.parse(await fs.readFile(file,'utf8'))),databasePath=await requireEvaluationPath(caseDir,path.join(caseDir,'profile','slash.sqlite'));
 if(evidence.runId!==record.run.id||evidence.streamId!=='run:'+record.run.id||!verifyProductionWireObservations(evidence))throw Error('PRODUCTION_WIRE_RUN_UNBOUND');
 const actual=readProductionWireObservations({databasePath,runId:record.run.id});if(productionWireProjectionHash(actual)!==productionWireProjectionHash(evidence))throw Error('PRODUCTION_WIRE_DATABASE_CHANGED');
 canonicalProductionWireIdentity(actual);
 if(productionWireProjectionHash(productionEffectiveParametersFromWire(actual.latestRequestParameters))!==productionWireProjectionHash(record.effectiveParameters))throw Error('PRODUCTION_WIRE_LAST_DIAGNOSTICS_MISMATCH');
 const db=new DatabaseSync(databasePath,{readOnly:true});try{
  const row=db.prepare("SELECT json_extract(r.value,'$.startedAt') startedAt,json_extract(r.value,'$.finishedAt') finishedAt,json_extract(r.value,'$.status') status FROM kv,json_each(json_extract(kv.value,'$.runs')) r WHERE kv.key='state' AND json_extract(r.value,'$.id')=?").get(record.run.id) as any;
  const began=Date.parse(row?.startedAt),ended=Date.parse(row?.finishedAt),captured=Date.parse(record.capturedAt);if(![began,ended,captured].every(Number.isFinite)||!['succeeded','failed','interrupted','cancelled','awaiting_plan'].includes(row.status)||ended<began||captured<ended||actual.safeEvents.some(event=>Date.parse(event.occurredAt)<began||Date.parse(event.occurredAt)>captured)||actual.observations.some(event=>Date.parse(actual.safeEvents.find(row=>row.sequence===event.sequence)!.occurredAt)>ended))throw Error('PRODUCTION_WIRE_TIME_UNBOUND');
  const model=db.prepare("SELECT json_extract(m.value,'$.id') id,json_extract(m.value,'$.provider') provider,json_extract(m.value,'$.modelId') modelId,json_extract(m.value,'$.protocol') protocol,json_extract(m.value,'$.baseUrl') baseUrl,json_extract(m.value,'$.proxyUrl') proxyUrl,json_extract(m.value,'$.contextWindow') contextWindow,json_extract(m.value,'$.maxTokens') maxTokens FROM kv,json_each(json_extract(kv.value,'$.models')) m WHERE kv.key='state' AND json_extract(m.value,'$.id')=?").get(start.modelConfiguration.id) as any;
  if(!model)throw Error('PRODUCTION_WIRE_MODEL_SNAPSHOT_MISSING');const publicModel={id:model.id,provider:model.provider,modelId:model.modelId,protocol:model.protocol,baseUrlHash:hash(model.baseUrl??''),proxyUrlHash:hash(model.proxyUrl??''),contextWindow:model.contextWindow??null,maxTokens:model.maxTokens??null};
  if(productionWireProjectionHash(publicModel)!==productionWireProjectionHash(start.modelConfiguration))throw Error('PRODUCTION_WIRE_MODEL_CONFIGURATION_CHANGED');
 }finally{db.close();}
 return evidence;
}
export function productionObservedWireParameters(start:any,evidence:ProductionWireObservationEvidence[]){
 if(!evidence.length)throw Error('PRODUCTION_WIRE_REQUEST_MISSING');const identity=canonicalProductionWireIdentity(evidence[0]);if(evidence.some(value=>productionWireProjectionHash(canonicalProductionWireIdentity(value))!==productionWireProjectionHash(identity)))throw Error('PRODUCTION_WIRE_STEP_PROFILE_CHANGED');
 return{identityProfile:'observed-wire-v1',contextWindow:start.modelConfiguration.contextWindow,maxTokens:start.modelConfiguration.maxTokens,mainSession:identity};
}
