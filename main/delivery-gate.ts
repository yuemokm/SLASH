import {createHash} from 'node:crypto';
import type {Connection,DeliveryChecklist,DeliveryPreflight,DeliveryPreflightCheck,DocumentDeliveryInput,ExternalActionProposal,QualityReport,State} from '../shared/types.js';
import {Store} from './store.js';
import type {Files} from './files.js';
import {QUALITY_CHECKER_VERSION,qualityCheckForArtifact,evaluateQualityGate} from './quality.js';
import {ProductRecordsRepository,productRecordsWorkspaceIdentity} from './product-records.js';
import {requirementRelatedToPath,activeBusinessConstraints,readBusinessText,boundedBusinessReader,checkBusinessConstraint,type BusinessProvenanceResolver} from './business-rules.js';
import {createProcessingProvenanceResolver} from './processing-provenance.js';

type GateInput=Omit<DocumentDeliveryInput,'kind'> & {connectionId:string};
type GateDeps={
 store:Store;
 files:Files;
 workspace:()=>{root:string;connections:Connection[]};
 actions:()=>ExternalActionProposal[];
 records:()=>ReturnType<ProductRecordsRepository['snapshot']>|undefined;
 preferences:()=>{qualityGateEnabled?:boolean;forceQualityCheckBeforeDelivery?:boolean};
 businessProvenance?:()=>BusinessProvenanceResolver;
 prototypeAcceptance?:(mountId:string,path:string)=>Promise<{required:boolean;passed:boolean;detail:string}>;
};

