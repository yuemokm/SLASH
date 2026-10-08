// Read-only reconciliation for one historical harness failure. No Electron or cloud.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {fileURLToPath} from 'node:url';

const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const approved=path.join(repo,'.test-data','pm-operations-real-2026-10-06T15-02-09.188Z-0W1tPJ');
const ids=['fa95a1f1-c2c5-4b01-b6c2-2efffb74a8a5','43006102-6a3f-4bb0-b217-ed8b75309f2a','f85f4b52-cba0-4373-bb7b-267a84197ec5'];
const conversationId='6f40e0f2-4168-4f27-84c1-7bc83dc565a4',changeId='ca22f095-c974-4527-b715-c1fdbcadefec';
const failedReceiptHash='1e371d8a51b69e0a3903dd252fa4b251740070f0c1ba96ee1cd211585f138351';
const artifactHash='bd60b680109d188364b9c32f8fe02436601718bec6b9b322096a65dd312f105b';
const previousDraftHash='f861736aa86175fb4ced3551340d9527cb07e11ad4b81e23a6ddd58fca6f1251';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex'),hash=async file=>sha(await fs.readFile(file));
const within=(root,file)=>{const rel=path.relative(root,file);return rel&&!path.isAbsolute(rel)&&rel!=='..'&&!rel.startsWith('..'+path.sep);};
const canon=value=>String(value).replaceAll('\\','/').toLowerCase();
const json=async file=>JSON.parse(await fs.readFile(file,'utf8'));
const must=(condition,reason)=>{if(!condition)throw Error(reason);};
async function direct(file){must(await fs.realpath(file)===file,'RECONCILIATION_SYMLINK_FORBIDDEN');}
function kv(db,key){const row=db.prepare('SELECT value FROM kv WHERE key=?').get(key);return row?JSON.parse(row.value):undefined;}
async function filesUnder(folder){const result=[];for(const row of await fs.readdir(folder,{withFileTypes:true})){const file=path.join(folder,row.name);must(!row.isSymbolicLink(),'RECONCILIATION_SYMLINK_FORBIDDEN');if(row.isDirectory())result.push(...await filesUnder(file));else if(row.isFile())result.push(file);else throw Error('RECONCILIATION_NON_FILE_OUTPUT');}return result;}

