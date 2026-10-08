import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ProductRecordsRepository,productRecordsWorkspaceIdentity,type ProductRecordsKv} from '../main/product-records.js';

class MemoryKv implements ProductRecordsKv {
 private values=new Map<string,unknown>();
 get<T>(key:string,fallback:T):T{return this.values.has(key)?structuredClone(this.values.get(key)) as T:fallback;}
 set(key:string,value:unknown){this.values.set(key,structuredClone(value));}
}

function fixture(){let sequence=0,tick=0;const kv=new MemoryKv();const repository=new ProductRecordsRepository(kv,{id:()=>`id-${++sequence}`,clock:()=>new Date(Date.UTC(2026,8,21,0,0,tick++)).toISOString()});return{kv,repository};}
const hashA='a'.repeat(64),hashB='b'.repeat(64),hashC='c'.repeat(64);

test('需求卡区分来源、假设、待确认和已确认事实，并持久化状态转换',()=>{
 const {kv,repository}=fixture();
 const requirement=repository.createRequirement({workspaceId:'workspace-1',title:'高风险客户复核',summary:'高风险客户需要增加风控复核。',status:'needs_clarification',sourceRefs:[{id:'source-1',mountId:'mount-1',relativePath:'参考资料/访谈.md',contentHash:hashA,locator:'第 2 段',readAt:'2026-09-21T00:00:00.000Z'}],assumptions:[{id:'assumption-1',text:'风险等级由现有服务返回',status:'active',sourceRefIds:[]}],pendingQuestions:[{id:'question-1',question:'复核拒绝后回到哪个节点？',status:'open'}],confirmedFacts:[{id:'fact-1',text:'普通客户仍走主管审批',sourceRefIds:['source-1'],confirmedBy:'source',confirmedAt:'2026-09-21T00:00:00.000Z'}],sourceConversationIds:['conversation-1']});
 assert.throws(()=>repository.transitionRequirement(requirement.id,'confirmed',{confirmationEvidence:'产品经理确认'}),/仍有待确认问题/);
 const updated=repository.replaceRequirementEvidence(requirement.id,{sourceRefs:requirement.sourceRefs,assumptions:[{...requirement.assumptions[0],status:'accepted'}],pendingQuestions:[{id:'question-1',question:'复核拒绝后回到哪个节点？',status:'answered',answer:'退回销售补充资料'}],confirmedFacts:requirement.confirmedFacts,sourceConversationIds:requirement.sourceConversationIds});
 const confirmed=repository.transitionRequirement(requirement.id,'confirmed',{confirmationEvidence:'产品经理在 conversation-1 明确确认'});
 assert.equal(updated.assumptions[0].status,'accepted');assert.equal(confirmed.status,'confirmed');assert.match(confirmed.confirmationEvidence??'',/明确确认/);
 const reopened=repository.transitionRequirement(requirement.id,'needs_clarification');assert.equal(reopened.status,'needs_clarification');
 const restored=new ProductRecordsRepository(kv).snapshot();assert.equal(restored.requirements[0].id,requirement.id);assert.equal(restored.requirements[0].status,'needs_clarification');
 assert.throws(()=>repository.replaceRequirementEvidence(requirement.id,{...updated,sourceRefs:[],confirmedFacts:requirement.confirmedFacts}),/来源 source-1 不存在/);
 assert.throws(()=>repository.createRequirement({workspaceId:'workspace-1',title:'越权路径',summary:'无效',status:'draft',sourceRefs:[{id:'bad',mountId:'m',relativePath:'../secret.md',contentHash:hashA,readAt:'2026-09-21T00:00:00.000Z'}],assumptions:[],pendingQuestions:[],confirmedFacts:[],sourceConversationIds:[]}),/挂载内相对路径/);
});

test('成果稳定身份、确定与候选关联支持可追踪影响查询',()=>{
 const {repository}=fixture();
 const prototype=repository.createArtifact({workspaceId:'workspace-1',mountId:'prototype-mount',relativePath:'客户准入/index.html',kind:'prototype',title:'客户准入原型',currentVersionHash:hashA,sourceConversationIds:['conversation-1'],state:'active'});
 const prd=repository.createArtifact({workspaceId:'workspace-1',mountId:'output-mount',relativePath:'客户准入PRD.md',kind:'document',title:'客户准入 PRD',currentVersionHash:hashB,sourceConversationIds:['conversation-1'],state:'active'});
 const flow=repository.createArtifact({workspaceId:'workspace-1',mountId:'output-mount',relativePath:'客户准入.drawio',kind:'flow',title:'客户准入流程',currentVersionHash:hashC,sourceConversationIds:[],state:'active'});
 const confirmed=repository.createArtifactLink({workspaceId:'workspace-1',fromArtifactId:prototype.id,toArtifactId:prd.id,relation:'implements',certainty:'confirmed',locator:'page:customer-create',rationale:'原型页面实现 PRD 的准入流程'});
 const candidate=repository.createArtifactLink({workspaceId:'workspace-1',fromArtifactId:prd.id,toArtifactId:flow.id,relation:'documents',certainty:'candidate',rationale:'流程图可能需要同步高风险复核分支'});
 const impact=repository.queryImpact(prototype.id,{direction:'outgoing',includeCandidates:true});
 assert.deepEqual(impact.hits.map(hit=>[hit.artifactId,hit.depth,hit.certainty]),[[prd.id,1,'confirmed'],[flow.id,2,'candidate']]);
 assert.deepEqual(repository.queryImpact(prototype.id,{direction:'outgoing',includeCandidates:false}).hits.map(hit=>hit.artifactId),[prd.id]);
 const moved=repository.rebindArtifact(prd.id,{mountId:'archive-mount',relativePath:'交付/客户准入PRD.md'});assert.equal(moved.id,prd.id);assert.equal(moved.mountId,'archive-mount');
 assert.throws(()=>repository.createArtifact({workspaceId:'workspace-1',mountId:'archive-mount',relativePath:'交付/客户准入PRD.md',kind:'document',title:'重复路径',sourceConversationIds:[],state:'active'}),/ARTIFACT_PATH_IN_USE/);
 assert.equal(repository.setArtifactLinkCertainty(candidate.id,'confirmed').certainty,'confirmed');assert.equal(confirmed.certainty,'confirmed');
});

