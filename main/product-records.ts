import {createHash,randomUUID} from 'node:crypto';
import {z} from 'zod';
import {recordedBusinessConstraintSchema,businessImplementationRefSchema,type BusinessConstraint,type BusinessImplementationRef} from '../shared/business-rules.js';

const idSchema=z.string().trim().min(1).max(200);
const textSchema=z.string().trim().min(1).max(20_000);
const shortTextSchema=z.string().trim().min(1).max(500);
const timestampSchema=z.string().datetime({offset:true});
const hashSchema=z.string().regex(/^[a-f0-9]{64}$/i,'必须是 SHA-256');
const relativePathSchema=z.string().trim().min(1).max(32_767).refine(value=>{
 const normalized=value.replaceAll('\\','/');
 return !normalized.startsWith('/')&&!/^[A-Za-z]:/.test(normalized)&&!normalized.includes('\0')&&!normalized.split('/').some(part=>part==='..');
},'必须是挂载内相对路径');
const unique=<T>(values:T[])=>new Set(values).size===values.length;

export const sourceRefSchema=z.object({
 id:idSchema,
 mountId:idSchema,
 relativePath:relativePathSchema,
 contentHash:hashSchema,
 locator:z.string().trim().min(1).max(2_000).optional(),
 readAt:timestampSchema,
}).strict();

export const assumptionSchema=z.object({
 id:idSchema,
 text:textSchema,
 status:z.enum(['active','accepted','rejected']),
 sourceRefIds:z.array(idSchema).max(100),
}).strict();

export const pendingQuestionSchema=z.object({
 id:idSchema,
 question:textSchema,
 status:z.enum(['open','answered']),
 answer:textSchema.optional(),
}).strict().superRefine((value,ctx)=>{
 if(value.status==='answered'&&!value.answer)ctx.addIssue({code:'custom',path:['answer'],message:'已回答的问题必须保存答案'});
 if(value.status==='open'&&value.answer)ctx.addIssue({code:'custom',path:['answer'],message:'开放问题不能提前保存答案'});
});

export const confirmedFactSchema=z.object({
 id:idSchema,
 text:textSchema,
 sourceRefIds:z.array(idSchema).max(100),
 confirmedBy:z.enum(['user','source','decision']),
 confirmedAt:timestampSchema,
}).strict();

export const requirementCardSchema=z.object({
 id:idSchema,
 workspaceId:idSchema,
 title:shortTextSchema,
 summary:textSchema,
 status:z.enum(['draft','needs_clarification','confirmed','deprecated']),
 sourceRefs:z.array(sourceRefSchema).max(500),
 assumptions:z.array(assumptionSchema).max(500),
 pendingQuestions:z.array(pendingQuestionSchema).max(500),
 confirmedFacts:z.array(confirmedFactSchema).max(500),
 businessConstraints:z.array(recordedBusinessConstraintSchema).max(500).optional(),
 implementationRefs:z.array(businessImplementationRefSchema).max(2000).optional(),
 sourceConversationIds:z.array(idSchema).max(500),
 confirmationEvidence:textSchema.optional(),
 confirmedAt:timestampSchema.optional(),
 createdAt:timestampSchema,
 updatedAt:timestampSchema,
}).strict().superRefine((value,ctx)=>{
 for(const [field,items] of [['sourceRefs',value.sourceRefs],['assumptions',value.assumptions],['pendingQuestions',value.pendingQuestions],['confirmedFacts',value.confirmedFacts]] as const)if(!unique(items.map(item=>item.id)))ctx.addIssue({code:'custom',path:[field],message:'记录 ID 必须唯一'});
 if(!unique(value.sourceConversationIds))ctx.addIssue({code:'custom',path:['sourceConversationIds'],message:'来源会话不能重复'});
 const sources=new Set(value.sourceRefs.map(source=>source.id));
 const constraints=value.businessConstraints??[],bindings=value.implementationRefs??[];
 if(!unique(constraints.map(item=>item.id)))ctx.addIssue({code:'custom',path:['businessConstraints'],message:'约束ID必须唯一'});
 if(!unique(bindings.map(item=>item.id)))ctx.addIssue({code:'custom',path:['implementationRefs'],message:'落实ID必须唯一'});
 for(const binding of bindings)if(!constraints.some(item=>item.id===binding.constraintId))ctx.addIssue({code:'custom',path:['implementationRefs'],message:'落实引用的约束不存在'});
 for(const [field,items] of [['assumptions',value.assumptions],['confirmedFacts',value.confirmedFacts]] as const)for(const item of items)for(const sourceId of item.sourceRefIds)if(!sources.has(sourceId))ctx.addIssue({code:'custom',path:[field,item.id,'sourceRefIds'],message:`来源 ${sourceId} 不存在`});
 if(value.status==='confirmed'){
  if(value.pendingQuestions.some(question=>question.status==='open'))ctx.addIssue({code:'custom',path:['pendingQuestions'],message:'仍有待确认问题，不能标记为 confirmed'});
  if(!value.confirmedFacts.length)ctx.addIssue({code:'custom',path:['confirmedFacts'],message:'confirmed 至少需要一条已确认事实'});
  if(!value.confirmationEvidence||!value.confirmedAt)ctx.addIssue({code:'custom',path:['confirmationEvidence'],message:'confirmed 必须保存确认依据与时间'});
 }
});