async function collect(testDir,parentReceipt,interruptedFeedbackReceipt){
 const output=path.resolve(testDir);must(output===approved,'RECONCILIATION_CASE_NOT_APPROVED');await direct(output);
 const manifestFile=path.join(output,'manifest.json'),m=await json(manifestFile),c=m.cases?.completions;
 must(m.output===output&&m.sources===path.join(output,'synthetic-sources')&&m.htmlPath==='门店作战中心/index.html'&&c?.folder===path.join(output,'protocols','completions')&&c.profile===path.join(c.folder,'profile')&&c.workspace===path.join(c.folder,'workspace')&&c.result===path.join(c.folder,'result.json')&&c.model.protocol==='openai-completions','RECONCILIATION_MANIFEST_INVALID');
 for(const folder of [m.sources,c.folder,c.profile,c.workspace])await direct(folder);
 // Verification after the one approved feedback attempt may see its interrupted
 // run alongside the three historical runs. It must have made no changes.
 let feedback;
 if(interruptedFeedbackReceipt){const file=path.resolve(interruptedFeedbackReceipt);must(file===path.join(c.folder,'feedback-revision','feedback-receipt.json')&&await hash(file)==='40c22e24bb0a791dd33b12b6573558feb36343c4d4689ea3b8a639cb00d86779','RECONCILIATION_FEEDBACK_RECEIPT_CHANGED');await direct(file);feedback=await json(file);must(feedback.runId==='1d1048a3-2c25-4b32-8da4-6b0aba0c1560'&&feedback.status==='failed'&&feedback.run?.status==='interrupted'&&feedback.run.resumable===true&&feedback.run.interruptionReason==='model_output_limit'&&feedback.run.modelStopReason==='length'&&feedback.toolCounts?.edit_draft===0&&feedback.toolCounts?.write_draft===0&&feedback.drafts?.length===0&&!feedback.finalArtifact,'RECONCILIATION_FEEDBACK_NOT_UNCHANGED');}
 const parent=path.resolve(parentReceipt),expectedParent=path.join(c.folder,'continuation-'+ids[1],'resume-receipt.json');must(parent===expectedParent,'RECONCILIATION_PARENT_SCOPE_INVALID');
 must(await hash(parent)===failedReceiptHash,'RECONCILIATION_FAILED_RECEIPT_CHANGED');
 const receipt=await json(parent),ancestorFile=path.join(c.folder,'continuation-'+ids[0],'resume-receipt.json'),ancestor=await json(ancestorFile),original=await json(c.result);
 const directory=path.join(c.folder,'applied-reconciliation-'+ids[2]),snapshot=path.join(directory,'applied-html.html'),receiptFile=path.join(directory,'reconciliation-receipt.json');
 const protectedFiles=new Set([manifestFile,c.result,parent,ancestorFile,path.join(c.folder,'run-once.lock'),path.join(c.folder,'task-prompt.txt'),path.join(c.folder,'resume-once.lock'),path.join(c.folder,'resume-'+ids[1]+'.lock')]);
 must(original.runId===ids[0]&&original.conversationId===conversationId&&original.profile===c.profile&&original.workspace===c.workspace&&original.configuredProtocol===c.model.protocol&&original.realSendCalls===1,'RECONCILIATION_ORIGINAL_IDENTITY_INVALID');
 for(const [index,row]of [ancestor,receipt].entries()){
  const file=index?parent:ancestorFile;await direct(file);await direct(path.dirname(file));
  must(row.originalRunId===ids[index]&&row.resumedRunId===ids[index+1]&&row.run?.id===ids[index+1]&&row.run.resumedFromRunId===ids[index]&&row.run.conversationId===conversationId&&row.conversationId===conversationId&&row.profile===c.profile&&row.workspace===c.workspace&&row.configuredModel?.id===c.model.id&&row.configuredModel?.modelId===c.model.modelId&&row.configuredModel?.protocol===c.model.protocol&&row.resumeCalls===1&&row.sendCalls===0&&row.status==='failed'&&!row.finalArtifact&&row.protectedEvidenceUnchanged===true&&row.readonlySeedUnchanged===true&&row.actualProtocolVerified===true,'RECONCILIATION_ANCESTRY_INVALID');
  must(index?row.run.status==='succeeded'&&row.reason==='FINAL_PENDING_SCOPE_INVALID'&&row.parentReceipt===ancestorFile&&JSON.stringify(row.priorRunIds)===JSON.stringify(ids.slice(0,2)):row.run.status==='failed'&&!row.parentReceipt,'RECONCILIATION_FAILURE_SCOPE_INVALID');
  for(const target of [manifestFile,c.result,path.join(c.folder,'run-once.lock'),path.join(c.folder,'task-prompt.txt')])must(typeof row.originalProtectedHashes?.[target]==='string','RECONCILIATION_PROTECTION_MISSING');
  for(const [target,expected]of Object.entries(row.originalProtectedHashes)){must(within(output,target)&&await hash(target)===expected,'RECONCILIATION_PROTECTED_EVIDENCE_CHANGED');protectedFiles.add(target);}
  for(const draft of row.drafts??[])if(draft.snapshot){must(within(path.dirname(file),draft.snapshot)&&await hash(draft.snapshot)===draft.sha256,'RECONCILIATION_DRAFT_SNAPSHOT_CHANGED');protectedFiles.add(draft.snapshot);}
 }
 must(receipt.drafts?.length===1&&ancestor.drafts?.length===1&&ancestor.drafts[0].id===changeId&&ancestor.drafts[0].status==='pending'&&ancestor.drafts[0].sha256===previousDraftHash&&receipt.drafts[0].id===changeId&&receipt.drafts[0].status==='applied'&&receipt.drafts[0].sha256===artifactHash&&receipt.drafts[0].appliedByHarness===false,'RECONCILIATION_DRAFT_RECEIPT_INVALID');
 const databaseFile=path.join(c.profile,'slash.sqlite'),databaseHashBefore=await hash(databaseFile),db=new DatabaseSync(databaseFile,{readOnly:true});let s,sourceRefs=[];
 try{s=kv(db,'state');for(const id of ids)for(const read of kv(db,'context-manifest:'+id)?.sourceRefs??[])sourceRefs.push({runId:id,mountId:read.mountId,path:read.path,contentHash:read.contentHash,readAt:read.readAt});}finally{db.close();}
 const databaseHashAfter=await hash(databaseFile);must(databaseHashBefore===databaseHashAfter,'RECONCILIATION_DATABASE_CHANGED_DURING_READ');
 const expectedIds=feedback?[...ids,feedback.runId]:ids;
 must(s.root===c.workspace&&s.runs?.length===expectedIds.length&&s.runs.every(row=>expectedIds.includes(row.id)&&row.conversationId===conversationId)&&s.runs.find(row=>row.id===ids[2])?.status==='succeeded'&&s.changes?.length===1&&!s.changes.some(row=>row.status==='pending'),'RECONCILIATION_LIVE_STATE_INVALID');
 if(feedback){const latest=s.runs.find(row=>row.id===feedback.runId);must(latest?.status==='interrupted'&&latest.resumable===true&&latest.interruptionReason==='model_output_limit'&&latest.modelStopReason==='length'&&latest.startedAt===feedback.run.startedAt&&latest.finishedAt===feedback.run.finishedAt&&latest.modelEntryId===c.model.id&&latest.permissionMode===feedback.permissionMode&&!latest.resumedFromRunId&&!s.runs.some(row=>Date.parse(row.startedAt)>Date.parse(latest.startedAt))&&!s.changes.some(row=>row.runId===latest.id),'RECONCILIATION_FEEDBACK_LIVE_RUN_CHANGED');}
 for(let i=0;i<ids.length;i++){const run=s.runs.find(row=>row.id===ids[i]);must(run.modelEntryId===c.model.id&&(i===0?!run.resumedFromRunId:run.resumedFromRunId===ids[i-1]),'RECONCILIATION_LIVE_CHAIN_INVALID');}
 const run=s.runs.find(row=>row.id===ids[2]);must(run.finishedAt===receipt.run.finishedAt&&run.startedAt===receipt.run.startedAt,'RECONCILIATION_RUN_TIMESTAMPS_CHANGED');
 const source=s.mounts.find(row=>row.path===m.sources),out=s.mounts.find(row=>row.name==='成果');must(source?.enabled&&source.write===false&&out?.enabled&&out.write===true&&within(c.workspace,out.path),'RECONCILIATION_MOUNTS_INVALID');await direct(out.path);
 const target=path.join(out.path,...m.htmlPath.split('/'));await direct(target);const live=s.changes[0],history=live.resumptionHistory;
 must(live.id===changeId&&live.status==='applied'&&live.runId===ids[2]&&live.originRunId===ids[1]&&live.mountId===out.id&&canon(live.path)===canon(m.htmlPath)&&live.before===null&&sha(Buffer.from(live.content))===artifactHash&&history?.length===1&&history[0].fromRunId===ids[1]&&history[0].toRunId===ids[2]&&history[0].contentHash===previousDraftHash&&history[0].at==='2026-10-06T16:12:58.561Z'&&JSON.stringify(history)===JSON.stringify(receipt.drafts[0].resumptionHistory),'RECONCILIATION_APPLIED_OWNERSHIP_INVALID');
 const outputFiles=await filesUnder(out.path);must(outputFiles.length===1&&outputFiles[0]===target&&await hash(target)===artifactHash,'RECONCILIATION_OTHER_OUTPUT_OR_HASH_CHANGED');
 const backup=path.join(c.profile,'versions',changeId+'.json');await direct(backup);const stored=await json(backup);
 must(stored.id===changeId&&stored.runId===ids[2]&&stored.originRunId===ids[1]&&stored.mountId===out.id&&canon(stored.path)===canon(m.htmlPath)&&stored.before===null&&stored.previousContent===null&&stored.status==='pending'&&JSON.stringify(stored.resumptionHistory)===JSON.stringify(history)&&sha(Buffer.from(stored.content))===artifactHash,'RECONCILIATION_OFFICIAL_BACKUP_INVALID');protectedFiles.add(backup);
 const targetStat=await fs.stat(target),backupStat=await fs.stat(backup),finished=Date.parse(run.finishedAt);
 must(backupStat.mtimeMs<finished&&targetStat.mtimeMs<finished&&backupStat.mtimeMs>=Date.parse(history[0].at)&&targetStat.mtimeMs>=backupStat.mtimeMs,'RECONCILIATION_APPLY_TIMING_INVALID');
 must(Array.isArray(m.sourceFiles)&&m.sourceFiles.length===2&&['operations-brief.md','operations-data.json'].every(name=>m.sourceFiles.some(file=>file.name===name)),'RECONCILIATION_SOURCE_MANIFEST_INVALID');
 const sourceChecks=[];for(const file of m.sourceFiles){must(file.path===path.join(m.sources,file.name)&&await hash(file.path)===file.sha256&&sourceRefs.some(read=>read.mountId===source.id&&canon(read.path)===canon(file.name)&&read.contentHash===file.sha256)&&receipt.sourceReadEvidence?.some(read=>canon(read.name)===canon(file.name)&&read.contentHash===file.sha256)&&ancestor.sourceReadEvidence?.some(read=>canon(read.name)===canon(file.name)&&read.contentHash===file.sha256),'RECONCILIATION_SOURCE_HISTORY_CHANGED');sourceChecks.push({name:file.name,path:file.path,sha256:file.sha256});protectedFiles.add(file.path);}
 const seed=path.join(repo,'.test-data','pm-synthetic-real-2026-10-05T14-23-01.348Z-QhpnRm','profile'),seedHashes={database:await hash(path.join(seed,'slash.sqlite')),localState:await hash(path.join(seed,'Local State'))};must(seedHashes.database===m.sourceProfileHashes?.after?.database&&seedHashes.localState===m.sourceProfileHashes?.after?.localState,'RECONCILIATION_READONLY_SEED_CHANGED');
 const protectedHashes=Object.fromEntries(await Promise.all([...protectedFiles].map(async file=>[file,await hash(file)])));
 return{schemaVersion:1,status:'applied_state_reconciled_pending_independent_review',testDir:output,parentReceipt:parent,parentReceiptSha256:failedReceiptHash,ancestorReceipt:ancestorFile,ancestorReceiptSha256:await hash(ancestorFile),profile:c.profile,workspace:c.workspace,conversationId,runId:ids[2],priorRunIds:ids,change:{id:changeId,status:'applied',runId:live.runId,originRunId:live.originRunId,before:live.before,resumptionHistory:history},artifact:{path:target,snapshot,sha256:artifactHash,bytes:targetStat.size,changeId},officialBackup:{path:backup,sha256:await hash(backup),contentHash:artifactHash,previousContent:null,mtime:backupStat.mtime.toISOString()},timing:{ownershipTransferredAt:history[0].at,officialBackupWrittenAt:backupStat.mtime.toISOString(),targetWrittenAt:targetStat.mtime.toISOString(),runFinishedAt:run.finishedAt},appliedBeforeRunCompletion:true,applyActorUnknown:true,appliedByReconciliation:false,originalHarnessStatus:'failed',originalHarnessReason:receipt.reason,cloudExecuted:false,sendCalls:0,resumeCalls:0,pendingCount:0,outputFiles,sourceChecks,sourceReadEvidence:sourceRefs,sourceProfileHashes:seedHashes,protectedHashes,databaseUnchangedDuringRead:true,databaseHashAtReconciliation:databaseHashAfter,businessReview:'not_run',visualReview:'not_run',notice:'Facts establish a safe applied baseline for feedback. The original harness failed; visual and business acceptance remains incomplete.',receiptFile,directory};
}

