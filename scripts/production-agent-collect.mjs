// Completed-trial collector only. No model send/resume, provider credential read or automatic review.
import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {DatabaseSync} from 'node:sqlite';
import {collectProductionTrial} from './production-agent-trial.mjs';
import {evaluationHash,requireEvaluationPath} from '../main/quality-evaluation.ts';
import {requestSchema} from '../shared/types.ts';

const defaultRepo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const active=new Set(['queued','running','waiting_user','validating','cancelling']);
const permitted=new Set(['state','read','versions','export']);
const reason=error=>/^[A-Z][A-Z0-9_]+$/.test(error?.message??'')?error.message:'PRODUCTION_COLLECTION_FAILED';
async function saveNew(file,body){await fs.writeFile(file,JSON.stringify(body,null,2)+'\n',{flag:'wx'});return{path:file,sha256:await evaluationHash(file)};}
function assertInactive(runs){if(runs.some(run=>active.has(run.status)))throw Error('PRODUCTION_PROFILE_HAS_ACTIVE_RUN');}

async function launchOfficial({repo,profile}){
 const {_electron:electron}=await import('playwright');const env={...process.env,PM_SLASH_DATA_DIR:profile,PM_SLASH_TEST_HIDDEN:'1'};delete env.ELECTRON_RUN_AS_NODE;delete env.VITE_DEV_SERVER_URL;delete env.PM_SLASH_DEV_SERVER_URL;
 const app=await electron.launch({cwd:repo,args:['.'],env,timeout:60000});
 try{const page=await app.firstWindow();page.setDefaultTimeout(20000);if(await app.evaluate(({app})=>app.getPath('userData'))!==profile)throw Error('PRODUCTION_PROFILE_MISMATCH');await page.locator('.brand').waitFor();
  return{sessionId:`${app.process().pid}:${randomUUID()}`,call:async input=>{const parsed=requestSchema.parse(input);if(!permitted.has(parsed.type))throw Error('PRODUCTION_COLLECTION_REQUEST_FORBIDDEN');const response=await page.evaluate(value=>window.pm.request(value),parsed);if(!response.ok)throw Error('PRODUCTION_OFFICIAL_IPC_REJECTED');return response.data;},exportCopy:async({call,mountId,path:relative,expectedContentHash,targetPath})=>{if(await fs.access(targetPath).then(()=>true).catch(error=>{if(error.code==='ENOENT')return false;throw error;}))throw Error('PRODUCTION_EXPORT_TARGET_EXISTS');await app.evaluate(({dialog},target)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:target});},targetPath);await call({type:'export',mountId,path:relative,format:'copy',expectedContentHash});await fs.access(targetPath);return{path:targetPath};},close:async()=>{await app.close();}};
 }catch(error){await app.close();throw error;}
}