export const artifactRecordSchema=z.object({
 id:idSchema,
 workspaceId:idSchema,
 mountId:idSchema,
 relativePath:relativePathSchema,
 kind:z.enum(['document','prototype','flow','template','knowledge','reference','other']),
 title:shortTextSchema,
 currentVersionHash:hashSchema.optional(),
 sourceConversationIds:z.array(idSchema).max(500).refine(unique,'来源会话不能重复'),
 state:z.enum(['active','missing']),
 createdAt:timestampSchema,
 updatedAt:timestampSchema,
}).strict();

export const artifactLinkSchema=z.object({
 id:idSchema,
 workspaceId:idSchema,
 fromArtifactId:idSchema,
 toArtifactId:idSchema,
 relation:z.enum(['depends_on','implements','documents','validates','references']),
 certainty:z.enum(['confirmed','candidate']),
 locator:z.string().trim().min(1).max(2_000).optional(),
 rationale:textSchema,
 sourceConversationId:idSchema.optional(),
 createdAt:timestampSchema,
 updatedAt:timestampSchema,
}).strict().refine(value=>value.fromArtifactId!==value.toArtifactId,{path:['toArtifactId'],message:'成果不能关联自身'});

export const reviewIssueStatusSchema=z.enum(['open','accepted','rejected','needs_clarification','resolved']);
export const reviewIssueTransitionSchema=z.object({
 from:reviewIssueStatusSchema,
 to:reviewIssueStatusSchema,
 at:timestampSchema,
 note:textSchema.optional(),
}).strict();
export const reviewIssueSchema=z.object({
 id:idSchema,
 title:shortTextSchema,
 description:textSchema,
 locator:z.string().trim().min(1).max(2_000),
 basis:textSchema,
 impact:textSchema,
 status:reviewIssueStatusSchema,
 clarificationQuestion:textSchema.optional(),
 resolution:textSchema.optional(),
 resolvedInHash:hashSchema.optional(),
 transitions:z.array(reviewIssueTransitionSchema).max(100),
 createdAt:timestampSchema,
 updatedAt:timestampSchema,
}).strict().superRefine((value,ctx)=>{
 if(value.status==='needs_clarification'&&!value.clarificationQuestion)ctx.addIssue({code:'custom',path:['clarificationQuestion'],message:'需澄清问题必须记录问题'});
 if(value.status==='resolved'&&(!value.resolution||!value.resolvedInHash))ctx.addIssue({code:'custom',path:['resolution'],message:'已解决问题必须记录解决说明和成果哈希'});
});

