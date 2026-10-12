// Host-only adapter: no model request, business auto-pass, Electron launch or configuration write.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {requestSchema} from '../shared/types.ts';
import {BUSINESS_BENCHMARK_CASES,evaluateBenchmark} from '../shared/quality-evaluation.ts';
import {productionSnapshotObservationSchema,productionVersionEvidenceSchema,productionRunnableReviewSchema} from '../shared/production-agent-evaluation.ts';
import {evaluationHash,requireEvaluationPath,insideEvaluationRoot} from '../main/quality-evaluation.ts';
import {requireProductionInitialStage,initialBenchmarkCase} from '../main/production-agent-initial-stage.ts';
import {productionInitialRoleBindingsSchema} from '../shared/production-agent-initial-stage.ts';

const defaultRepo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const sha=value=>createHash('sha256').update(value).digest('hex');
const json=async(root,file)=>JSON.parse(await fs.readFile(await requireEvaluationPath(root,path.resolve(root,file)),'utf8'));
const verify=async(root,evidence)=>{const file=await requireEvaluationPath(root,path.resolve(root,evidence.path));if(await evaluationHash(file)!==evidence.sha256)throw Error('RUNNABLE_EVIDENCE_CHANGED');return file;};
const save=async(file,body)=>{await fs.writeFile(file,JSON.stringify(body,null,2)+'\n',{flag:'wx'});return{path:file,sha256:await evaluationHash(file)};};
async function context(input){const root=await requireEvaluationPath(path.join(input.repo??defaultRepo,'.test-data'),path.resolve(input.testDir)),original=BUSINESS_BENCHMARK_CASES.find(value=>value.id===input.caseId);if(!original)throw Error('PRODUCTION_CASE_UNKNOWN');const manifest=await json(root,path.join(root,'manifest.json')),baseline=requireProductionInitialStage(manifest,original),testCase=initialBenchmarkCase(manifest,original),caseDir=await requireEvaluationPath(root,path.join(root,'cases',testCase.id)),start=await json(root,path.join(caseDir,'production-start.json')),receipt=await json(root,path.join(caseDir,'execution.json'));if(start.manifestSha256!==await evaluationHash(path.join(root,'manifest.json'))||receipt.sourceManifestSha256!==start.manifestSha256)throw Error('INITIAL_STAGE_MANIFEST_CHANGED');return{root,caseDir,testCase,baseline};}

/** Call while the runner already owns its official instance, after saving the first complete step.
 * observedAt is the actual end of this official read/versions seal, never caller-supplied.
 * It may be collected later, but later collection cannot retroactively prove an earlier version time.
 */
export async function captureProductionRunnableObservation(input){
 const {root,caseDir,testCase,baseline}=await context(input),receipt=await json(root,path.join(caseDir,'execution.json')),step=receipt.steps?.[0];
 if(receipt.caseId!==testCase.id||step?.index!==1||step.status!=='succeeded'||!step.after?.length)throw Error('RUNNABLE_FIRST_STEP_UNAVAILABLE');
 const call=request=>input.call(requestSchema.parse(request)),state=await call({type:'state'}),run=state.runs?.find(value=>value.id===step.runId);
 if(run?.status!=='succeeded'||!run.finishedAt||Date.parse(run.finishedAt)>Date.now())throw Error('RUNNABLE_HOST_RUN_UNAVAILABLE');
 const folder=await fs.mkdtemp(path.join(caseDir,'production-runnable-seal-')),outputs=[];
 for(const [index,saved]of step.after.entries()){
  const mount=state.mounts?.find(value=>value.enabled&&insideEvaluationRoot(value.path,saved.path));if(!mount)throw Error('RUNNABLE_OUTPUT_MOUNT_MISSING');
  const relative=path.relative(mount.path,saved.path),content=await call({type:'read',mountId:mount.id,path:relative}),versions=await call({type:'versions',mountId:mount.id,path:relative});
  const versionBody=productionVersionEvidenceSchema.parse({mountId:mount.id,path:relative,contentHash:sha(content),versions});
  if(sha(content)!==saved.sha256||!versions.some(value=>value.id==='current'&&value.source==='current'&&value.runId===null&&value.contentHash===saved.sha256&&value.size===Buffer.byteLength(content)&&!value.restorable)||!receipt.artifacts?.some(value=>value.step===1&&value.origin==='saved_artifact'&&value.sha256===saved.sha256&&path.basename(value.path)==='1-'+path.basename(saved.path)))throw Error('RUNNABLE_OFFICIAL_VERSION_CHANGED');
  const snapshotPath=path.join(folder,index+1+'-'+path.basename(saved.path));await fs.writeFile(snapshotPath,content,{flag:'wx'});const snapshot={path:snapshotPath,sha256:await evaluationHash(snapshotPath)},versionsEvidence=await save(path.join(folder,index+1+'-versions.json'),versionBody);
  outputs.push({mountId:mount.id,path:relative,snapshot,versionsEvidence});
 }
 // Recheck the entire set after sealing: no mixed set if a file changed during collection.
 for(const output of outputs){const content=await call({type:'read',mountId:output.mountId,path:output.path});if(sha(content)!==output.snapshot.sha256)throw Error('RUNNABLE_OUTPUT_CHANGED_DURING_SEAL');}
 const latest=await call({type:'state'});if(latest.runs?.find(value=>value.id===run.id)?.status!=='succeeded')throw Error('RUNNABLE_HOST_RUN_CHANGED');
 return save(path.join(folder,'observation.json'),productionSnapshotObservationSchema.parse({schemaVersion:1,caseId:testCase.id,runId:run.id,source:'official_read',versionState:'current',observedAt:new Date().toISOString(),outputs}));
}

