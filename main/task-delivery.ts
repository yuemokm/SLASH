import {createHash,randomUUID} from 'node:crypto';
import {taskDeliveryReviewSchema,type TaskDeliveryView,type TaskDeliveryItem,type TaskDeliveryRecord,type TaskDeliveryReviewInput,type TaskDeliveryDecision} from '../shared/task-delivery.js';
import type {TaskAcceptanceContract,TaskAcceptanceReport,TaskCheckResult} from '../shared/task-acceptance.js';
import type {WorkflowSourceReceipt} from '../shared/types.js';
import {taskModelSourceId} from './task-acceptance-model-view.js';
const digest=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const unique=(values:string[])=>[...new Set(values)].sort();
export const taskDeliverySourceKey=taskModelSourceId;
export type TaskDeliverySnapshot={contract:TaskAcceptanceContract;report:TaskAcceptanceReport;reports?:TaskAcceptanceReport[];firstReportAt?:string;optionalCriterionIds?:string[];sources?:WorkflowSourceReceipt[];sourceVersionReasons?:string[]};
type Dependencies={store:{get<T>(key:string,fallback:T):T;set(key:string,value:unknown):void};snapshot:(runId:string,reportId?:string)=>Promise<TaskDeliverySnapshot>;readSourceHash?:(source:WorkflowSourceReceipt)=>Promise<string>;guard?:(write:boolean)=>void;now?:()=>string};
const NOTICE='人工核对仅绑定此报告、要求、成果、依赖与资料版本。自动检查事实保留；改稿或来源变化后需重新核对。';