/** One isolated profile owner. A fresh instance is launched only after the previous close completes. */
export async function collectCompletedProductionTrial(input){
 const repo=path.resolve(input.repo??defaultRepo),root=await requireEvaluationPath(path.join(repo,'.test-data'),path.resolve(input.testDir)),caseDir=await requireEvaluationPath(root,path.join(root,'cases',input.caseId)),executionFile=await requireEvaluationPath(root,path.join(caseDir,'execution.json'));
 const attemptPath=path.join(caseDir,`production-collector-attempt-${randomUUID()}.json`),attempt={schemaVersion:1,caseId:input.caseId,startedAt:new Date().toISOString(),status:'started',sessionIds:[],cloudExecuted:false,modelSendCalls:0};
 const ownerPath=path.join(caseDir,'production-profile-owner.lock');let owner,session,lockMayRelease=true,primaryError,candidateBody;
 try{
  owner=await fs.open(ownerPath,'wx').catch(error=>{if(error.code==='EEXIST')throw Error('PRODUCTION_PROFILE_ALREADY_OWNED');throw error;});await owner.writeFile(JSON.stringify({pid:process.pid,startedAt:attempt.startedAt,attemptPath}));
  const execution=JSON.parse(await fs.readFile(executionFile,'utf8'));if(execution.caseId!==input.caseId||!Number.isFinite(Date.parse(execution.finishedAt))||['preparing','running','awaiting_bindings'].includes(execution.status)||execution.instanceCloseError)throw Error('PRODUCTION_EXECUTOR_NOT_CLOSED');
  if(await fs.access(path.join(caseDir,'production-trial.json')).then(()=>true).catch(error=>{if(error.code==='ENOENT')return false;throw error;}))throw Error('PRODUCTION_TRIAL_ALREADY_COLLECTED');
  const profile=await requireEvaluationPath(root,path.join(caseDir,'profile')),database=await requireEvaluationPath(profile,path.join(profile,'slash.sqlite')),db=new DatabaseSync(database,{readOnly:true});
  try{assertInactive(db.prepare("SELECT json_extract(r.value,'$.status') status FROM kv,json_each(json_extract(kv.value,'$.runs')) r WHERE kv.key='state'").all());}finally{db.close();}
  if(!Object.keys(execution.runtimeHashes??{}).length)throw Error('PRODUCTION_COLLECTOR_RUNTIME_MISSING');
  for(const [file,hash]of Object.entries(execution.runtimeHashes))if(!/^[a-f0-9]{64}$/.test(hash)||await evaluationHash(await requireEvaluationPath(path.join(repo,'dist'),path.join(repo,'dist',file)))!==hash)throw Error('PRODUCTION_COLLECTOR_RUNTIME_CHANGED');
  const launch=input.launch??launchOfficial;session=await launch({repo,profile});attempt.sessionIds.push(session.sessionId);
  const guarded=original=>async request=>{if(!permitted.has(request.type))throw Error('PRODUCTION_COLLECTION_REQUEST_FORBIDDEN');return original(request);};session.call=guarded(session.call);assertInactive((await session.call({type:'state'})).runs??[]);
  const first=session;const candidate=await collectProductionTrial({repo,testDir:root,caseId:input.caseId,call:first.call,sessionId:first.sessionId,reopen:async()=>{await first.close();session=undefined;session=await launch({repo,profile});session.call=guarded(session.call);attempt.sessionIds.push(session.sessionId);assertInactive((await session.call({type:'state'})).runs??[]);return{call:session.call,sessionId:session.sessionId};},exportCopy:async options=>{if(!session)throw Error('PRODUCTION_REOPEN_INSTANCE_MISSING');return session.exportCopy(options);}});
  attempt.candidateEvidence=candidate;
  await session.close();session=undefined;
  candidateBody=await fs.readFile(candidate.path,'utf8');if(await evaluationHash(candidate.path)!==candidate.sha256)throw Error('PRODUCTION_TRIAL_CANDIDATE_CHANGED');
  attempt.status='ready_to_commit';
 }catch(error){primaryError=error;attempt.status='failed';attempt.reason=reason(error);throw error;}
 finally{
  if(session)try{await session.close();}catch(error){lockMayRelease=false;attempt.closeError=reason(error);attempt.status='failed';}
  attempt.finishedAt=new Date().toISOString();await saveNew(attemptPath,attempt);
  if(owner){await owner.close();if(lockMayRelease)await fs.unlink(ownerPath);}
  if(!lockMayRelease&&!primaryError)throw Error('PRODUCTION_COLLECTION_CLOSE_FAILED');
 }
 // No final evidence exists until every instance close and durable cleanup record has succeeded.
 try{return await saveNew(path.join(caseDir,'production-trial.json'),JSON.parse(candidateBody));}catch(error){await saveNew(path.join(caseDir,`production-collector-commit-failure-${randomUUID()}.json`),{schemaVersion:1,status:'failed',reason:reason(error),attemptPath,candidateEvidence:attempt.candidateEvidence,finishedAt:new Date().toISOString()}).catch(()=>{});throw error;}
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2),value=name=>{const index=args.indexOf(name);if(index<0||!args[index+1]||args[index+1].startsWith('--'))throw Error('PRODUCTION_COLLECTION_ARGUMENT_REQUIRED');return args[index+1];};
 try{for(let i=0;i<args.length;i+=2)if(!['--test-dir','--case'].includes(args[i]))throw Error('PRODUCTION_COLLECTION_ARGUMENT_UNKNOWN');const evidence=await collectCompletedProductionTrial({testDir:value('--test-dir'),caseId:value('--case')});console.log(JSON.stringify({status:'collected',evidence,cloudExecuted:false}));}catch(error){console.error(JSON.stringify({status:'failed',reason:reason(error),cloudExecuted:false}));process.exitCode=1;}
}