/** Call after independent business/browser/runtime checks are saved by existing review tooling.
 * It validates existing observations; it never creates a satisfied observation.
 */
export async function recordProductionRunnableReview(input){
 const {root,caseDir,testCase,baseline}=await context(input),observationFile=await verify(root,input.observationEvidence),observation=productionSnapshotObservationSchema.parse(await json(root,observationFile)),resultFile=await verify(root,input.reviewEvidence),result=await json(root,resultFile);
 if(observation.caseId!==testCase.id||result.caseId!==testCase.id||result.execution!=='generated')throw Error('RUNNABLE_REVIEW_CASE_UNBOUND');
 const observations=result.checks?.map(check=>check.observation)??[],hashes=new Set(observation.outputs.map(output=>output.snapshot.sha256));
 if(result.checks?.length!==testCase.checks.length||result.checks.some(value=>{const canonical=testCase.checks.find(check=>check.id===value.id);return !canonical||value.expected!==canonical.expected||value.evidenceKind!==canonical.evidenceKind||value.basis!==canonical.basis||JSON.stringify(value.sourceIds)!==JSON.stringify(canonical.sourceIds);})||observations.some(value=>!value||!hashes.has(value.artifactSha256))||evaluateBenchmark(testCase,observations,'generated').verdict!=='satisfied')throw Error('RUNNABLE_REVIEW_INCOMPLETE');
 for(const output of observation.outputs){await verify(root,output.snapshot);await verify(root,output.versionsEvidence);}
 for(const item of observations)await verify(root,{path:item.evidencePath,sha256:item.evidenceSha256});
 let artifactRoles;if(baseline.requiredArtifactRoles.length){artifactRoles=productionInitialRoleBindingsSchema.parse(input.artifactRoles);for(const role of artifactRoles){const output=observation.outputs.find(value=>value.snapshot.sha256===role.artifactSha256);if(!output||!(await fs.readFile(await verify(root,output.snapshot),'utf8')).includes(role.quote))throw Error('INITIAL_ARTIFACT_ROLE_UNBOUND');}}
 const checkedAt=new Date().toISOString();if(Date.parse(checkedAt)<Date.parse(observation.observedAt))throw Error('RUNNABLE_REVIEW_TIME_INVALID');
 const start=await json(root,path.join(caseDir,'production-start.json')),receipt=await json(root,path.join(caseDir,'execution.json'));if(start.caseId!==testCase.id||receipt.steps[0].runId!==observation.runId)throw Error('RUNNABLE_START_UNBOUND');
 return save(path.join(caseDir,'production-first-runnable.json'),productionRunnableReviewSchema.parse({schemaVersion:1,caseId:testCase.id,runId:observation.runId,startSha256:await evaluationHash(path.join(caseDir,'production-start.json')),stage:1,initialPromptSha256:sha(testCase.prompts[0]),checksSha256:sha(JSON.stringify(testCase.checks)),observedAt:observation.observedAt,checkedAt,definition:'官方读取封存完整成果集合后，独立核对原初全部要求；版本出现与核对完成时间分别记录',snapshot:observation.outputs[0].snapshot,observationEvidence:input.observationEvidence,reviewEvidence:input.reviewEvidence,browserEvidence:input.browserEvidence,artifactRoles,prototypeEvidence:input.prototypeEvidence,observations}));
}