test('评审绑定成果哈希，问题状态转换保留定位与解决版本',()=>{
 const {repository}=fixture();
 const artifact=repository.createArtifact({workspaceId:'workspace-1',mountId:'output',relativePath:'PRD.md',kind:'document',title:'PRD',currentVersionHash:hashA,sourceConversationIds:[],state:'active'});
 assert.throws(()=>repository.createReview({workspaceId:'workspace-1',artifactId:artifact.id,artifactVersionHash:hashB,title:'错误版本评审',status:'open',issues:[]}),/VERSION_BINDING_MISMATCH/);
 const review=repository.createReview({workspaceId:'workspace-1',artifactId:artifact.id,artifactVersionHash:hashA,title:'准入方案评审',status:'open',sourceConversationId:'conversation-2',issues:[]});
 const issue=repository.addReviewIssue(review.id,{title:'退回原因缺少必填规则',description:'原型可直接退回，没有填写原因。',locator:'page:approval > button:return',basis:'PRD 4.3',impact:'无法追踪退回依据'});
 assert.throws(()=>repository.transitionReviewIssue(review.id,issue.id,'needs_clarification'),/需澄清问题/);
 const clarification=repository.transitionReviewIssue(review.id,issue.id,'needs_clarification',{clarificationQuestion:'退回原因最少多少字？'});assert.equal(clarification.status,'needs_clarification');
 assert.throws(()=>repository.completeReview(review.id),/仍有开放或待澄清问题/);
 assert.throws(()=>repository.transitionReviewIssue(review.id,issue.id,'resolved',{resolution:'增加退回原因输入框'}),/成果哈希/);
 const resolved=repository.transitionReviewIssue(review.id,issue.id,'resolved',{resolution:'增加退回原因必填和长度校验',resolvedInHash:hashB,note:'已在新版本修复'});assert.equal(resolved.status,'resolved');assert.equal(resolved.transitions.length,2);
 const completed=repository.completeReview(review.id);assert.equal(completed.status,'completed');assert.ok(completed.completedAt);
 const results=repository.listReviewIssues(artifact.id,{status:'resolved',artifactVersionHash:hashA});assert.equal(results.length,1);assert.equal(results[0].issue.locator,'page:approval > button:return');
});

test('设计包是可空的逻辑集合，成员仍受工作空间校验',()=>{
 const {repository}=fixture();
 const empty=repository.createDesignPackage({workspaceId:'workspace-1',title:'待归组成果',artifactIds:[],requirementIds:[]});assert.deepEqual(empty.artifactIds,[]);
 const artifact=repository.createArtifact({workspaceId:'workspace-1',mountId:'m',relativePath:'a.md',kind:'document',title:'A',sourceConversationIds:[],state:'active'});
 const requirement=repository.createRequirement({workspaceId:'workspace-1',title:'R',summary:'需求',status:'draft',sourceRefs:[],assumptions:[],pendingQuestions:[],confirmedFacts:[],sourceConversationIds:[]});
 const grouped=repository.updateDesignPackage(empty.id,{artifactIds:[artifact.id],requirementIds:[requirement.id]});assert.deepEqual(grouped.artifactIds,[artifact.id]);
 const foreign=repository.createArtifact({workspaceId:'workspace-2',mountId:'m',relativePath:'b.md',kind:'document',title:'B',sourceConversationIds:[],state:'active'});
 assert.throws(()=>repository.updateDesignPackage(empty.id,{artifactIds:[foreign.id]}),/ARTIFACT_NOT_FOUND/);
 const revision=repository.snapshot().revision;repository.updateDesignPackage(empty.id,{title:'正式交付包'},revision);assert.throws(()=>repository.updateDesignPackage(empty.id,{title:'旧写入'},revision),/REVISION_CONFLICT/);
});

test('canonical workspace 生成隔离的持久化 key',()=>{
 const a=productRecordsWorkspaceIdentity('E:\\workspaces\\alpha');const same=productRecordsWorkspaceIdentity(process.platform==='win32'?'e:\\WORKSPACES\\ALPHA':'E:\\workspaces\\alpha');const b=productRecordsWorkspaceIdentity('E:\\workspaces\\beta');
 assert.equal(a.key,same.key);assert.equal(a.workspaceId,same.workspaceId);assert.notEqual(a.key,b.key);
});
