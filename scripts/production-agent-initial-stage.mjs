// First-stage host adapters. They never send a model request or infer a satisfied business check.
import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {productionInitialBindingsSchema,productionInitialRoleBindingsSchema} from '../shared/production-agent-initial-stage.ts';
import {BUSINESS_BENCHMARK_CASES} from '../shared/quality-evaluation.ts';
import {requireProductionInitialStage,assertProductionInitialPrototypeEvidence} from '../main/production-agent-initial-stage.ts';
import {recordBenchmarkReview,evaluationHash,requireEvaluationPath} from '../main/quality-evaluation.ts';
import {captureProductionRunnableObservation,recordProductionRunnableReview} from './production-agent-runnable.mjs';
import {inspectQualityPrototype,hashBytes} from './quality-prototype-inspect.mjs';
export {productionInitialBindingsSchema};
const json=async(root,file)=>JSON.parse(await fs.readFile(await requireEvaluationPath(root,path.resolve(root,file)),'utf8'));
const errorReason=error=>/^[A-Z][A-Z0-9_]+$/.test(error?.message??'')?error.message:'INITIAL_STAGE_EVIDENCE_UNKNOWN';
const evidence=async file=>({path:file,sha256:await evaluationHash(file)});
const save=async(file,body)=>{await fs.writeFile(file,JSON.stringify(body,null,2)+'\n',{flag:'wx'});return evidence(file);};

/** A v2 case grants one flat output directory, not invented required filenames. */
export function initialOutputInScope(caseId,relative){const key=String(relative).replaceAll('\\','/');return key.startsWith(caseId+'/')&&key.slice(caseId.length+1).length>0&&!key.slice(caseId.length+1).includes('/')&&!/[\0\r\n]/.test(key)&&!key.includes(':')&&/\.(?:md|markdown|html?|txt)$/i.test(key);}
export async function readInitialCaseSnapshots({outputMount,caseId,call}){
 if(!/^QE(?:0[1-9]|1[0-6])$/.test(caseId))throw Error('EVALUATION_CASE_UNKNOWN');const folder=path.join(outputMount.path,caseId);let entries;try{await requireEvaluationPath(outputMount.path,folder);entries=await fs.readdir(folder,{withFileTypes:true});}catch(error){if(error.code==='ENOENT')return[];throw error;}
 if(entries.length>100)throw Error('EVALUATION_OUTPUT_FILE_LIMIT');const results=[];
 for(const item of entries.sort((a,b)=>a.name.localeCompare(b.name))){const relative=caseId+'/'+item.name;if(!item.isFile()||item.isSymbolicLink()||!initialOutputInScope(caseId,relative))throw Error('EVALUATION_OUTPUT_OUTSIDE_FLAT_TEXT_SCOPE');const file=await requireEvaluationPath(outputMount.path,path.join(folder,item.name)),content=await call({type:'read',mountId:outputMount.id,path:relative}),hash=hashBytes(Buffer.from(content));if(hash!==await evaluationHash(file))throw Error('EVALUATION_OUTPUT_CHANGED_DURING_READ');results.push({path:file,relative,sha256:hash,versions:await call({type:'versions',mountId:outputMount.id,path:relative})});}
 return results;
}