export async function verifyReconciliationReceipt({testDir,parentReceipt,reconciliationReceipt,interruptedFeedbackReceipt}){
 const facts=await collect(testDir,parentReceipt,interruptedFeedbackReceipt),file=path.resolve(reconciliationReceipt);must(file===facts.receiptFile,'RECONCILIATION_RECEIPT_SCOPE_INVALID');await direct(file);await direct(facts.directory);
 const receipt=await json(file);
 for(const key of ['schemaVersion','status','testDir','parentReceipt','parentReceiptSha256','ancestorReceipt','ancestorReceiptSha256','profile','workspace','conversationId','runId','priorRunIds','change','artifact','officialBackup','timing','appliedBeforeRunCompletion','applyActorUnknown','appliedByReconciliation','originalHarnessStatus','originalHarnessReason','cloudExecuted','sendCalls','resumeCalls','pendingCount','outputFiles','sourceChecks','sourceReadEvidence','sourceProfileHashes','protectedHashes','databaseUnchangedDuringRead','businessReview','visualReview','receiptFile','directory'])must(JSON.stringify(receipt[key])===JSON.stringify(facts[key]),'RECONCILIATION_RECEIPT_FACTS_CHANGED');
 await direct(facts.artifact.snapshot);must(await hash(facts.artifact.snapshot)===artifactHash,'RECONCILIATION_SNAPSHOT_CHANGED');return{...facts,file,sha256:await hash(file)};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2),value=name=>args[args.indexOf(name)+1];
 try{
  const flags=new Set(['--create','--verify','--test-dir','--parent-receipt','--reconciliation-receipt']);for(let i=0;i<args.length;i++){must(flags.has(args[i]),'UNKNOWN_ARGUMENT');if(['--test-dir','--parent-receipt','--reconciliation-receipt'].includes(args[i])){must(args[i+1]&&!args[i+1].startsWith('--'),'ARGUMENT_VALUE_REQUIRED');i++;}}
  must(args.includes('--create')!==args.includes('--verify')&&args.includes('--test-dir')&&args.includes('--parent-receipt'),'RECONCILIATION_EXPLICIT_MODE_CASE_PARENT_REQUIRED');
  if(args.includes('--create')){const facts=await collect(value('--test-dir'),value('--parent-receipt'));await fs.mkdir(facts.directory);await fs.copyFile(facts.artifact.path,facts.artifact.snapshot,fs.constants.COPYFILE_EXCL);must(await hash(facts.artifact.snapshot)===artifactHash,'RECONCILIATION_SNAPSHOT_CHANGED');await fs.writeFile(facts.receiptFile,JSON.stringify({...facts,createdAt:new Date().toISOString()},null,2),{flag:'wx'});const checked=await verifyReconciliationReceipt({testDir:value('--test-dir'),parentReceipt:value('--parent-receipt'),reconciliationReceipt:facts.receiptFile});console.log(JSON.stringify({status:checked.status,receipt:checked.file,sha256:checked.sha256,artifactHash,appliedBeforeRunCompletion:true,applyActorUnknown:true,cloudExecuted:false}));}
  else{must(args.includes('--reconciliation-receipt'),'RECONCILIATION_RECEIPT_REQUIRED');const checked=await verifyReconciliationReceipt({testDir:value('--test-dir'),parentReceipt:value('--parent-receipt'),reconciliationReceipt:value('--reconciliation-receipt')});console.log(JSON.stringify({status:'reconciliation_verified_offline',receipt:checked.file,sha256:checked.sha256,artifactHash,cloudExecuted:false}));}
 }catch(error){console.error(JSON.stringify({status:'failed',reason:String(error?.message??'RECONCILIATION_FAILED').split(':')[0],cloudExecuted:false}));process.exitCode=1;}
}
