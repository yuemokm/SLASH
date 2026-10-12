import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {qualityPrototypeBindingsSchema,qualityPrototypeCases,qualitySuccessfulCodeStatus} from '../shared/quality-prototype-benchmark.js';
import {evaluationHash,requireEvaluationPath} from './quality-evaluation.js';
import {BUSINESS_BENCHMARK_BASE_PROMPT,type BenchmarkCase} from '../shared/quality-evaluation.js';
import {PRODUCTION_PROTOTYPE_PROMPT_SUFFIX,initialStageChecks,initialStageArtifactRoles,productionInitialStageSchema,productionInitialCheckSchema,type ProductionInitialExecutionProfile} from '../shared/production-agent-initial-stage.js';
const sha=(value:string)=>createHash('sha256').update(value).digest('hex');
export function freezeProductionInitialStage(testCase:BenchmarkCase,executionProfile:ProductionInitialExecutionProfile='base'){
 const checks=initialStageChecks(testCase,executionProfile).map(check=>productionInitialCheckSchema.parse(check));
 if(testCase.prompts.length>1&&testCase.prompts[0]!==BUSINESS_BENCHMARK_BASE_PROMPT)throw Error('INITIAL_PROMPT_NOT_STATIC_BASELINE');
 return productionInitialStageSchema.parse({schemaVersion:1,stage:'initial',executionProfile,profilePromptSha256:sha(executionProfile==='prototype-checks'?PRODUCTION_PROTOTYPE_PROMPT_SUFFIX:''),promptSha256:sha(testCase.prompts[0]),checksSha256:sha(JSON.stringify(checks)),checks,requiredArtifactRoles:[...initialStageArtifactRoles(testCase)]});
}
export function requireProductionInitialStage(manifest:any,testCase:BenchmarkCase){
 if(manifest.schemaVersion!==2)throw Error('INITIAL_STAGE_BASELINE_UNRECORDED');
 const prepared=manifest.cases?.find((value:any)=>value.id===testCase.id),stage=productionInitialStageSchema.parse(prepared?.initialStage),expected=freezeProductionInitialStage(testCase,stage.executionProfile);
 if(prepared.initialExecutionProfile!==stage.executionProfile||JSON.stringify(stage)!==JSON.stringify(expected)||prepared.prompts?.[0]!==testCase.prompts[0])throw Error('INITIAL_STAGE_BASELINE_CHANGED');
 return stage;
}
export function initialBenchmarkCase(manifest:any,testCase:BenchmarkCase):BenchmarkCase{
 const stage=requireProductionInitialStage(manifest,testCase);return{...testCase,prompts:[testCase.prompts[0]],checks:stage.checks};
}

const canonical=(value:any):any=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>[key,canonical(item)])):value;
export async function assertProductionInitialCaseDefinitions(bindings:any,definitions:any){
 // Reuse the existing full native-case builder; do not maintain a second assertion recipe.
 const parsed=qualityPrototypeBindingsSchema.parse(bindings),expected=qualityPrototypeCases(parsed);
 if(JSON.stringify(canonical(definitions))!==JSON.stringify(canonical(expected)))throw Error('INITIAL_FULL_PROTOTYPE_DEFINITION_WEAKENED');return parsed;
}