export async function observeProductionInitialBrowser(input){
 const {caseDir,call,page,observation,onState=async()=>{}}=input,htmlCandidates=observation.outputs.filter(output=>/\.html?$/i.test(output.path));
 if(htmlCandidates.length>1)throw Error('INITIAL_BROWSER_TARGET_AMBIGUOUS');const html=htmlCandidates[0];
 if(!html)return{status:'unknown',reason:'INITIAL_HTML_TARGET_UNRECORDED'};
 const target={mountId:html.mountId,path:html.path};if(hashBytes(Buffer.from(await call({type:'read',...target})))!==html.snapshot.sha256)throw Error('INITIAL_BROWSER_VERSION_CHANGED');
 const folder=await fs.mkdtemp(path.join(caseDir,'production-initial-browser-')),bindingsPath=path.join(caseDir,'initial-prototype-bindings.json');
 const before=await inspectQualityPrototype({page,call,target,artifactHash:html.snapshot.sha256,screenshotPath:path.join(folder,'before.png')});
 const beforeEvidence=await save(path.join(folder,'before.json'),before),waitMs=Math.max(0,Math.min(input.bindingsWaitMs??75000,180000)),deadline=Date.now()+waitMs;let bindings;
 await onState({status:'awaiting_initial_bindings',artifactHash:html.snapshot.sha256,bindingsPath,inspection:beforeEvidence.path,notice:'Only initial name boundaries and basic submit native actions; no automatic business approval.'});
 do{try{const value=await json(caseDir,bindingsPath),parsed=productionInitialBindingsSchema.safeParse(value);if(parsed.success&&parsed.data.artifactHash===html.snapshot.sha256){bindings=parsed.data;break;}}catch(error){if(error.code!=='ENOENT'&&!(error instanceof SyntaxError))throw error;}if(Date.now()>=deadline)break;await new Promise(resolve=>setTimeout(resolve,Math.min(250,deadline-Date.now())));}while(Date.now()<deadline);
 if(!bindings)return{status:'unknown',reason:'INITIAL_BROWSER_BINDINGS_UNAVAILABLE',beforeEvidence};
 const bindingEvidence=await save(path.join(folder,'bindings.json'),bindings),probes=[];
 for(const key of ['name50','name51','submit']){
  const observed=await inspectQualityPrototype({page,call,target,artifactHash:html.snapshot.sha256,entrySteps:[...bindings.entrySteps,...bindings.actions[key]],selectors:Object.values(bindings.selectors),screenshotPath:path.join(folder,key+'.png')});
  probes.push({id:key,evidence:await save(path.join(folder,key+'.json'),observed),screenshot:observed.screenshot});
 }
 if(hashBytes(Buffer.from(await call({type:'read',...target})))!==html.snapshot.sha256)throw Error('INITIAL_BROWSER_VERSION_CHANGED');
 return{status:'observed',evidence:await save(path.join(folder,'browser.json'),{schemaVersion:1,caseId:input.caseId,runId:observation.runId,artifactHash:html.snapshot.sha256,observationEvidence:input.observationEvidence,observedAt:new Date().toISOString(),bindingEvidence,beforeEvidence,probes,notice:'Actual native actions, DOM and screenshots only. No satisfied/violated business verdict was produced.'})};
}

/** The existing runner calls this after persisting its first step and before any later prompt. */
export async function captureInitialStageFromRunner(input){
 const original=BUSINESS_BENCHMARK_CASES.find(value=>value.id===input.caseId);if(!original||input.receipt.steps?.length!==1)throw Error('INITIAL_CAPTURE_ONLY_AFTER_FIRST_STEP');
 if(input.receipt.initialStage?.observationEvidence)throw Error('INITIAL_STAGE_ALREADY_SEALED');
 await input.save();
 try{
  const manifest=await json(input.testDir,path.join(input.testDir,'manifest.json')),baseline=requireProductionInitialStage(manifest,original);
  const observationEvidence=await captureProductionRunnableObservation(input),observation=await json(input.testDir,observationEvidence.path);
  input.receipt.initialStage={status:'sealed_pending_independent_review',runId:observation.runId,observationEvidence};await input.save();
  if(input.page&&baseline.checks.some(check=>check.evidenceKind==='browser')){input.receipt.initialStage.browser=await observeProductionInitialBrowser({...input,observation,observationEvidence});await input.save();}
 }catch(error){input.receipt.initialStage={...(input.receipt.initialStage??{}),status:'unknown',reason:errorReason(error)};await input.save();}
 return input.receipt.initialStage;
}