export const reviewSchema=z.object({
 id:idSchema,
 workspaceId:idSchema,
 artifactId:idSchema,
 artifactVersionHash:hashSchema,
 title:shortTextSchema,
 status:z.enum(['open','completed']),
 sourceConversationId:idSchema.optional(),
 issues:z.array(reviewIssueSchema).max(2_000).refine(items=>unique(items.map(item=>item.id)),'问题 ID 必须唯一'),
 createdAt:timestampSchema,
 updatedAt:timestampSchema,
 completedAt:timestampSchema.optional(),
}).strict().superRefine((value,ctx)=>{
 if(value.status==='completed'&&value.issues.some(issue=>['open','needs_clarification'].includes(issue.status)))ctx.addIssue({code:'custom',path:['issues'],message:'仍有开放或待澄清问题，评审不能完成'});
 if(value.status==='completed'&&!value.completedAt)ctx.addIssue({code:'custom',path:['completedAt'],message:'已完成评审必须记录完成时间'});
});

export const designPackageSchema=z.object({
 id:idSchema,
 workspaceId:idSchema,
 title:shortTextSchema,
 description:z.string().trim().max(20_000).optional(),
 artifactIds:z.array(idSchema).max(2_000).refine(unique,'成果不能重复'),
 requirementIds:z.array(idSchema).max(2_000).refine(unique,'需求不能重复'),
 createdAt:timestampSchema,
 updatedAt:timestampSchema,
}).strict();

export const productRecordsStateSchema=z.object({
 schemaVersion:z.literal(1),
 revision:z.number().int().nonnegative(),
 requirements:z.array(requirementCardSchema).max(20_000).refine(items=>unique(items.map(item=>item.id)),'需求 ID 必须唯一'),
 artifacts:z.array(artifactRecordSchema).max(50_000).refine(items=>unique(items.map(item=>item.id)),'成果 ID 必须唯一'),
 artifactLinks:z.array(artifactLinkSchema).max(100_000).refine(items=>unique(items.map(item=>item.id)),'关联 ID 必须唯一'),
 reviews:z.array(reviewSchema).max(20_000).refine(items=>unique(items.map(item=>item.id)),'评审 ID 必须唯一'),
 designPackages:z.array(designPackageSchema).max(20_000).refine(items=>unique(items.map(item=>item.id)),'设计包 ID 必须唯一'),
 updatedAt:timestampSchema,
}).strict();

export type SourceRef=z.infer<typeof sourceRefSchema>;
export type Assumption=z.infer<typeof assumptionSchema>;
export type PendingQuestion=z.infer<typeof pendingQuestionSchema>;
export type ConfirmedFact=z.infer<typeof confirmedFactSchema>;
export type RequirementCard=z.infer<typeof requirementCardSchema>;
export type ArtifactRecord=z.infer<typeof artifactRecordSchema>;
export type ArtifactLink=z.infer<typeof artifactLinkSchema>;
export type ReviewIssue=z.infer<typeof reviewIssueSchema>;
export type Review=z.infer<typeof reviewSchema>;
export type DesignPackage=z.infer<typeof designPackageSchema>;
export type ProductRecordsState=z.infer<typeof productRecordsStateSchema>;

export type ProductRecordsKv={get<T>(key:string,fallback:T):T;set(key:string,value:unknown):void};
export type RepositoryOptions={key?:string;clock?:()=>string;id?:()=>string};
export type RequirementEvidencePatch=Pick<RequirementCard,'sourceRefs'|'assumptions'|'pendingQuestions'|'confirmedFacts'|'sourceConversationIds'>;
export type ImpactQuery={direction?:'outgoing'|'incoming'|'both';includeCandidates?:boolean;maxDepth?:number};
export type ImpactHit={artifactId:string;depth:number;certainty:'confirmed'|'candidate';viaLinkIds:string[]};
export type ImpactResult={originArtifactId:string;hits:ImpactHit[];links:ArtifactLink[]};

export function productRecordsWorkspaceIdentity(canonicalRoot:string){const normalized=process.platform==='win32'?canonicalRoot.toLowerCase():canonicalRoot;const digest=createHash('sha256').update(normalized).digest('hex');return{workspaceId:`workspace:${digest}`,key:`product-records:v1:${digest}`};}

function emptyState(at:string):ProductRecordsState{return{schemaVersion:1,revision:0,requirements:[],artifacts:[],artifactLinks:[],reviews:[],designPackages:[],updatedAt:at};}
function copy<T>(value:T):T{return structuredClone(value);}
function fail(code:string,message:string):never{throw Error(`${code}: ${message}`);}

