import test from 'node:test';
import assert from 'node:assert/strict';
import {validateToolArguments} from '@earendil-works/pi-ai/utils/validation';
import {toolInputSchema} from '../main/tool-input-schema.js';
import {prototypeAcceptanceDefinitionSchema,prototypeAcceptanceGetSchema,prototypeTargetSchema} from '../shared/prototype-acceptance.js';
import {taskAcceptanceProposalSchema} from '../shared/task-acceptance.js';

const draft={changeId:'actual-change',parentRunId:'owner',expectedContentHash:'a'.repeat(64)};
const target={mountId:'out',path:'index.html',draft};
function validate(schema:Parameters<typeof toolInputSchema>[0],args:unknown){return validateToolArguments({name:'fixture',description:'strict input',parameters:toolInputSchema(schema)},{type:'toolCall',id:'tool-id',name:'fixture',arguments:args as Record<string,unknown>});}
test('Pi输入校验允许省略嵌套默认，宿主Zod仍填充默认和保留严格限制',()=>{
 const input={...target,title:'候选',cases:[{id:'text',title:'正文',steps:[{action:'assert',assertion:'text',selector:'body',expected:'正文'},{action:'assert',assertion:'min-target-size',selector:'#submit'}]}]};
 const valid=validate(prototypeAcceptanceDefinitionSchema,input),parsed=prototypeAcceptanceDefinitionSchema.parse(valid);
 assert.deepEqual(parsed.sourceRefs,[]);assert.deepEqual(parsed.draft!.dependencies,[]);assert.equal('match' in parsed.cases[0].steps[0]&&parsed.cases[0].steps[0].match,'equals');assert.equal('minPixels' in parsed.cases[0].steps[1]&&parsed.cases[0].steps[1].minPixels,44);
 assert.equal(prototypeAcceptanceGetSchema.parse(validate(prototypeAcceptanceGetSchema,target)).limit,10);
 assert.equal(prototypeTargetSchema.parse(validate(prototypeTargetSchema,target)).draft!.dependencies.length,0);
 assert.throws(()=>validate(prototypeAcceptanceGetSchema,{...target,limit:0}),/Validation/);assert.throws(()=>validate(prototypeTargetSchema,{...target,draft:{...draft,expectedContentHash:'PLACEHOLDER'}}),/Validation/);
 assert.throws(()=>validate(prototypeTargetSchema,{...target,specId:'wrong'}),/Validation/);assert.throws(()=>prototypeTargetSchema.parse({...target,specId:'wrong'}),/unrecognized_keys/);
});
test('任务候选输入默认不会变成Pi必填，仍拒绝模型结果字段',()=>{
 const input={criteria:[{id:'structure',text:'标题存在',requestIds:['request'],outputIds:['output'],checker:{kind:'static_quality',requiredSections:[{id:'title',aliases:['标题']}]}}]};
 const valid=validate(taskAcceptanceProposalSchema,input),parsed=taskAcceptanceProposalSchema.parse(valid);
 assert.equal(parsed.criteria![0].origin,'model_proposal');assert.equal(parsed.criteria![0].required,true);
 assert.throws(()=>validate(taskAcceptanceProposalSchema,{...input,status:'passed'}),/Validation/);
});