/** Append-only human review; never exposed as an Agent tool or rewrite of checker facts. */
export class TaskDeliveryDomain{
 constructor(private deps:Dependencies){}
 private key(workspaceId:string,runId:string){return`task-delivery:v1:${digest([workspaceId,runId])}`;}
 private records(workspaceId:string,runId:string){return structuredClone(this.deps.store.get<TaskDeliveryRecord[]>(this.key(workspaceId,runId),[]));}
 private binding(snapshot:TaskDeliverySnapshot){return digest({contractHash:snapshot.contract.contractHash,report:snapshot.report,firstReportAt:snapshot.firstReportAt,optionalCriterionIds:snapshot.optionalCriterionIds??[],sources:snapshot.sources??snapshot.report.sources,sourceVersionReasons:snapshot.sourceVersionReasons??[]});}
 private async load(runId:string,reportId?:string){this.deps.guard?.(false);const snapshot=structuredClone(await this.deps.snapshot(runId,reportId));this.deps.guard?.(false);if(snapshot.contract.runId!==runId||snapshot.report.runId!==runId||snapshot.report.workspaceId!==snapshot.contract.workspaceId||snapshot.report.contractHash!==snapshot.contract.contractHash||snapshot.report.contractRevision!==snapshot.contract.revision)throw Error('TASK_DELIVERY_BINDING_STALE');
  const sources=new Map<string,WorkflowSourceReceipt>();for(const source of [...snapshot.report.sources,...snapshot.sources??[]])sources.set(taskDeliverySourceKey(source),source);snapshot.sources=[...sources.values()];snapshot.sourceVersionReasons=unique(snapshot.sourceVersionReasons??[]);
  for(const source of snapshot.sources){try{if(!this.deps.readSourceHash)throw Error('SOURCE_READER_UNAVAILABLE');if(await this.deps.readSourceHash(source)!==source.contentHash)throw Error('SOURCE_CHANGED');this.deps.guard?.(false);}catch{this.deps.guard?.(false);snapshot.sourceVersionReasons.push('业务资料 '+source.path+' 当前无法核对或版本已变化');}}
  return snapshot;
 }
 async get(runId:string,reportId?:string):Promise<TaskDeliveryView>{return this.view(await this.load(runId,reportId));}
 private view(snapshot:TaskDeliverySnapshot):TaskDeliveryView{
  const {contract,report}=snapshot,bindingHash=this.binding(snapshot),items:TaskDeliveryItem[]=[],sources=snapshot.sources??report.sources,sourceKeys=unique(sources.map(taskDeliverySourceKey)),outputIds=unique(report.targets.map(output=>output.id)),requestIds=unique(contract.requests.map(request=>request.id));
  const add=(value:Omit<TaskDeliveryItem,'requiredEvidence'>,requiredEvidence:TaskDeliveryItem['requiredEvidence']={requestIds:[],outputIds:[],sourceKeys:[]})=>items.push({...value,requiredEvidence});
  if(report.versionState!=='current'||report.contractHash!==contract.contractHash)add({id:'version',label:'当前成果与资料版本',detail:report.versionReasons.join('；')||'成果、来源或检查证据已变化/不可读取',kind:'version',critical:true,status:'blocked',allowedActions:[]});
  if(snapshot.sourceVersionReasons?.length)add({id:'source-version',label:'当前业务来源版本',detail:snapshot.sourceVersionReasons.join('；'),kind:'version',critical:true,status:'blocked',allowedActions:[]});
  const missingSourceIds=unique((report.contentReview?.sources??[]).map(source=>source.id).filter(id=>!sourceKeys.includes(id)));
  if(missingSourceIds.length)add({id:'source-binding',label:'内容审查来源绑定',detail:'内容审查引用的实际资料未完整绑定本次任务，不能处置意见或交付',kind:'version',critical:true,status:'blocked',allowedActions:[]});
  if((report.automaticStatus??report.status)==='failed')add({id:'automatic-failed',label:'自动检查未通过',detail:'已有明确失败的自动检查；请修正后按同一要求重新验证',kind:'automatic',critical:true,status:'blocked',allowedActions:[]});
  const optional=(criterionId:string)=>(snapshot.optionalCriterionIds??[]).includes(criterionId);
  const outcome=(result:TaskCheckResult,regression=false)=>{
   const criterion=contract.criteria.find(value=>value.id===result.criterionId),human=criterion?.checker.kind==='human_review'&&result.status==='needs_human'&&!regression;
   const critical=regression||result.criterionId.startsWith('host:')||!optional(result.criterionId),status=result.status==='passed'?'passed':result.status==='failed'?'blocked':human?'needs_review':critical?'blocked':'unknown';
   add({id:(regression?'regression:':'criterion:')+digest([result.criterionId,result.outputId,result.baselineId??'']),label:criterion?.text??(regression?'原有关键交互回归':'具体自动检查'),detail:result.reason,kind:regression?'regression':human?'human_criterion':'automatic',critical:result.status==='failed'||critical,status,allowedActions:human?['confirm']:status==='unknown'?['accept_limit']:[]},{requestIds:criterion?.requestIds??[],outputIds:[result.outputId],sourceKeys:[]});
  };
  report.results.forEach(result=>outcome(result));report.regression.forEach(result=>outcome(result,true));
  if(contract.scope==='deliverable'&&!report.targets.length)add({id:'outputs',label:'任务成果',detail:'约定交付任务还没有可核对成果',kind:'automatic',critical:true,status:'blocked',allowedActions:[]});
  for(const request of contract.requests)if(contract.scope==='deliverable')add({id:'business:'+request.id,label:'核对用户要求',detail:request.text,kind:'business',critical:true,status:'needs_review',allowedActions:['confirm']},{requestIds:[request.id],outputIds,sourceKeys});
  for(const source of sources)add({id:'source:'+taskDeliverySourceKey(source),label:'核对资料与业务依据',detail:source.path+(source.truncated?'（自动读取为部分正文；人工须核对本次相关完整内容）':''),kind:'source',critical:true,status:'needs_review',allowedActions:['confirm']},{requestIds:[],outputIds:[],sourceKeys:[taskDeliverySourceKey(source)]});
  for(const assumption of contract.prd.assumptions)add({id:'assumption:'+assumption.id,label:'核对业务假设',detail:assumption.text,kind:'assumption',critical:true,status:'needs_review',allowedActions:['confirm']},{requestIds,outputIds,sourceKeys});
  if(report.contentReviewRequired)add({id:'review:content',label:'核对完整业务内容',detail:'独立内容审查保持为约定项；人工替代核对须覆盖全部用户要求、成果与本次业务资料，并记录具体依据。',kind:'content_review',critical:true,status:'needs_review',allowedActions:['confirm']},{requestIds,outputIds,sourceKeys});
  for(const finding of report.contentReview?.findings??[]){const missing=finding.sourceBindings.some(binding=>!sourceKeys.includes(binding.id));add({id:'content-finding:'+finding.id,label:'核对内容审查候选',detail:missing?'候选意见的来源身份无法核对，不能用无来源处置绕过交付':finding.explanation,kind:'content_finding',critical:true,status:missing?'blocked':'needs_review',allowedActions:missing?[]:['dismiss'],originalEvidence:[...finding.artifactBindings.map(binding=>({...binding,kind:'output' as const})),...finding.sourceBindings.map(binding=>({...binding,kind:'source' as const})),...finding.requestBindings.map(binding=>({...binding,kind:'request' as const}))].map(binding=>({kind:binding.kind,id:binding.id,sha256:binding.sha256,quote:binding.quote,locator:binding.locator??`第${binding.startLine}行`}))},{requestIds:unique(finding.requestBindings.map(binding=>binding.id)),outputIds:unique(finding.artifactBindings.map(binding=>binding.id)),sourceKeys:unique(finding.sourceBindings.map(binding=>binding.id))});}
  if(report.visualReviewRequired&&!report.targets.some(output=>output.kind==='html'))add({id:'visual-target',label:'视觉核对成果',detail:'约定视觉核对缺少已绑定页面成果，不能接受限制后交付',kind:'visual_review',critical:true,status:'blocked',allowedActions:[]});
  if(report.visualReviewRequired||report.targets.some(output=>output.kind==='html'))for(const output of report.targets.filter(value=>value.kind==='html'))add({id:'visual:'+output.id,label:'核对实际页面与视觉体验',detail:output.target.path+'：核对约定的页面、交互与视口；DOM断言及模型截图意见不能替代完整人工核对。',kind:'visual_review',critical:true,status:'needs_review',allowedActions:['confirm']},{requestIds,outputIds:[output.id],sourceKeys:[]});
  for(const finding of report.visualReview?.findings??[])add({id:'visual-finding:'+finding.id,label:'核对视觉审查候选',detail:finding.explanation,kind:'visual_finding',critical:true,status:'needs_review',allowedActions:['dismiss'],originalEvidence:[{kind:'screenshot',id:finding.screenshotId,sha256:finding.screenshotHash,quote:finding.explanation,locator:`${finding.viewport.width}x${finding.viewport.height}; ${JSON.stringify(finding.region)}`}]},{requestIds,outputIds:[finding.outputId],sourceKeys:[]});
  const records=this.records(contract.workspaceId,contract.runId).filter(record=>record.bindingHash===bindingHash&&record.reportId===report.id&&record.contractHash===contract.contractHash),decisions=new Map<string,TaskDeliveryDecision>();
  for(const record of records)for(const decision of record.decisions)decisions.set(decision.itemId,decision);
  for(const item of items){const decision=decisions.get(item.id);if(decision&&item.allowedActions.includes(decision.action)){item.decision=decision;item.status=decision.action==='accept_limit'?'unknown':'passed';}}
  const blocked=items.some(item=>item.status==='blocked'),unresolved=items.some(item=>item.status==='needs_review'||item.status==='unknown'&&!item.decision),limitations=items.filter(item=>!item.critical&&item.status==='unknown').map(item=>({id:item.id,detail:item.detail,accepted:item.decision?.action==='accept_limit'}));
  const status=blocked?'blocked':contract.scope==='conversation'&&!report.targets.length?'not_applicable':unresolved?'needs_review':limitations.length?'accepted_with_limits':'verified';
  return{schemaVersion:1,runId:contract.runId,workspaceId:contract.workspaceId,reportId:report.id,contractHash:contract.contractHash,bindingHash,status,allowed:status==='verified'||status==='accepted_with_limits'||status==='not_applicable',items,recordIds:records.map(record=>record.id),limitations,notice:NOTICE};
 }
 async review(input:TaskDeliveryReviewInput){
  const parsed=taskDeliveryReviewSchema.parse(input),snapshot=await this.load(parsed.runId,parsed.reportId),before=this.view(snapshot);
  if(before.bindingHash!==parsed.expectedBindingHash||snapshot.report.versionState!=='current'||snapshot.sourceVersionReasons?.length)throw Error('TASK_DELIVERY_BINDING_STALE');
  if(new Set(parsed.decisions.map(decision=>decision.itemId)).size!==parsed.decisions.length)throw Error('TASK_DELIVERY_DUPLICATE_DECISION');
  const validRequestIds=new Set(snapshot.contract.requests.map(request=>request.id)),validOutputIds=new Set(snapshot.report.targets.map(output=>output.id)),validSourceKeys=new Set((snapshot.sources??snapshot.report.sources).map(taskDeliverySourceKey));
  for(const decision of parsed.decisions){const item=before.items.find(value=>value.id===decision.itemId);if(!item||!item.allowedActions.includes(decision.action))throw Error('TASK_DELIVERY_DECISION_DENIED: 明确失败与关键未验证项不能豁免');
   const evidence=decision.evidence;
   if(evidence.requestIds.some(id=>!validRequestIds.has(id))||evidence.outputIds.some(id=>!validOutputIds.has(id))||evidence.sourceKeys.some(id=>!validSourceKeys.has(id))||item.requiredEvidence.requestIds.some(id=>!evidence.requestIds.includes(id))||item.requiredEvidence.outputIds.some(id=>!evidence.outputIds.includes(id))||item.requiredEvidence.sourceKeys.some(id=>!evidence.sourceKeys.includes(id)))throw Error('TASK_DELIVERY_REVIEW_COVERAGE_INCOMPLETE: 人工核对依据未覆盖本项绑定的要求、成果或资料');
   if((item.originalEvidence??[]).some(citation=>!evidence.citations.some(actual=>digest(actual)===digest(citation)))||evidence.citations.some(actual=>!(item.originalEvidence??[]).some(citation=>digest(actual)===digest(citation))))throw Error('TASK_DELIVERY_REVIEW_CITATION_MISMATCH: 候选处置必须保留此报告的原文或截图依据');
  }
  const current=await this.load(parsed.runId,parsed.reportId);if(this.binding(current)!==before.bindingHash)throw Error('TASK_DELIVERY_BINDING_STALE');this.deps.guard?.(true);
  const now=this.deps.now?.()??new Date().toISOString(),record:TaskDeliveryRecord={schemaVersion:1,id:randomUUID(),workspaceId:snapshot.contract.workspaceId,runId:parsed.runId,reportId:parsed.reportId,contractHash:snapshot.contract.contractHash,bindingHash:before.bindingHash,actor:'user',recordedAt:now,decisions:parsed.decisions.map(decision=>({...decision,id:randomUUID(),actor:'user',recordedAt:now}))};
  const records=this.records(record.workspaceId,record.runId);if(records.length>=1000)throw Error('TASK_DELIVERY_HISTORY_LIMIT');records.push(record);this.deps.store.set(this.key(record.workspaceId,record.runId),records);return this.view(current);
 }
 async assertAllowed(runId:string,reportId?:string,expectedBindingHash?:string){const view=await this.get(runId,reportId);if(expectedBindingHash&&view.bindingHash!==expectedBindingHash)throw Error('TASK_DELIVERY_BINDING_STALE');if(!view.allowed)throw Error('TASK_DELIVERY_BLOCKED: '+view.items.filter(item=>item.status!=='passed'&&!(item.status==='unknown'&&item.decision)).map(item=>item.detail).slice(0,5).join('；'));return view;}
}