export class ProductRecordsRepository {
 private readonly key:string;
 private readonly clock:()=>string;
 private readonly makeId:()=>string;
 constructor(private readonly kv:ProductRecordsKv,options:RepositoryOptions={}){this.key=options.key??'product-records:v1';this.clock=options.clock??(()=>new Date().toISOString());this.makeId=options.id??randomUUID;this.read();}
 private read(){const raw=this.kv.get<unknown>(this.key,null);if(raw===null){const state=emptyState(this.clock());this.kv.set(this.key,state);return state;}const parsed=productRecordsStateSchema.safeParse(raw);if(!parsed.success)fail('PRODUCT_RECORDS_INVALID',parsed.error.issues.map(issue=>`${issue.path.join('.')}: ${issue.message}`).join('; '));return parsed.data;}
 private mutate<T>(expectedRevision:number|undefined,change:(state:ProductRecordsState,at:string)=>T):T{const state=this.read();if(expectedRevision!==undefined&&state.revision!==expectedRevision)fail('REVISION_CONFLICT',`期望 ${expectedRevision}，实际 ${state.revision}`);const at=this.clock();const result=change(state,at);state.revision+=1;state.updatedAt=at;const valid=productRecordsStateSchema.parse(state);this.kv.set(this.key,valid);return copy(result);}
 snapshot(){return copy(this.read());}
 appendBusinessConstraints(id:string,constraints:BusinessConstraint[],expectedRevision?:number){return this.mutate(expectedRevision,(state,at)=>{const requirement=state.requirements.find(item=>item.id===id);if(!requirement)fail('REQUIREMENT_NOT_FOUND',id);const all=[...(requirement.businessConstraints??[])];for(const constraint of constraints){if(constraint.supersedesId){const old=all.find(item=>item.id===constraint.supersedesId);if(!old||old.fieldKey!==constraint.fieldKey||old.dimension!==constraint.dimension||old.stage!==constraint.stage||all.some(item=>item.supersedesId===old.id))fail('BUSINESS_SUPERSEDES_INVALID','只能替代本需求同字段、维度、阶段的最新候选');if(old.fieldEvidence&&constraint.fieldEvidence&&JSON.stringify(old.fieldEvidence.map(item=>item.fieldAxis).sort())!==JSON.stringify(constraint.fieldEvidence.map(item=>item.fieldAxis).sort()))fail('BUSINESS_SUPERSEDES_FIELD_AXIS','不能把不同列头/字段轴替代为同一约束');}all.push(constraint);}requirement.businessConstraints=all;requirement.updatedAt=at;return requirement;});}
 appendBusinessImplementations(id:string,refs:BusinessImplementationRef[],expectedRevision?:number){return this.mutate(expectedRevision,(state,at)=>{const requirement=state.requirements.find(item=>item.id===id);if(!requirement)fail('REQUIREMENT_NOT_FOUND',id);requirement.implementationRefs=[...(requirement.implementationRefs??[]),...refs];requirement.updatedAt=at;return requirement;});}

