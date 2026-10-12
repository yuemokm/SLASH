import {performance} from 'node:perf_hooks';
import {prototypeDiagnosticStopReasonSchema,prototypeRuntimeErrorSchema,type PrototypeRuntimeError,type PrototypeCaseDiagnostics,type PrototypeDiagnosticPhase} from '../shared/prototype-acceptance.js';

type RuntimeObservation=Omit<PrototypeRuntimeError,'phase'|'stepIndex'>;
/** Interpret a few exact browser error shapes, then discard all source text.
 * Locations must refer to this execution's immutable snapshot and origin. */
export function sanitizePrototypeRuntimeError(description:unknown,origin:string,snapshotPaths:ReadonlySet<string>):RuntimeObservation{
 const result:RuntimeObservation={category:'generic_runtime',errorType:'other',locations:[]};
 if(typeof description!=='string')return result;
 const lines=description.slice(0,8192).split('\n',7),first=lines[0];
 const prefix=/^(TypeError|ReferenceError|HierarchyRequestError|SyntaxError|RangeError|Error): /.exec(first);
 if(prefix)result.errorType=prefix[1] as RuntimeObservation['errorType'];
 const identifier='[A-Za-z_$][\\w$]{0,63}',chain=identifier+'(?:\\.'+identifier+'){0,3}';
 if(first.length<=600){
  const dom=/^HierarchyRequestError: Failed to execute '(appendChild|insertBefore|removeChild|replaceChild)' on 'Node': This node type does not support this method\.$/.exec(first);
  if(dom){result.category='dom_node_operation_unsupported';result.domMethod=dom[1] as RuntimeObservation['domMethod'];}
  else if(new RegExp('^TypeError: '+chain+' is not a function$').test(first))result.category='not_callable';
  else if(new RegExp("^TypeError: Cannot read properties of null \\(reading '"+identifier+"'\\)$").test(first))result.category='null_property';
  else if(new RegExp("^TypeError: Cannot read properties of undefined \\(reading '"+identifier+"'\\)$").test(first))result.category='undefined_property';
  else if(new RegExp('^ReferenceError: '+identifier+' is not defined$').test(first))result.category='reference_undefined';
 }
 for(const line of lines.slice(1)){
  if(result.locations.length===3)break;
  const frame=/\(?((?:https:\/\/)[^\s()]+):(\d+):(\d+)\)?$/.exec(line);if(!frame)continue;
  try{
   const url=new URL(frame[1]);if(url.origin!==origin||url.username||url.password||url.search||url.hash)continue;
   const relative=decodeURIComponent(url.pathname.slice(1));if(!snapshotPaths.has(relative))continue;
   const location={path:relative,line:Number(frame[2]),column:Number(frame[3])};
   const parsed=prototypeRuntimeErrorSchema.safeParse({...result,locations:[location]});
   if(parsed.success&&!result.locations.some(item=>JSON.stringify(item)===JSON.stringify(location)))result.locations.push(location);
  }catch{}
 }
 return result;
}

/** Output-only instrumentation. The runner continues to own all timers, guards
 * and outcomes; recording a phase cannot extend or restart its budget. */
export class PrototypeCaseDiagnosticsRecorder {
 readonly value:PrototypeCaseDiagnostics={phaseTimings:[]};
 private active?:PrototypeDiagnosticPhase;
 private last?:PrototypeDiagnosticPhase;
 private activeStepIndex?:number;
 private lastStepIndex?:number;
 constructor(private stepCount:number,private now:()=>number=()=>performance.now()){}
 stop(reason:string,timerExpired=false){
  // Assertion failures may still be followed by a screenshot. A later actual
  // stop must describe that capture, while the first terminal cause wins races.
  if(this.value.stopReason&&['PROTOTYPE_STEP_TIMEOUT','PROTOTYPE_TOTAL_TIMEOUT','PROTOTYPE_CANCELLED','PROTOTYPE_AUTHORIZATION_CHANGED','PROTOTYPE_RENDERER_EXITED'].includes(this.value.stopReason))return;
  // Re-observing the same cause during capture must not relocate the first
  // exception from its actual action to the screenshot phase.
  if(this.value.stopReason===reason)return;
  const safe=prototypeDiagnosticStopReasonSchema.safeParse(reason);
  this.value.stopReason=safe.success?safe.data:'PROTOTYPE_EXECUTION_UNAVAILABLE';
  const phase=this.active??this.last;
  if(phase)this.value.stoppedPhase=phase;
  if(timerExpired&&this.active&&(reason==='PROTOTYPE_STEP_TIMEOUT'||reason==='PROTOTYPE_TOTAL_TIMEOUT'))this.value.timeoutPhase=this.active;
 }
 runtimeError(error:RuntimeObservation){
  const phase=this.active??this.last,stepIndex=this.active?this.activeStepIndex:this.lastStepIndex;
  const observation:PrototypeRuntimeError={...error,...(phase?{phase}:{}),...(phase==='step'&&stepIndex!==undefined?{stepIndex}: {})};
  const parsed=prototypeRuntimeErrorSchema.safeParse(observation);if(!parsed.success)return;
  const errors=this.value.runtimeErrors??=[];
  const samePhase=(item:PrototypeRuntimeError)=>item.phase===phase&&item.stepIndex===observation.stepIndex;
  // Electron's console-message is a safe generic fallback. CDP can later
  // provide the recognized Error object's category/location for that event.
  const fallback=errors.findIndex(item=>samePhase(item)&&item.category==='generic_runtime'&&item.errorType==='other'&&!item.locations.length);
  if(fallback>=0&&(observation.category!=='generic_runtime'||observation.errorType!=='other'||observation.locations.length))errors[fallback]=parsed.data;
  else if(!(observation.category==='generic_runtime'&&observation.errorType==='other'&&!observation.locations.length&&errors.some(samePhase))&&!errors.some(item=>JSON.stringify(item)===JSON.stringify(parsed.data))&&errors.length<3)errors.push(parsed.data);
  this.stop('PROTOTYPE_RUNTIME_EXCEPTION');
 }
 async measure<T>(phase:PrototypeDiagnosticPhase,action:()=>Promise<T>,stepIndex?:number):Promise<T>{
  const started=this.now();this.active=phase;this.activeStepIndex=stepIndex;
  try{return await action();}
  finally{
   const elapsed=this.now()-started;
   // A scheduler stall may exceed the configured task deadline. Keep measured
   // duration rather than clamp it to the budget or record wall-clock dates.
   if(this.value.phaseTimings.length<this.stepCount+3)this.value.phaseTimings.push({phase,elapsedMs:Number.isFinite(elapsed)?Math.max(0,Math.min(Number.MAX_SAFE_INTEGER,elapsed)):0,...(phase==='step'?{stepIndex:stepIndex!}:{})});
   this.last=phase;this.lastStepIndex=stepIndex;this.active=undefined;this.activeStepIndex=undefined;
  }
 }
}