/** One deterministic gate shared by preflight, approval and every executor. */
export class DeliveryGate {
 constructor(private readonly deps:GateDeps){}
 private key(input:GateInput){
  const root=this.deps.workspace().root;
  const identity=[root,input.mountId,input.path,input.sourceHash,input.connectionId,input.provider,input.remoteId??'',input.title].join('\u0000');
  return `delivery-checklist:${createHash('sha256').update(identity).digest('hex')}`;
 }
 private checklist(input:GateInput):DeliveryChecklist{
  const identity=this.key(input);const value=this.deps.store.get<DeliveryChecklist|null>(identity,null);
  return value&&value.identity===identity?value:{identity,contentReviewed:false,destinationConfirmed:false};
 }
 private saveChecklist(input:GateInput,patch?:Partial<Pick<DeliveryChecklist,'contentReviewed'|'destinationConfirmed'>>){
  const current=this.checklist(input);const value={...current,...patch,identity:current.identity,updatedAt:new Date().toISOString()};
  this.deps.store.set(current.identity,value);return value;
 }
 async check(input:GateInput,patch?:Partial<Pick<DeliveryChecklist,'contentReviewed'|'destinationConfirmed'>>):Promise<DeliveryPreflight>{
  const checks:DeliveryPreflightCheck[]=[];const add=(id:string,label:string,status:DeliveryPreflightCheck['status'],detail:string)=>checks.push({id,label,status,detail});
  const checkedAt=new Date().toISOString();const workspace=this.deps.workspace();const connection=workspace.connections.find(item=>item.id===input.connectionId);
  if(!connection||connection.kind!=='cli'||!connection.enabled)add('connection','交付连接','blocked','请选择已启用的官方 CLI 连接');
  else if(connection.provider!==input.provider)add('connection','交付连接','blocked','连接服务商与交付服务商不一致');
  else if(connection.available===false||connection.healthStatus==='failed')add('connection','交付连接','blocked',connection.diagnostic||connection.healthSummary||'CLI 不可用');
  else if(!connection.command.trim())add('connection','交付连接','blocked','CLI 可执行文件未配置');
  else add('connection','交付连接',connection.healthStatus==='healthy'?'passed':'warning',connection.healthStatus==='healthy'?'连接健康检查通过':'连接健康状态未确认；CLI 版本信息不代表已登录');

  let source='';let currentHash='';
  try{await this.deps.files.resolve(input.mountId,input.path);source=await this.deps.files.read(input.mountId,input.path);currentHash=createHash('sha256').update(source).digest('hex');add('version','成果版本',currentHash===input.sourceHash?'passed':'blocked',currentHash===input.sourceHash?'当前文件与绑定版本一致':'文件已发生变化，请重新检查当前版本');}
  catch(error){add('version','成果版本','blocked',error instanceof Error?error.message:'成果文件无法读取');}

  let quality:QualityReport|undefined;let gate;
  if(source||currentHash){
   const kind=/\.html?$/i.test(input.path)?'prototype':/\.(drawio|xml)$/i.test(input.path)?'flow':'document';
   const raw=qualityCheckForArtifact({kind,relativePath:input.path},source);
   quality={...raw,passed:raw.valid,blockingIssues:raw.issues.filter(issue=>issue.severity==='blocking'),warnings:raw.issues.filter(issue=>issue.severity==='warning'),recommendations:[],checkedVersion:'current',contentHash:currentHash,checkerVersion:QUALITY_CHECKER_VERSION,checkedAt,inputSources:[`${input.mountId}:${input.path}`],requiresHumanConfirmation:raw.issues.some(issue=>issue.severity==='warning')};
   const qualityDisabled=this.deps.preferences().qualityGateEnabled===false||this.deps.preferences().forceQualityCheckBeforeDelivery===false;
   const zeroByte=source.length===0;
   gate=evaluateQualityGate(quality,input.sourceHash,currentHash);
   if(qualityDisabled&&!zeroByte){
    const versionConflict=Boolean(input.sourceHash&&currentHash&&input.sourceHash!==currentHash);
    const code:'VERSION_CONFLICT'|'QUALITY_PASSED'=versionConflict?'VERSION_CONFLICT':'QUALITY_PASSED';
    gate={allowed:!versionConflict,code,reasons:versionConflict?['成果文件已在检查后发生变化，请重新检查当前版本']:[]};
   }
   add('quality','质量检查',gate.allowed?'passed':'blocked',gate.allowed?(qualityDisabled?'质量检查为可选项，已完成版本安全校验':quality.summary):gate.reasons.join('；'));
  }

  const records=this.deps.records();const artifact=records?.artifacts.find(item=>item.mountId===input.mountId&&item.relativePath===input.path);
  const reviewBlocked=Boolean(artifact&&records?.reviews.some(review=>review.artifactId===artifact.id&&review.issues.some(issue=>['open','needs_clarification'].includes(issue.status))));
  add('reviews','评审问题',reviewBlocked?'blocked':'passed',reviewBlocked?'存在未解决评审问题':'没有发现当前成果的未解决评审问题');
  // Scope requirement blockers to the artifact being delivered. An open
  // question in another product area must not prevent an otherwise ready
  // document from shipping. Direct source references and design-package
  // membership are both deterministic relations; unlinked requirements are
  // surfaced as informational rather than treated as blockers.
  const relatedRequirementIds=new Set<string>();
  if(records){
   for(const requirement of records.requirements)if(requirementRelatedToPath(requirement,input.mountId,input.path))relatedRequirementIds.add(requirement.id);
   if(artifact)for(const pack of records.designPackages)if(pack.artifactIds.includes(artifact.id))for(const id of pack.requirementIds)relatedRequirementIds.add(id);
  }
  const relatedRequirements=records?.requirements.filter(item=>relatedRequirementIds.has(item.id))??[];
  const reqBlocked=relatedRequirements.some(req=>req.pendingQuestions.some(question=>question.status==='open'));
  add('requirements','待确认需求',reqBlocked?'blocked':'passed',reqBlocked?'当前成果关联需求存在未回答问题':relatedRequirements.length?'当前成果关联需求没有未回答问题':'没有找到与当前成果关联的需求问题');
  const candidates=relatedRequirements.flatMap(requirement=>activeBusinessConstraints(requirement.businessConstraints??[]).map(constraint=>({requirement,constraint})));
  if(candidates.length){const provenance=this.deps.businessProvenance?.()??createProcessingProvenanceResolver({files:this.deps.files,store:this.deps.store,root:workspace.root,workspaceId:productRecordsWorkspaceIdentity(workspace.root).workspaceId,changes:()=>this.deps.store.get<Partial<State>>('state',{}).root===workspace.root?this.deps.store.get<Partial<State>>('state',{}).changes??[]:[],assertCurrent:()=>{if(this.deps.workspace().root!==workspace.root)throw Error('VERSION_CONFLICT: 交付来源核对期间项目已变化');if(this.deps.store.get<Partial<State>>('state',{}).permissions?.workspace_read==='deny')throw Error('PERMISSION_DENIED: 资料读取已禁用');}}),read=boundedBusinessReader((mountId,path)=>readBusinessText(this.deps.files,mountId,path)),checks=[];for(const {requirement,constraint} of candidates.slice(0,200))checks.push(await checkBusinessConstraint(requirement,constraint,read,{mountId:input.mountId,path:input.path},provenance));provenance.assertCurrent?.();const pending=checks.filter(item=>item.status!=='current').length;add('business','规则落实核对','warning',`已核对${checks.length}/${candidates.length}条${candidates.length>checks.length?`，其余${candidates.length-checks.length}条尚未核对`:''}。`+(pending?`${pending}条规则的来源或落实需要复核；版本变化、未定位和缺关联不等同业务通过`:'已核对部分的来源与落实版本有效；规则含义和交互行为仍需人工核对'));}
  if(/\.html?$/i.test(input.path)&&this.deps.prototypeAcceptance){const prototype=await this.deps.prototypeAcceptance(input.mountId,input.path),enabled=this.deps.preferences().qualityGateEnabled!==false&&this.deps.preferences().forceQualityCheckBeforeDelivery!==false;add('prototype-acceptance','原型DOM验收',prototype.required&&enabled&&!prototype.passed?'blocked':prototype.passed?'passed':'warning',prototype.detail);}
  const unknown=this.deps.actions().some(item=>item.kind==='document_delivery'&&item.status==='outcome_unknown'&&item.id!==undefined&&(()=>{const request=item.request as DocumentDeliveryInput;return request.mountId===input.mountId&&request.path===input.path;})());
  add('outcome','历史交付结果',unknown?'blocked':'passed',unknown?'上一轮交付结果待核对，确认远端状态后再重试':'没有发现结果未知的历史交付');

  const checklist=patch?this.saveChecklist(input,patch):this.checklist(input);
  add('checklist','人工确认',checklist.contentReviewed&&checklist.destinationConfirmed?'passed':'blocked',checklist.contentReviewed&&checklist.destinationConfirmed?'内容与目标均已确认':'请确认内容已审阅且目标文档/空间正确');
  return{allowed:checks.every(item=>item.status!=='blocked'),sourceHash:input.sourceHash,currentHash,checkedAt,checks,checklist,quality,gate};
 }
 readChecklist(input:GateInput){return this.checklist(input);}
 updateChecklist(input:GateInput,patch:Partial<Pick<DeliveryChecklist,'contentReviewed'|'destinationConfirmed'>>){return this.saveChecklist(input,patch);}
}