 createRequirement(input:Omit<RequirementCard,'id'|'createdAt'|'updatedAt'>,{expectedRevision}:{expectedRevision?:number}={}):RequirementCard{return this.mutate(expectedRevision,(state,at)=>{const value=requirementCardSchema.parse({...input,id:this.makeId(),createdAt:at,updatedAt:at});state.requirements.push(value);return value;});}
 replaceRequirementEvidence(id:string,evidence:RequirementEvidencePatch,expectedRevision?:number){return this.mutate(expectedRevision,(state,at)=>{const index=state.requirements.findIndex(item=>item.id===id);if(index<0)fail('REQUIREMENT_NOT_FOUND',id);const value=requirementCardSchema.parse({...state.requirements[index],...evidence,updatedAt:at});state.requirements[index]=value;return value;});}
 transitionRequirement(id:string,to:RequirementCard['status'],details:{confirmationEvidence?:string}={},expectedRevision?:number){return this.mutate(expectedRevision,(state,at)=>{const item=state.requirements.find(value=>value.id===id);if(!item)fail('REQUIREMENT_NOT_FOUND',id);const allowed:Record<RequirementCard['status'],RequirementCard['status'][]>= {draft:['needs_clarification','confirmed','deprecated'],needs_clarification:['draft','confirmed','deprecated'],confirmed:['needs_clarification','deprecated'],deprecated:['draft']};if(item.status!==to&&!allowed[item.status].includes(to))fail('INVALID_REQUIREMENT_TRANSITION',`${item.status} -> ${to}`);const next=requirementCardSchema.parse({...item,status:to,confirmationEvidence:to==='confirmed'?details.confirmationEvidence:item.confirmationEvidence,confirmedAt:to==='confirmed'?at:item.confirmedAt,updatedAt:at});Object.assign(item,next);return item;});}
 listRequirements(workspaceId:string,status?:RequirementCard['status']){return copy(this.read().requirements.filter(item=>item.workspaceId===workspaceId&&(!status||item.status===status)));}

 createArtifact(input:Omit<ArtifactRecord,'id'|'createdAt'|'updatedAt'>,options:{expectedRevision?:number}={}):ArtifactRecord{return this.mutate(options.expectedRevision,(state,at)=>{if(state.artifacts.some(item=>item.workspaceId===input.workspaceId&&item.mountId===input.mountId&&item.relativePath.toLowerCase()===input.relativePath.toLowerCase()))fail('ARTIFACT_PATH_IN_USE',input.relativePath);const value=artifactRecordSchema.parse({...input,id:this.makeId(),createdAt:at,updatedAt:at});state.artifacts.push(value);return value;});}
 rebindArtifact(id:string,target:{mountId:string;relativePath:string},expectedRevision?:number){return this.mutate(expectedRevision,(state,at)=>{const artifact=state.artifacts.find(item=>item.id===id);if(!artifact)fail('ARTIFACT_NOT_FOUND',id);if(state.artifacts.some(item=>item.id!==id&&item.workspaceId===artifact.workspaceId&&item.mountId===target.mountId&&item.relativePath.toLowerCase()===target.relativePath.toLowerCase()))fail('ARTIFACT_PATH_IN_USE',target.relativePath);const next=artifactRecordSchema.parse({...artifact,...target,updatedAt:at});Object.assign(artifact,next);return artifact;});}
 updateArtifactVersion(id:string,currentVersionHash:string,stateValue:ArtifactRecord['state']='active',expectedRevision?:number){return this.mutate(expectedRevision,(state,at)=>{const artifact=state.artifacts.find(item=>item.id===id);if(!artifact)fail('ARTIFACT_NOT_FOUND',id);const next=artifactRecordSchema.parse({...artifact,currentVersionHash,state:stateValue,updatedAt:at});Object.assign(artifact,next);return artifact;});}
 addArtifactSourceConversation(id:string,conversationId:string,expectedRevision?:number){return this.mutate(expectedRevision,(state,at)=>{const artifact=state.artifacts.find(item=>item.id===id);if(!artifact)fail('ARTIFACT_NOT_FOUND',id);if(!artifact.sourceConversationIds.includes(conversationId))artifact.sourceConversationIds.push(conversationId);artifact.updatedAt=at;return artifactRecordSchema.parse(artifact);});}
 listArtifacts(workspaceId:string){return copy(this.read().artifacts.filter(item=>item.workspaceId===workspaceId));}