/** Separate initial-stage review: a green final result cannot be used as this evidence. */
export async function recordProductionInitialReview(input){
 const root=await requireEvaluationPath(path.join(input.repo,'.test-data'),path.resolve(input.testDir)),caseDir=await requireEvaluationPath(root,path.join(root,'cases',input.caseId)),manifest=await json(root,path.join(root,'manifest.json')),testCase=BUSINESS_BENCHMARK_CASES.find(value=>value.id===input.caseId);const baseline=requireProductionInitialStage(manifest,testCase);
 const receipt=await json(root,path.join(caseDir,'execution.json')),sealed=receipt.initialStage?.observationEvidence;if(!sealed||await evaluationHash(await requireEvaluationPath(root,sealed.path))!==sealed.sha256)throw Error('INITIAL_STAGE_SEAL_REQUIRED');
 const observation=await json(root,sealed.path),reviewInput=await json(root,input.observationsPath),observations=Array.isArray(reviewInput)?reviewInput:reviewInput.observations,artifacts=observation.outputs.map(output=>output.snapshot);
 let artifactRoles;if(baseline.requiredArtifactRoles.length){artifactRoles=productionInitialRoleBindingsSchema.parse(reviewInput.artifactRoles);for(const role of artifactRoles){const output=observation.outputs.find(value=>value.snapshot.sha256===role.artifactSha256);if(!output||!(await fs.readFile(output.snapshot.path,'utf8')).includes(role.quote))throw Error('INITIAL_ARTIFACT_ROLE_UNBOUND');}}
 const result=await recordBenchmarkReview(root,input.caseId,observations,artifacts,'initial');
 // Preserve every initial review attempt, including failures. Never read or overwrite final result.json.
 const folder=await fs.mkdtemp(path.join(caseDir,'production-initial-review-')),reviewEvidence=await save(path.join(folder,'result.json'),result);
 if(result.verdict!=='satisfied')return{result,reviewEvidence};
 if(result.checks.some(check=>check.evidenceKind==='browser')){
  const browser=receipt.initialStage.browser;if(browser?.status!=='observed'||await evaluationHash(await requireEvaluationPath(root,browser.evidence.path))!==browser.evidence.sha256)throw Error('INITIAL_BROWSER_OBSERVATION_REQUIRED');
  const body=await json(root,browser.evidence.path);if(body.runId!==observation.runId||artifactRoles?.find(role=>role.role==='prototype')?.artifactSha256!==body.artifactHash||body.observationEvidence.sha256!==sealed.sha256||!observation.outputs.some(output=>output.snapshot.sha256===body.artifactHash)||result.checks.some(check=>check.evidenceKind==='browser'&&check.observation?.artifactSha256!==body.artifactHash)||JSON.stringify(body.probes?.map(probe=>probe.id))!==JSON.stringify(['name50','name51','submit']))throw Error('INITIAL_BROWSER_OBSERVATION_UNBOUND');
  for(const item of [body.bindingEvidence,body.beforeEvidence,...body.probes.flatMap(probe=>[probe.evidence,probe.screenshot])])if(await evaluationHash(await requireEvaluationPath(root,item.path))!==item.sha256)throw Error('INITIAL_BROWSER_OBSERVATION_CHANGED');
 }
 if(baseline.executionProfile==='prototype-checks'){const html=observation.outputs.find(output=>output.snapshot.sha256===artifactRoles?.find(role=>role.role==='prototype')?.artifactSha256);await assertProductionInitialPrototypeEvidence({root,caseId:input.caseId,runId:observation.runId,reference:receipt.initialStage.prototypeEvidence,html,observedAt:observation.observedAt,checkedAt:new Date().toISOString()});}
 const proof=await recordProductionRunnableReview({...input,observationEvidence:sealed,reviewEvidence,browserEvidence:receipt.initialStage.browser?.evidence,artifactRoles,prototypeEvidence:receipt.initialStage.prototypeEvidence});return{result,reviewEvidence,proof};
}

