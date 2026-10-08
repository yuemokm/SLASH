// Opt-in isolation helper. No app launch, model prompt, apply, SQL or DOM guessing.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {z} from 'zod';

const hash=z.string().regex(/^[a-f0-9]{64}$/),id=z.string().min(1).max(200),absolute=z.string().min(1).refine(path.isAbsolute),relative=z.string().min(1).max(4096).refine(p=>!path.isAbsolute(p)&&!p.includes(':')&&!p.includes('\0')&&!p.replaceAll('\\','/').split('/').includes('..'));
const file=z.object({path:absolute,sha256:hash}).strict();
export const qualityDraftFaultScopeSchema=z.object({testRoot:absolute,caseDir:absolute,profile:absolute,workspace:absolute,runId:id,mountId:id,path:relative,deadlineAt:z.number().int().positive()}).strict();
export const qualityDraftFaultPlanSchema=z.object({schemaVersion:z.literal(1),identity:z.literal('host_fault_injection'),reviewedBy:id,humanConfirmed:z.literal(false),runId:id,mountId:id,path:relative,changeId:id,expectedContentHash:hash,expectedFaultHash:hash,
 requiredSpec:z.object({id,revision:z.number().int().nonnegative(),specHash:hash,reportId:id}).strict(),domReceipt:file,protectedFiles:z.array(file).max(100),
 fault:z.object({kind:z.literal('remove_readonly'),selector:z.string().min(1).max(200),oldText:z.string().min(1).max(16000),newText:z.string().max(16000),attributeStart:z.number().int().nonnegative(),attributeEnd:z.number().int().positive()}).strict(),
}).strict();
const sha=value=>createHash('sha256').update(value).digest('hex');
const key=value=>process.platform==='win32'?path.normalize(value).toLowerCase():path.normalize(value);
const same=(a,b)=>key(a)===key(b);
const within=(root,target)=>{const p=path.relative(root,target);return !path.isAbsolute(p)&&p!=='..'&&!p.startsWith('..'+path.sep);};
const fail=code=>{throw Error(code);};
async function checkedPath(root,target){const resolved=await fs.realpath(target);if(!within(root,resolved)||!same(path.resolve(target),resolved))fail('QUALITY_FAULT_PATH_SCOPE');return resolved;}
async function boundedFile(target,max=2_000_000){const stat=await fs.lstat(target);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>max)fail('QUALITY_FAULT_FILE_INVALID');return fs.readFile(target);}

/** Proof must be host-browser DOM evidence for this exact pending content hash.
 * The reviewed raw source span is not derived by this module from a selector. */
export function validateQualityDraftFaultPlan(value,{scope,content,changeId,domReceipt}){
 const plan=qualityDraftFaultPlanSchema.parse(value);
 if(plan.runId!==scope.runId||plan.mountId!==scope.mountId||plan.path!==scope.path||plan.changeId!==changeId||sha(content)!==plan.expectedContentHash)fail('QUALITY_FAULT_PLAN_STALE');
 const fault=plan.fault,dom=domReceipt;
 if(dom?.schemaVersion!==1||dom.observer!=='host_browser_dom'||dom.artifactHash!==plan.expectedContentHash||dom.target?.source!=='pending'||dom.target?.runId!==plan.runId||dom.target?.changeId!==plan.changeId||dom.target?.mountId!==plan.mountId||dom.target?.path!==plan.path)fail('QUALITY_FAULT_DOM_UNBOUND');
 const node=dom.node;
 if(!node||node.selector!==fault.selector||node.count!==1||node.tag!=='input'||node.sourceStartTag!==fault.oldText||!Number.isInteger(node.sourceOffset)||content.slice(node.sourceOffset,node.sourceOffset+fault.oldText.length)!==fault.oldText)fail('QUALITY_FAULT_DOM_AMBIGUOUS');
 const offset=content.indexOf(fault.oldText);if(offset<0||offset!==node.sourceOffset||content.indexOf(fault.oldText,offset+1)!==-1)fail('QUALITY_FAULT_MATCH_NOT_UNIQUE');
 if(fault.oldText.slice(0,6).toLowerCase()!=='<input'||!fault.oldText.endsWith('>')||fault.attributeEnd>fault.oldText.length||fault.attributeEnd<=fault.attributeStart)fail('QUALITY_FAULT_SOURCE_SPAN');
 const oldAttribute=fault.oldText.slice(fault.attributeStart,fault.attributeEnd),prefix=fault.oldText.slice(0,fault.attributeStart),suffix=fault.oldText.slice(fault.attributeEnd);
 if(node.readonly!==true||![' readonly',' readonly=""'," readonly=''",' readonly="readonly"'," readonly='readonly'"].includes(oldAttribute.toLowerCase())||fault.newText!==prefix+suffix)fail('QUALITY_FAULT_NOT_READONLY_REMOVAL');
 const expected=content.slice(0,offset)+fault.newText+content.slice(offset+fault.oldText.length);
 if(sha(expected)!==plan.expectedFaultHash||plan.expectedContentHash===plan.expectedFaultHash)fail('QUALITY_FAULT_EXPECTED_DIFF_MISMATCH');
 return{plan,expected,offset,line:1+content.slice(0,offset).split('\n').length-1};
}

