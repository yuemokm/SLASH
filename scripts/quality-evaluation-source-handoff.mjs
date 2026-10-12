import fs from 'node:fs/promises';import path from 'node:path';
import {prepareRegisteredEvaluationSources}from'./quality-evaluation-source-preparation.mjs';
import {productionSourcePreparationBindingSchema,productionSourcePreparationPlanSchema}from'../shared/production-agent-source-preparation.ts';
import {verifyProductionSourcePreparation}from'../main/production-agent-source-preparation.ts';
import {evaluationHash,requireEvaluationPath}from'../main/quality-evaluation.ts';
/** The runner calls this after mounting originals/texts, before start or send. */
export async function prepareProductionSourceHandoff(input){
 const {repo,manifest,caseDir,caseId,call}=input,plan=productionSourcePreparationPlanSchema.parse(manifest.sourcePreparation);if(await evaluationHash(path.join(repo,'scripts','quality-evaluation-source-preparation.mjs'))!==plan.helperSha256)throw Error('SOURCE_PREPARATION_HELPER_CHANGED');
 const prepared=await prepareRegisteredEvaluationSources({...input,sources:manifest.sources}),raw=JSON.parse(await fs.readFile(prepared.receipt.path,'utf8')),root=path.dirname(path.dirname(caseDir));
 const binding=productionSourcePreparationBindingSchema.parse({schemaVersion:1,caseId,outputMountId:input.outputMountId,manifestSha256:await evaluationHash(path.join(root,'manifest.json')),plan,preparationEvidence:prepared.receipt,frozenAt:new Date().toISOString(),sources:prepared.sources,preparationChanges:raw.records.map(record=>record.preparationChange)}),file=path.join(caseDir,'source-preparation-binding.json');await fs.writeFile(file,JSON.stringify(binding,null,2),{flag:'wx'});const reference={path:file,sha256:await evaluationHash(file)};
 await verifyProductionSourcePreparation({caseDir,manifest,reference,state:await call({type:'state'}),beforeRun:true});return{sources:binding.sources,bindingEvidence:reference};
}
export async function assertPreparationSeparatedFromTask(input){
 const binding=await verifyProductionSourcePreparation(input),state=input.state,run=state.runs.find(value=>value.id===input.runId);if(!run||run.id==='user-processing')throw Error('SOURCE_PREPARATION_TASK_OWNER_INVALID');const preparedIds=new Set(binding.preparationChanges.map(value=>value.id));
 if((input.appliedChangeIds??[]).some(id=>preparedIds.has(id))||(input.savedOutputs??[]).some(saved=>binding.preparationChanges.some(value=>{const mount=state.mounts.find(item=>item.id===value.mountId);return mount&&path.resolve(saved.path)===path.resolve(mount.path,value.path);})))throw Error('SOURCE_PREPARATION_COUNTED_AS_TASK_ARTIFACT');
 if((run.sourceReads??[]).some(value=>!value.contentHash||!value.path||!value.readAt))throw Error('SOURCE_PREPARATION_MODEL_READ_UNVERIFIED');return binding;
}