/** Validate existing full host browser evidence. A passed report never creates business observations. */
export async function assertProductionInitialPrototypeEvidence(input:{root:string;caseId:string;runId:string;reference:any;html:any;observedAt:string;checkedAt:string}){
 const {root,caseId,runId,reference,html,observedAt,checkedAt}=input;
 if(reference?.runId!==runId||!reference.reportEvidence||!reference.bindingEvidence)throw Error('INITIAL_FULL_PROTOTYPE_REQUIRED');
 const verify=async(item:any)=>{const file=await requireEvaluationPath(root,path.resolve(root,item?.path??''));if(await evaluationHash(file)!==item.sha256)throw Error('INITIAL_FULL_PROTOTYPE_CHANGED');return file;};
 const body=JSON.parse(await fs.readFile(await verify(reference.reportEvidence),'utf8')),report=body.report,actual=report?.evidence;
 if(!html||body.caseId!==caseId||body.round!==1||body.artifactHash!==html.snapshot.sha256||body.target?.mountId!==html.mountId||path.normalize(body.target?.path??'')!==path.normalize(html.path)||report?.versionState!=='current'||actual?.entryHash!==html.snapshot.sha256||actual.mountId!==html.mountId||path.normalize(actual.path??'')!==path.normalize(html.path)||body.specHash!==actual.specHash||body.status!=='passed'||actual.status!=='passed')throw Error('INITIAL_FULL_PROTOTYPE_UNBOUND');
 const times=[observedAt,checkedAt,actual.startedAt,actual.finishedAt,report.createdAt].map(Date.parse);if(!times.every(Number.isFinite)||times[2]<times[0]||times[3]<times[2]||times[4]<times[3]||times[4]>times[1])throw Error('INITIAL_FULL_PROTOTYPE_TIME_UNBOUND');
 const bindings=await assertProductionInitialCaseDefinitions(JSON.parse(await fs.readFile(await verify(reference.bindingEvidence),'utf8')),actual.caseDefinitions);if(bindings.artifactHash!==html.snapshot.sha256||sha(JSON.stringify(bindings))!==body.bindingsHash)throw Error('INITIAL_FULL_PROTOTYPE_BINDING_UNBOUND');
 const success=JSON.parse(await fs.readFile(await verify(body.successCodeEvidence),'utf8')),native=actual.caseDefinitions.find((item:any)=>item.id==='benchmark:submit-success')?.steps.filter((step:any)=>step.action!=='assert');await verify(success.screenshot);if(success.feedback?.observed!==true||success.feedback?.selector!==bindings.feedback.success.selector||success.feedback?.text!==bindings.feedback.success.text||success.feedback?.timeoutMs!==3000||!Number.isFinite(Date.parse(success.feedback?.startedAt))||!Number.isFinite(Date.parse(success.feedback?.finishedAt))||Date.parse(success.feedback.finishedAt)<Date.parse(success.feedback.startedAt)||Date.parse(success.feedback.finishedAt)>Date.parse(success.inspectedAt)||success.artifactHash!==html.snapshot.sha256||success.target?.mountId!==html.mountId||path.normalize(success.target?.path??'')!==path.normalize(html.path)||JSON.stringify(canonical(success.entrySteps))!==JSON.stringify(canonical(native))||!Number.isFinite(Date.parse(success.inspectedAt))||Date.parse(success.inspectedAt)<times[3]||Date.parse(success.inspectedAt)>times[1]||qualitySuccessfulCodeStatus(bindings.code.mode,success.selectorObservations?.find((item:any)=>item.selector===bindings.code.selector))!=='passed')throw Error('INITIAL_SUCCESS_CODE_UNVERIFIED');
 const caseRoot=path.basename(root)===caseId?root:path.join(root,'cases',caseId),dbFile=await requireEvaluationPath(root,path.join(caseRoot,'profile','slash.sqlite')),db=new DatabaseSync(dbFile,{readOnly:true});try{const row=db.prepare("SELECT p.value FROM kv,json_each(kv.value) p WHERE kv.key LIKE 'quality-reports:v1:%' AND json_extract(p.value,'$.id')=?").get(report.reportId) as any,stored=row?JSON.parse(row.value):undefined;if(!stored||stored.createdAt!==report.createdAt||stored.mountId!==html.mountId||path.normalize(stored.path)!==path.normalize(html.path)||JSON.stringify(canonical(stored.report?.details?.prototypeAcceptance))!==JSON.stringify(canonical(actual)))throw Error('INITIAL_FULL_PROTOTYPE_HOST_REPORT_UNBOUND');}finally{db.close();}
 const expected=['benchmark:code-readonly','benchmark:name-50-51','benchmark:submit-success','benchmark:submit-duplicate','benchmark:submit-failure','benchmark:viewport-390','benchmark:viewport-1280','benchmark:viewport-1440'];
 for(const id of expected){const defined=actual.caseDefinitions?.find((item:any)=>item.id===id),result=actual.cases?.find((item:any)=>item.caseId===id),screens=body.screenshots?.filter((item:any)=>item.caseId===id);if(!defined||!result||result.status!=='passed'||result.steps?.length!==defined.steps.length||result.steps.some((step:any,index:number)=>step.stepIndex!==index||step.status!=='passed')||!screens?.length)throw Error('INITIAL_FULL_PROTOTYPE_COVERAGE_UNKNOWN');for(const image of screens){await verify(image);if(!actual.screenshots?.some((item:any)=>item.id===image.id&&item.caseId===id&&item.contentHash===image.sha256))throw Error('INITIAL_FULL_PROTOTYPE_SCREENSHOT_UNBOUND');}if(id.startsWith('benchmark:viewport-')){const width=Number(id.split('-').at(-1)),height=width===390?844:width===1280?800:900;if(defined.viewport?.width!==width||defined.viewport?.height!==height||result.viewport?.width!==width||result.viewport?.height!==height)throw Error('INITIAL_FULL_PROTOTYPE_VIEWPORT_UNBOUND');}}
 return reference;
}

