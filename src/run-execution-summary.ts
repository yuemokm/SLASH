import type {Run} from '../shared/types';

const phaseLabels:Record<string,string>={queued:'排队等待',preparing_context:'准备任务资料',starting_model:'连接模型',generating:'正在生成回复',tool_call:'正在执行工具',waiting_approval:'等待授权确认',waiting_plan:'等待确认方案',validating:'正在检查成果',cancelling:'正在停止任务',completed:'任务已完成',cancelled:'任务已取消',interrupted:'任务已中断',failed:'执行失败'};
const statusLabels:Record<string,string>={queued:'排队等待',running:'正在处理任务',waiting_user:'等待授权确认',awaiting_plan:'等待确认方案',validating:'正在检查成果',cancelling:'正在停止任务',cancelled:'任务已取消',interrupted:'任务已中断',succeeded:'任务已完成',failed:'执行失败'};

/** Only actual host state and persisted receipts determine visibility and the summary. */
export function runExecutionSummary(run:Run,{active=false,pendingChanges=0,hasTools=false}:{active?:boolean;pendingChanges?:number;hasTools?:boolean}={}){
 const needsAction=Boolean(run.error||run.resumable||run.proposal?.status==='pending'||run.piPlanReview?.status==='awaiting_user'||['waiting_user','awaiting_plan','interrupted','failed'].includes(run.status));
 const visible=active||needsAction||['queued','running','validating','cancelling','cancelled'].includes(run.status)||pendingChanges>0||hasTools||Boolean(run.plan?.source==='user'||run.workflow||run.sourceReads?.length||run.inputs?.length||run.piChildTasks?.length||run.imageReads?.length||run.skillLoads?.length||(run.acceptance?.outputCount??0)>0);
 // Terminal status wins over stale runtime/phase fields (e.g. retry_wait after cancellation).
 let title=statusLabels[run.status]||'任务记录';
 if(run.status==='succeeded'&&pendingChanges)title=`执行完成 · ${pendingChanges} 份草稿待应用`;
 else if(['running','queued'].includes(run.status)){
  title=phaseLabels[run.phase||run.status]||title;
  if(run.runtimeStatus?.activity==='tool')title='正在执行工具';
  if(run.runtimeStatus?.activity==='compacting')title='正在整理上下文';
  if(run.runtimeStatus?.activity==='retry_wait')title=`等待模型重试 · 第 ${run.runtimeStatus.retry?.attempt??1} 次`;
 }
 const receipts=run.workflow?.receipts.length?run.workflow.receipts:run.sourceReads??[];
 const readCount=receipts.filter(receipt=>receipt.contentStatus!=='metadata_only').length;
 const facts=[readCount?`已读取 ${readCount} 份资料`:undefined,run.piChildTasks?.length?`${run.piChildTasks.length} 个子任务`:undefined,run.attempt&&run.attempt>1?`第 ${run.attempt} 次尝试`:undefined].filter(Boolean);
 return {visible,title,detail:facts.join(' · '),needsAction};
}
