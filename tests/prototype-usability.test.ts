import test from 'node:test';
import assert from 'node:assert/strict';
import {buildPrototypeUsabilityBaselineCases} from '../main/prototype-usability.js';
import {prototypeAcceptanceCaseSchema,prototypeStepSchema} from '../shared/prototype-acceptance.js';

test('control usability has a fixed assertion surface with no injected options or code',()=>{
 assert.deepEqual(prototypeStepSchema.parse({action:'assert',assertion:'control-usability'}),{action:'assert',assertion:'control-usability'});
 for(const extra of [{maxCandidates:10000},{minPixels:1},{script:'return true'},{expected:true}])assert.throws(()=>prototypeStepSchema.parse({action:'assert',assertion:'control-usability',...extra}));
});
test('host baseline always uses desktop and only adds mobile on explicit applicability',()=>{
 const desktop=buildPrototypeUsabilityBaselineCases({mobile:false}),mobile=buildPrototypeUsabilityBaselineCases({mobile:true});
 assert.equal(desktop.length,1);assert.deepEqual(desktop[0].viewport,{width:1440,height:900});assert.deepEqual(mobile[1].viewport,{width:390,height:844});
 for(const item of mobile)assert.deepEqual(prototypeAcceptanceCaseSchema.parse(item),item);
});
