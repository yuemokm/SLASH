import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {PrototypeCaseDiagnosticsRecorder,sanitizePrototypeRuntimeError} from '../main/prototype-browser-diagnostics.js';
import {prototypeCaseDiagnosticsSchema,prototypeRuntimeErrorSchema} from '../shared/prototype-acceptance.js';

test('actual production browser runner covers all bounded phases, real timer callbacks and cancellation without Electron',()=>{
 const env={...process.env};delete env.NODE_TEST_CONTEXT;
 const child=spawnSync(process.execPath,['--experimental-test-module-mocks','--import','tsx','--test','--test-reporter=tap',fileURLToPath(new URL('./prototype-browser-diagnostics-fixture.mjs',import.meta.url))],{cwd:fileURLToPath(new URL('..',import.meta.url)),env,encoding:'utf8',timeout:45000});
 assert.equal(child.status,0,(child.stdout+child.stderr).slice(-16000));assert.match(child.stdout,/tests 15/);assert.match(child.stdout,/fail 0/);
});
test('runtime sanitizer retains standard category and authorized location without text, functions, URLs or secrets',()=>{
 const origin='https://prototype-fixture.invalid',paths=new Set(['QE12/index.html']);
 const raw="HierarchyRequestError: Failed to execute 'appendChild' on 'Node': This node type does not support this method.\n    at PRIVATE_SECRET ("+origin+"/QE12/index.html:697:281)\n    at secret ("+origin+"/QE12/index.html?token=PRIVATE_TOKEN:1:2)\n    at secret (https://external.invalid/private:1:2)\n    at secret (C:/private/key.js:1:2)\n    at secret ("+origin+"/not-in-snapshot.js:1:2)";
 const safe=sanitizePrototypeRuntimeError(raw,origin,paths);assert.deepEqual(safe,{category:'dom_node_operation_unsupported',errorType:'HierarchyRequestError',domMethod:'appendChild',locations:[{path:'QE12/index.html',line:697,column:281}]});assert.doesNotMatch(JSON.stringify(safe),/PRIVATE|https:|secret|stack|message|description/);
 const unknown=sanitizePrototypeRuntimeError('Error: PRIVATE_PASSWORD '+raw,origin,paths);assert.equal(unknown.category,'generic_runtime');assert.doesNotMatch(JSON.stringify(unknown),/PRIVATE_PASSWORD/);
 for(const [message,category] of [["TypeError: app.save is not a function",'not_callable'],["TypeError: Cannot read properties of null (reading 'appendChild')",'null_property'],["TypeError: Cannot read properties of undefined (reading 'value')",'undefined_property'],['ReferenceError: unknownName is not defined','reference_undefined']])assert.equal(sanitizePrototypeRuntimeError(message,origin,paths).category,category);
 assert.deepEqual(sanitizePrototypeRuntimeError({private:'SECRET'},origin,paths),{category:'generic_runtime',errorType:'other',locations:[]});
 for(const suffix of ['/QE12/index.html:0:1','/QE12/index.html:1:10000001','/QE12/index.html#token=secret:1:2','/QE12/index.html?token=secret:1:2','/not-in-snapshot.js:1:2'])assert.equal(sanitizePrototypeRuntimeError('TypeError: app.save is not a function\n at f ('+origin+suffix+')',origin,paths).locations.length,0);
 const many=sanitizePrototypeRuntimeError('Error: secret\n'+Array.from({length:30},(_,n)=>' at f ('+origin+'/QE12/index.html:'+(n+1)+':2)').join('\n'),origin,paths);assert.equal(many.locations.length,3);
});
test('runtime error schema is bounded and rejects raw payload, unchecked path, URL and phase mismatches',()=>{
 const valid={category:'dom_node_operation_unsupported',errorType:'HierarchyRequestError',domMethod:'appendChild',phase:'step',stepIndex:0,locations:[{path:'QE12/index.html',line:697,column:281}]};assert.deepEqual(prototypeRuntimeErrorSchema.parse(valid),valid);
 for(const bad of [{...valid,message:'secret'},{...valid,stack:'secret'},{...valid,args:['secret']},{...valid,errorType:'PrivateError'},{...valid,domMethod:'eval'},{...valid,stepIndex:20},{...valid,phase:'screenshot'},{...valid,locations:[{path:'https://private.invalid?token=x',line:1,column:1}]},{...valid,locations:[{path:'../secret',line:1,column:1}]},{...valid,locations:Array(4).fill(valid.locations[0])}])assert.equal(prototypeRuntimeErrorSchema.safeParse(bad).success,false);
 assert.equal(prototypeCaseDiagnosticsSchema.safeParse({phaseTimings:[],runtimeErrors:Array(4).fill(valid)}).success,false);
});
test('first runtime phase/step survives screenshot observation while later true cancellation retains its own cause',async()=>{
 const recorder=new PrototypeCaseDiagnosticsRecorder(2),generic={category:'generic_runtime' as const,errorType:'other' as const,locations:[]};
 await recorder.measure('step',async()=>{recorder.runtimeError(generic);recorder.runtimeError({category:'dom_node_operation_unsupported',errorType:'HierarchyRequestError',domMethod:'appendChild',locations:[{path:'index.html',line:3,column:7}]});recorder.runtimeError(generic);},1);
 await recorder.measure('screenshot',async()=>recorder.stop('PROTOTYPE_RUNTIME_EXCEPTION'));
 assert.equal(recorder.value.stoppedPhase,'step');assert.equal(recorder.value.runtimeErrors?.length,1);assert.equal(recorder.value.runtimeErrors?.[0].stepIndex,1);
 await recorder.measure('screenshot',async()=>recorder.stop('PROTOTYPE_CANCELLED'));assert.equal(recorder.value.stopReason,'PROTOTYPE_CANCELLED');assert.equal(recorder.value.stoppedPhase,'screenshot');assert.equal(recorder.value.runtimeErrors?.[0].phase,'step');
});
test('screenshot actual timeout supersedes prior assertion failure while preserving timing',async()=>{
 const recorder=new PrototypeCaseDiagnosticsRecorder(1);await recorder.measure('step',async()=>{},0);recorder.stop('PROTOTYPE_ASSERTION_MISMATCH');
 await recorder.measure('screenshot',async()=>{recorder.stop('PROTOTYPE_STEP_TIMEOUT',true);});assert.equal(recorder.value.stopReason,'PROTOTYPE_STEP_TIMEOUT');assert.equal(recorder.value.stoppedPhase,'screenshot');assert.equal(recorder.value.timeoutPhase,'screenshot');assert.equal(recorder.value.phaseTimings[0].phase,'step');
});
test('diagnostics contain bounded enum/numeric fields and reject payload or invalid indices',()=>{
 const valid={phaseTimings:[{phase:'step',elapsedMs:0.5,stepIndex:0}],stoppedPhase:'step',timeoutPhase:'step',stopReason:'PROTOTYPE_STEP_TIMEOUT'};assert.deepEqual(prototypeCaseDiagnosticsSchema.parse(valid),valid);
 for(const value of [{...valid,body:'private'},{...valid,stopReason:'user secret'},{...valid,stopReason:'PROTOTYPE_CANCELLED'},{phaseTimings:[{phase:'step',elapsedMs:-1,stepIndex:0}]},{phaseTimings:[{phase:'step',elapsedMs:Infinity,stepIndex:0}]},{phaseTimings:[{phase:'step',elapsedMs:1}]},{phaseTimings:[{phase:'viewport',elapsedMs:1,stepIndex:0}]},{phaseTimings:Array.from({length:24},()=>({phase:'initialization',elapsedMs:1}))}])assert.throws(()=>prototypeCaseDiagnosticsSchema.parse(value));
});
test('monotonic timing finally survives failure, caps count, and preserves the first terminal cause',async()=>{
 let now=20;const recorder=new PrototypeCaseDiagnosticsRecorder(1,()=>now);
 await assert.rejects(recorder.measure('initialization',async()=>{now=24;recorder.stop('PROTOTYPE_CANCELLED');throw Error('cancel');}));
 recorder.stop('PROTOTYPE_TOTAL_TIMEOUT',true);assert.deepEqual(recorder.value,{phaseTimings:[{phase:'initialization',elapsedMs:4}],stoppedPhase:'initialization',stopReason:'PROTOTYPE_CANCELLED'});
 for(let n=0;n<8;n++)await recorder.measure('viewport',async()=>{});assert.equal(recorder.value.phaseTimings.length,4);
});