 createArtifactLink(input:Omit<ArtifactLink,'id'|'createdAt'|'updatedAt'>,options:{expectedRevision?:number}={}):ArtifactLink{return this.mutate(options.expectedRevision,(state,at)=>{const from=state.artifacts.find(item=>item.id===input.fromArtifactId),to=state.artifacts.find(item=>item.id===input.toArtifactId);if(!from||!to)fail('ARTIFACT_NOT_FOUND','关联端点不存在');if(from.workspaceId!==input.workspaceId||to.workspaceId!==input.workspaceId)fail('WORKSPACE_MISMATCH','关联端点不属于同一工作空间');if(state.artifactLinks.some(item=>item.fromArtifactId===input.fromArtifactId&&item.toArtifactId===input.toArtifactId&&item.relation===input.relation))fail('ARTIFACT_LINK_EXISTS',input.relation);const value=artifactLinkSchema.parse({...input,id:this.makeId(),createdAt:at,updatedAt:at});state.artifactLinks.push(value);return value;});}
 setArtifactLinkCertainty(id:string,certainty:ArtifactLink['certainty'],expectedRevision?:number){return this.mutate(expectedRevision,(state,at)=>{const link=state.artifactLinks.find(item=>item.id===id);if(!link)fail('ARTIFACT_LINK_NOT_FOUND',id);link.certainty=certainty;link.updatedAt=at;return artifactLinkSchema.parse(link);});}
 queryImpact(originArtifactId:string,query:ImpactQuery={}):ImpactResult{const state=this.read();const origin=state.artifacts.find(item=>item.id===originArtifactId);if(!origin)fail('ARTIFACT_NOT_FOUND',originArtifactId);const direction=query.direction??'both',maxDepth=Math.min(Math.max(query.maxDepth??5,1),20),links=state.artifactLinks.filter(link=>link.workspaceId===origin.workspaceId&&(query.includeCandidates!==false||link.certainty==='confirmed'));const queue:Array<{artifactId:string;depth:number;certainty:'confirmed'|'candidate';viaLinkIds:string[]}>= [{artifactId:originArtifactId,depth:0,certainty:'confirmed',viaLinkIds:[]}];const best=new Map<string,ImpactHit>();const used=new Set<string>();while(queue.length){const current=queue.shift()!;if(current.depth>=maxDepth)continue;for(const link of links){let next:string|undefined;if((direction==='outgoing'||direction==='both')&&link.fromArtifactId===current.artifactId)next=link.toArtifactId;else if((direction==='incoming'||direction==='both')&&link.toArtifactId===current.artifactId)next=link.fromArtifactId;if(!next||next===originArtifactId)continue;used.add(link.id);const certainty=current.certainty==='candidate'||link.certainty==='candidate'?'candidate':'confirmed';const hit={artifactId:next,depth:current.depth+1,certainty,viaLinkIds:[...current.viaLinkIds,link.id]} as ImpactHit;const previous=best.get(next);if(!previous||hit.depth<previous.depth||hit.depth===previous.depth&&previous.certainty==='candidate'&&hit.certainty==='confirmed'){best.set(next,hit);queue.push(hit);}}}return{originArtifactId,hits:[...best.values()].sort((a,b)=>a.depth-b.depth||a.artifactId.localeCompare(b.artifactId)),links:copy(links.filter(link=>used.has(link.id)))};}