/** ServicePrototype is the real Service.prototype in isolated Electron main.
 * preparePlan may await a locally reviewed file, under the existing deadline.
 * It returns {path,sha256}; it cannot author an inferred/model business plan. */
export async function installQualityDraftFault({ServicePrototype,scope:value,planFile,preparePlan}){
 const scope=qualityDraftFaultScopeSchema.parse(value),testRoot=await fs.realpath(scope.testRoot);
 if(path.basename(testRoot)!=='.test-data')fail('QUALITY_FAULT_TEST_ROOT_REQUIRED');
 await checkedPath(testRoot,scope.caseDir);await checkedPath(testRoot,scope.workspace);await checkedPath(testRoot,scope.profile);
 if(!same(scope.workspace,path.join(scope.caseDir,'workspace'))||!same(scope.profile,path.join(scope.caseDir,'profile'))||!within(testRoot,scope.caseDir)||same(testRoot,scope.caseDir))fail('QUALITY_FAULT_CASE_SCOPE');
 if(typeof ServicePrototype?.checkTaskAcceptance!=='function'||ServicePrototype[Symbol.for('slash.qualityDraftFault')])fail('QUALITY_FAULT_WRAPPER_EXISTS');
 if(Boolean(planFile)===Boolean(preparePlan)||preparePlan&&typeof preparePlan!=='function')fail('QUALITY_FAULT_PLAN_PROVIDER_REQUIRED');
 const receiptPath=path.join(scope.caseDir,'host-fault-injection.json'),candidatePath=path.join(scope.caseDir,'host-fault-candidate.json'),lockPath=path.join(scope.caseDir,'host-fault-once.lock');
 const original=ServicePrototype.checkTaskAcceptance;
 let attempt,receipt,disposed=false;
 const record=async data=>{receipt={schemaVersion:1,identity:'host_fault_injection',humanConfirmed:false,cloudExecuted:false,runId:scope.runId,target:{mountId:scope.mountId,path:scope.path},recordedAt:new Date().toISOString(),...data};await fs.writeFile(receiptPath,JSON.stringify(receipt,null,2),{flag:'wx'});};
 const runGuard=(service,run)=>{if(!same(service.store.dir,scope.profile)||!same(service.state.root,scope.workspace)||run.id!==scope.runId||run.phase!=='validating'||run.status!=='validating'||!run.generationFinishedAt||run.finishedAt||run.mode==='plan'||run.acceptance?.repairRounds!==0||service.cancelled?.has(run.id)||service.runControllers?.get(run.id)?.signal.aborted||Date.now()>=scope.deadlineAt)fail('QUALITY_FAULT_RUN_NOT_CURRENT');};
 async function inject(service,run){
  let edited=false,protectedBefore;
  try{
   await fs.writeFile(lockPath,JSON.stringify({identity:'host_fault_injection',runId:scope.runId,pid:process.pid,at:new Date().toISOString()}),{flag:'wx'});
   runGuard(service,run);
   const full=async()=>{let content='',offset=0,hashValue,changeId,baseHash;for(let pages=0;pages<126;pages++){
    runGuard(service,run);const r=await service.readDraftForRun(run.id,{mountId:scope.mountId,path:scope.path,offset,limit:16000});
    if(r.source!=='pending'||!r.changeId||(offset>0&&(r.contentHash!==hashValue||r.changeId!==changeId)))fail('QUALITY_FAULT_PENDING_CHANGED');
    hashValue??=r.contentHash;changeId??=r.changeId;baseHash=r.baseHash;content+=r.content;
    if(Buffer.byteLength(content)>2_000_000)fail('QUALITY_FAULT_DRAFT_LIMIT');if(r.nextOffset===undefined){if(sha(content)!==hashValue)fail('QUALITY_FAULT_READ_HASH_MISMATCH');return{content,contentHash:hashValue,changeId,baseHash};}if(r.nextOffset<=offset)fail('QUALITY_FAULT_READ_CURSOR');offset=r.nextOffset;
   }fail('QUALITY_FAULT_DRAFT_LIMIT');};
   const draft=await full(),targetAbsolute=await service.files.resolve(scope.mountId,scope.path),physicalTarget=await checkedPath(scope.workspace,targetAbsolute),matching=[];
   for(const c of service.state.changes.filter(c=>c.status==='pending'&&c.runId===run.id&&c.mountId===scope.mountId)){
    const absolute=await service.files.resolve(c.mountId,c.path);
    // Files resolves both Windows separators under the original mount authority.
    // Check physical scope only for this target, not unrelated new pending files.
    if(same(absolute,targetAbsolute)&&same(await checkedPath(scope.workspace,absolute),physicalTarget))matching.push(c);
   }
   if(matching.length!==1||matching[0].id!==draft.changeId||sha(matching[0].content)!==draft.contentHash)fail('QUALITY_FAULT_PENDING_NOT_UNIQUE');
   await fs.writeFile(candidatePath,JSON.stringify({schemaVersion:1,identity:'host_fault_injection',runId:run.id,target:{source:'pending',runId:run.id,mountId:scope.mountId,path:scope.path,changeId:draft.changeId},artifactHash:draft.contentHash,baseHash:draft.baseHash,characters:draft.content.length,deadlineAt:scope.deadlineAt,notice:'Candidate only; inspect this exact pending draft through official preview. No injection or business approval yet.'},null,2),{flag:'wx'});
   const signal=service.runControllers?.get(run.id)?.signal,controller=new AbortController();let timer,onAbort;
   const pending=Promise.resolve().then(()=>preparePlan?preparePlan({candidatePath,draft:{...draft,content:undefined},scope,signal:controller.signal}):planFile);
   const bounded=new Promise((_,reject)=>{onAbort=()=>{controller.abort();reject(Error('QUALITY_FAULT_CANCELLED'));};if(signal?.aborted)return onAbort();signal?.addEventListener('abort',onAbort,{once:true});timer=setTimeout(()=>{controller.abort();reject(Error('QUALITY_FAULT_DEADLINE'));},Math.max(0,scope.deadlineAt-Date.now()));});
   let supplied;try{supplied=await Promise.race([pending,bounded]);}finally{clearTimeout(timer);signal?.removeEventListener('abort',onAbort);controller.abort();}
   runGuard(service,run);const approvedFile=file.parse(supplied),planPath=await checkedPath(scope.caseDir,approvedFile.path);
   if(within(scope.workspace,planPath)||within(scope.profile,planPath))fail('QUALITY_FAULT_PLAN_HOST_ONLY');
   const planBytes=await boundedFile(planPath,128000);if(sha(planBytes)!==approvedFile.sha256)fail('QUALITY_FAULT_PLAN_FILE_CHANGED');
   const plan=qualityDraftFaultPlanSchema.parse(JSON.parse(planBytes)),domPath=await checkedPath(scope.caseDir,plan.domReceipt.path);
   if(within(scope.workspace,domPath)||within(scope.profile,domPath))fail('QUALITY_FAULT_DOM_HOST_ONLY');
   const domBytes=await boundedFile(domPath,128000);if(sha(domBytes)!==plan.domReceipt.sha256)fail('QUALITY_FAULT_DOM_FILE_CHANGED');
   const verified=validateQualityDraftFaultPlan(plan,{scope,content:draft.content,changeId:draft.changeId,domReceipt:JSON.parse(domBytes)});
   const view=await service.getPrototypeAcceptance({mountId:scope.mountId,path:scope.path}),spec=view?.spec,report=view?.latestReport;
   if(!spec?.required||view.needsConfirmation||spec.id!==plan.requiredSpec.id||spec.revision!==plan.requiredSpec.revision||spec.specHash!==plan.requiredSpec.specHash||report?.reportId!==plan.requiredSpec.reportId||report.versionState!=='current'||report.evidence.status!=='passed'||report.evidence.specHash!==spec.specHash)fail('QUALITY_FAULT_REQUIRED_BASELINE_NOT_PASSED');
   if(plan.fault.kind==='remove_readonly'&&!spec.cases.some(c=>c.steps.some(s=>s.action==='assert'&&s.assertion==='readonly'&&s.selector===plan.fault.selector&&s.expected===true)))fail('QUALITY_FAULT_NO_REQUIRED_FAULT_ASSERTION');
   const task=await service.getTaskAcceptance(run.id);
   if(!task?.contract?.outputs.some(o=>o.kind==='html'&&o.target.source==='draft'&&o.target.changeId===draft.changeId&&o.target.contentHash===draft.contentHash)||!task.contract.baseline.some(b=>b.specId===spec.id&&b.specHash===spec.specHash&&spec.cases.every(c=>b.cases.some(bc=>JSON.stringify(bc)===JSON.stringify(c)))))fail('QUALITY_FAULT_BASELINE_NOT_FROZEN');
   const formal=await service.files.resolve(scope.mountId,scope.path),formalPath=await checkedPath(scope.workspace,formal),formalBytes=await boundedFile(formalPath),formalHash=sha(formalBytes);
   if(formalHash!==draft.baseHash||formalHash!==report.evidence.entryHash)fail('QUALITY_FAULT_FORMAL_BASE_CHANGED');
   const protectedFiles=[{path:formalPath,sha256:formalHash},{path:planPath,sha256:approvedFile.sha256},{path:domPath,sha256:plan.domReceipt.sha256},...plan.protectedFiles];
   for(const dependency of report.evidence.manifest??[]){const resolved=await checkedPath(scope.workspace,path.resolve(path.dirname(formalPath),dependency.path));if(!protectedFiles.some(f=>same(f.path,resolved)&&f.sha256===dependency.hash))fail('QUALITY_FAULT_DEPENDENCY_UNPROTECTED');}
   for(const source of spec.sourceRefs??[]){const resolved=await service.files.resolve(source.mountId,source.path);if(!protectedFiles.some(f=>same(f.path,resolved)&&f.sha256===source.contentHash))fail('QUALITY_FAULT_SOURCE_UNPROTECTED');}
   const snapshots=async()=>{const result=[];let bytes=0;for(const item of protectedFiles){const location=await checkedPath(testRoot,item.path),content=await boundedFile(location);bytes+=content.length;if(bytes>20_000_000)fail('QUALITY_FAULT_PROTECTION_BUDGET');const actual=sha(content);if(actual!==item.sha256)fail('QUALITY_FAULT_PROTECTED_FILE_CHANGED');result.push({path:location,sha256:actual});}return result;};
   const pendingDependencies=()=>service.state.changes.filter(c=>c.status==='pending'&&c.runId===run.id&&c.id!==draft.changeId).map(c=>({changeId:c.id,mountId:c.mountId,path:c.path,contentHash:sha(c.content),baseHash:c.before})).sort((a,b)=>a.changeId.localeCompare(b.changeId));
   const pendingBefore=pendingDependencies();protectedBefore=await snapshots();runGuard(service,run);const current=await full();if(current.contentHash!==draft.contentHash||current.changeId!==draft.changeId)fail('QUALITY_FAULT_PENDING_CHANGED');
   const at=new Date().toISOString();edited=true;const edit=await service.editDraftForRun(run.id,{mountId:scope.mountId,path:scope.path,changeId:draft.changeId,expectedContentHash:draft.contentHash,oldText:plan.fault.oldText,newText:plan.fault.newText});
   runGuard(service,run);const after=await full(),protectedAfter=await snapshots(),pendingAfter=pendingDependencies();
   if(JSON.stringify(pendingBefore)!==JSON.stringify(pendingAfter))fail('QUALITY_FAULT_PENDING_DEPENDENCY_CHANGED');
   if(after.changeId!==draft.changeId||after.contentHash!==plan.expectedFaultHash||after.content!==verified.expected||after.baseHash!==draft.baseHash||edit.contentHash!==after.contentHash)fail('QUALITY_FAULT_NATIVE_EDIT_NOT_EXACT');
   await record({status:'injected',injectedAt:at,changeId:draft.changeId,plan:{path:planPath,sha256:approvedFile.sha256,reviewedBy:plan.reviewedBy},domReceipt:plan.domReceipt,fault:plan.fault,beforeHash:draft.contentHash,afterHash:after.contentHash,exactDiff:{offset:verified.offset,line:verified.line,oldText:plan.fault.oldText,newText:plan.fault.newText},nativeEdit:{diff:edit.diff,diffHash:edit.diffHash,diffTruncated:edit.diffTruncated},protectedBefore,protectedAfter,pendingDependenciesBefore:pendingBefore,pendingDependenciesAfter:pendingAfter,formalUnchanged:true,notice:'Host test fault in same-Run pending draft only. This is not a model failure or repair success; the original checker/Pi must produce their own evidence.'});
  }catch(error){await record({status:edited?'verification_invalid':'not_executed',reason:/^QUALITY_FAULT_[A-Z_]+$/.test(error?.message)?error.message:'QUALITY_FAULT_PRECONDITION_FAILED',editAttempted:edited,...(protectedBefore?{protectedBefore}:{}),notice:'No automatic retry, rollback, prompt or apply. Preserve pending state and inspect original evidence.'});if(edited)throw error;}
 }
 async function wrapped(runId,...args){
  const run=this.state.runs.find(r=>r.id===runId),matching=runId===scope.runId&&same(this.store.dir,scope.profile)&&same(this.state.root,scope.workspace);
  if(matching&&run?.phase==='validating'&&run.status==='validating'&&run.generationFinishedAt&&run.acceptance?.repairRounds===0){attempt??=inject(this,run);await attempt;}
  return original.call(this,runId,...args);
 }
 ServicePrototype.checkTaskAcceptance=wrapped;ServicePrototype[Symbol.for('slash.qualityDraftFault')]=true;
 return{receiptPath,candidatePath,getReceipt:()=>receipt,async finish(){await attempt;if(!receipt)await record({status:'not_executed',reason:'QUALITY_FAULT_NO_MATCHING_VALIDATION'});return receipt;},dispose(){if(disposed)return;if(ServicePrototype.checkTaskAcceptance!==wrapped)fail('QUALITY_FAULT_WRAPPER_CHANGED');ServicePrototype.checkTaskAcceptance=original;delete ServicePrototype[Symbol.for('slash.qualityDraftFault')];disposed=true;}};
}
