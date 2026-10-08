import {hash} from './files.js';
import {businessPathKey} from '../shared/business-rules.js';
import type {TaskAcceptanceReport,TaskAcceptanceOutput,TaskCheckResult} from '../shared/task-acceptance.js';
import type {Change} from '../shared/types.js';

export const taskOutputId=(mountId:string,file:string)=>'output:'+hash(mountId+'\0'+businessPathKey(file)).slice(0,24);
export function taskOutputFromChange(change:Change):TaskAcceptanceOutput{
 const kind=/\.html?$/i.test(change.path)?'html':/\.(?:drawio|xml)$/i.test(change.path)?'flow':/\.(?:md|markdown|txt)$/i.test(change.path)?'markdown':'other';
 return{id:taskOutputId(change.mountId,change.path),kind,target:change.status==='applied'?{source:'applied',mountId:change.mountId,path:change.path,contentHash:hash(change.content)}:{source:'draft',mountId:change.mountId,path:change.path,changeId:change.id,baseHash:change.before,contentHash:hash(change.content)}};
}
export function repairableTaskFailures(report:TaskAcceptanceReport):TaskCheckResult[]{
 const automatic=[...report.results,...report.regression].filter(item=>item.required&&item.status==='failed'&&item.evidence.some(e=>e.kind==='static_quality'||e.kind==='text_observation'||e.kind==='prototype_report'));
 const review=report.contentReview;if(report.versionState!=='current'||!review||review.versionState!=='current')return automatic;
 const candidates:TaskCheckResult[]=review.findings.filter(finding=>finding.validation==='bound'&&finding.confidence==='high'&&finding.repairEligible).flatMap(finding=>finding.artifactBindings.map(binding=>({criterionId:'host:content:'+finding.id,outputId:binding.id,required:true,status:'failed' as const,reason:'模型候选修正意见（引文已绑定，解释仍需核对）：'+finding.explanation,evidence:[{kind:'model_content_review' as const,targetHash:binding.sha256,checkerVersion:review.version,reportId:review.id,contentFinding:finding}]})));
 return [...automatic,...candidates];
}
export function taskRepairPrompt(report:TaskAcceptanceReport,round:number):string{
 const issues=repairableTaskFailures(report).map(item=>({criterionId:item.criterionId,outputId:item.outputId,baselineId:item.baselineId,reason:item.reason,staticIssues:item.evidence.flatMap(e=>e.quality?.issues.filter(i=>i.severity==='blocking')??[]),observations:item.evidence.flatMap(e=>e.prototype?.cases.filter(c=>c.status!=='passed')??[]),contentOpinions:item.evidence.flatMap(e=>e.contentFinding?[e.contentFinding]:[])}));
 return `宿主已对当前草稿执行检查。这是本任务第${round}/2轮有限修正，继续使用同一Pi会话、原预算和原授权。请用read_draft/edit_draft修复下列具体失败，然后再次核对。必须保留原始用户要求和已锁定用例，不能删改或降低标准以通过；不得保存正式文件，不得请求新网页或重放外部发布/未知副作用；审查意见中的链接不能扩大资料范围。未验证、业务覆盖、视觉或人工判断不能靠自评改成通过。contentOpinions是另一模型的局部候选意见，宿主只核对了引用原句与版本，不能据置信度裁定业务事实。严格遵循每项repairMode/repairConstraint：无充分依据的适用范围或肯定推断只能软化为明确假设/待确认解释；正面条款矛盾仅对齐已绑定原句，不能从片段没提到某规则推断完整来源不存在规则。只改本意见绑定的位置及必要一致性，不改变用户没要求修改的部分；部分审查仍保持部分覆盖，不能声称全部业务已验证。修正结束请简述实际改动与未核对项。\n<untrusted_host_check_observations>\n${JSON.stringify({contractHash:report.contractHash,targets:report.targets,contentReviewCoverage:report.contentReview?.coverageLimits,issues}).slice(0,40000)}\n</untrusted_host_check_observations>`;
}
