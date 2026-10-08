import {pathToFileURL} from 'node:url';
import path from 'node:path';

// The host owns limits. Harness observation adds only cleanup grace, never a
// shorter competing timeout. No fallback when the compiled policy is missing.
export function resolveObservationPolicy(limits,requestedSeconds){
 if(!Number.isInteger(limits?.durationMs)||limits.durationMs<=0||limits.durationMs%1000||!Number.isInteger(limits?.maxToolCalls)||limits.maxToolCalls<=0)throw Error('BUILT_RUN_POLICY_INVALID');
 const hostSeconds=limits.durationMs/1000,observeSeconds=requestedSeconds===undefined?hostSeconds:Number(requestedSeconds);
 if(!Number.isInteger(observeSeconds)||observeSeconds!==hostSeconds)throw Error('OBSERVATION_BUDGET_MUST_MATCH_HOST_POLICY');
 return{hostLimits:{durationMs:limits.durationMs,maxToolCalls:limits.maxToolCalls},hostSeconds,observeSeconds,graceSeconds:15,totalObservationMs:limits.durationMs+15000};
}

export async function loadObservationPolicy(repo,requestedSeconds){
 let module;
 try{module=await import(pathToFileURL(path.join(repo,'dist','main','run-limits.js')).href);}catch(error){if(error?.code==='ERR_MODULE_NOT_FOUND')throw Error('BUILT_RUN_POLICY_MISSING_REBUILD_REQUIRED');throw error;}
 return resolveObservationPolicy(module.DEFAULT_RUN_LIMITS,requestedSeconds);
}