 createReview(input:Omit<Review,'id'|'createdAt'|'updatedAt'|'completedAt'>,options:{expectedRevision?:number}={}):Review{return this.mutate(options.expectedRevision,(state,at)=>{const artifact=state.artifacts.find(item=>item.id===input.artifactId);if(!artifact)fail('ARTIFACT_NOT_FOUND',input.artifactId);if(artifact.workspaceId!==input.workspaceId)fail('WORKSPACE_MISMATCH','评审成果不属于工作空间');if(artifact.currentVersionHash&&artifact.currentVersionHash!==input.artifactVersionHash)fail('VERSION_BINDING_MISMATCH','评审必须绑定当前读取版本');const value=reviewSchema.parse({...input,id:this.makeId(),createdAt:at,updatedAt:at});state.reviews.push(value);return value;});}
 addReviewIssue(reviewId:string,input:Omit<ReviewIssue,'id'|'status'|'transitions'|'createdAt'|'updatedAt'>,expectedRevision?:number){return this.mutate(expectedRevision,(state,at)=>{const review=state.reviews.find(item=>item.id===reviewId);if(!review)fail('REVIEW_NOT_FOUND',reviewId);if(review.status!=='open')fail('REVIEW_COMPLETED',reviewId);const issue=reviewIssueSchema.parse({...input,id:this.makeId(),status:'open',transitions:[],createdAt:at,updatedAt:at});review.issues.push(issue);review.updatedAt=at;return issue;});}
 transitionReviewIssue(reviewId:string,issueId:string,to:ReviewIssue['status'],details:{note?:string;clarificationQuestion?:string;resolution?:string;resolvedInHash?:string}={},expectedRevision?:number){return this.mutate(expectedRevision,(state,at)=>{const review=state.reviews.find(item=>item.id===reviewId);if(!review)fail('REVIEW_NOT_FOUND',reviewId);if(review.status!=='open')fail('REVIEW_COMPLETED',reviewId);const issue=review.issues.find(item=>item.id===issueId);if(!issue)fail('REVIEW_ISSUE_NOT_FOUND',issueId);const allowed:Record<ReviewIssue['status'],ReviewIssue['status'][]>= {open:['accepted','rejected','needs_clarification','resolved'],accepted:['open','resolved'],rejected:['open'],needs_clarification:['open','accepted','rejected','resolved'],resolved:['open']};if(issue.status!==to&&!allowed[issue.status].includes(to))fail('INVALID_REVIEW_ISSUE_TRANSITION',`${issue.status} -> ${to}`);const next=reviewIssueSchema.parse({...issue,status:to,clarificationQuestion:to==='needs_clarification'?details.clarificationQuestion:issue.clarificationQuestion,resolution:to==='resolved'?details.resolution:issue.resolution,resolvedInHash:to==='resolved'?details.resolvedInHash:issue.resolvedInHash,transitions:[...issue.transitions,{from:issue.status,to,at,note:details.note}],updatedAt:at});Object.assign(issue,next);review.updatedAt=at;return issue;});}
 completeReview(reviewId:string,expectedRevision?:number){return this.mutate(expectedRevision,(state,at)=>{const review=state.reviews.find(item=>item.id===reviewId);if(!review)fail('REVIEW_NOT_FOUND',reviewId);const next=reviewSchema.parse({...review,status:'completed',completedAt:at,updatedAt:at});Object.assign(review,next);return review;});}
 listReviewIssues(artifactId:string,filter:{status?:ReviewIssue['status'];artifactVersionHash?:string}={}){return this.read().reviews.filter(review=>review.artifactId===artifactId&&(!filter.artifactVersionHash||review.artifactVersionHash===filter.artifactVersionHash)).flatMap(review=>review.issues.filter(issue=>!filter.status||issue.status===filter.status).map(issue=>({reviewId:review.id,artifactVersionHash:review.artifactVersionHash,issue:copy(issue)})));}

 createDesignPackage(input:Omit<DesignPackage,'id'|'createdAt'|'updatedAt'>,options:{expectedRevision?:number}={}):DesignPackage{return this.mutate(options.expectedRevision,(state,at)=>{this.assertPackageMembers(state,input.workspaceId,input.artifactIds,input.requirementIds);const value=designPackageSchema.parse({...input,id:this.makeId(),createdAt:at,updatedAt:at});state.designPackages.push(value);return value;});}
 updateDesignPackage(id:string,patch:Partial<Pick<DesignPackage,'title'|'description'|'artifactIds'|'requirementIds'>>,expectedRevision?:number){return this.mutate(expectedRevision,(state,at)=>{const item=state.designPackages.find(value=>value.id===id);if(!item)fail('DESIGN_PACKAGE_NOT_FOUND',id);const next=designPackageSchema.parse({...item,...patch,updatedAt:at});this.assertPackageMembers(state,next.workspaceId,next.artifactIds,next.requirementIds);Object.assign(item,next);return item;});}
 listDesignPackages(workspaceId:string){return copy(this.read().designPackages.filter(item=>item.workspaceId===workspaceId));}
 private assertPackageMembers(state:ProductRecordsState,workspaceId:string,artifactIds:string[],requirementIds:string[]){for(const id of artifactIds)if(!state.artifacts.some(item=>item.id===id&&item.workspaceId===workspaceId))fail('ARTIFACT_NOT_FOUND',id);for(const id of requirementIds)if(!state.requirements.some(item=>item.id===id&&item.workspaceId===workspaceId))fail('REQUIREMENT_NOT_FOUND',id);}
}
