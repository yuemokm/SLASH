import React from "react";
import type { Run, PmWorkflowKind, WorkflowSource } from "../shared/types";

export type { PmWorkflowKind } from "../shared/types";
export type PmWorkflowSource = WorkflowSource;
export const pmWorkflows: Record<PmWorkflowKind, { label: string; intent: string; hint: string }> = {
  prototype: { label: "交互原型", intent: "根据选定资料设计或修改 HTML 交互原型。请先明确本次范围，再实现核心操作、状态和异常反馈，保留不在修改范围内的行为。", hint: "可选需求或页面参考；描述要验证的操作与范围" },
  prd: { label: "写 / 改 PRD", intent: "读取选定的业务资料、已有 PRD 或模板，按我指定的模块生成或修改 PRD。区分真实依据、假设与待确认项，补齐字段、业务规则、异常和验收。", hint: "可选已有 PRD、模板或业务资料；说明本次修改的模块" },
  research: { label: "整理资料", intent: "整理选定资料中的用户、场景、问题、需求和矛盾。保留每项结论的来源，区分单份资料事实与跨资料归纳，列出仍需确认的问题。", hint: "选择资料或说明调研目标；保留出处与场景差异" },
  meeting: { label: "会议后整理", intent: "读取选定会议纪要、转写或笔记，整理已确认事项、未答问题和行动项。保留发言或原文依据，不猜测负责人、截止日期或未确认决定。", hint: "至少选择一份会议材料；核对决定和待办" },
  prototype_to_prd: { label: "基于原型补 PRD", intent: "读取选定的实际 HTML 原型及相关业务资料，按页面与交互补充 PRD。已体现的行为注明原型依据，未体现的后台规则、权限和异常标为待确认。", hint: "已选原型；可继续添加业务资料，界面之外的规则仍需确认" },
  change_summary: { label: "生成变更说明", intent: "对比绑定的旧版本与当前版本，根据实际文件差异生成变更说明。区分已改内容、可能影响与待核对项，列出需复核的需求、原型行为和交付材料。", hint: "已绑定同一成果的两个实际版本；可编辑说明目标与受众" },
};
export const starterActions = (["prototype", "prd", "research", "meeting"] as const).map(kind => ({ kind, ...pmWorkflows[kind] }));

export function WorkflowReceipt({ run }: { run: Run }) {
  const workflow = run.workflow;
  if (!workflow) return null;
  const readSourceCount = workflow.receipts?.filter(source => source.contentStatus !== "metadata_only").length || 0;
  const metadataSourceCount = workflow.receipts?.filter(source => source.contentStatus === "metadata_only").length || 0;
  return <details className="workflow-receipt" aria-label="任务实际来源回执">
    <summary>{pmWorkflows[workflow.kind]?.label || "产品任务"} · {workflow.receipts?.length ? `来源输入：正文 ${readSourceCount} 份 · 仅文件信息 ${metadataSourceCount} 份` : workflow.sources.length ? "来源待读取" : "未指定来源"}</summary>
    {workflow.diff && <p>实际差异：新增 {workflow.diff.added} 行 · 删除 {workflow.diff.removed} 行{workflow.diff.unchanged ? " · 两版内容相同" : ""}{workflow.diff.truncated ? " · 差异内容已截取" : ""}<br />{workflow.diff.fromHash.slice(0, 12)} → {workflow.diff.toHash.slice(0, 12)}</p>}
    {workflow.receipts?.length ? workflow.receipts.map((source, index) => <div key={`${source.mountId}:${source.path}:${source.versionId}:${index}`}>
      <b>{source.path}</b><small>版本 {source.versionId} · 哈希 {source.contentHash.slice(0, 12)} · {new Date(source.readAt).toLocaleString()}</small><small>{source.contentStatus === "metadata_only" ? `任务开始时仅核验文件信息，未预载正文（0 字符）${source.size !== undefined ? ` · ${source.size} 字节` : ""}${source.processingCopyId ? ` · 副本 ${source.processingCopyId}` : ""}；提取结果见本轮草稿或工具记录` : workflow.kind === "change_summary" && workflow.diff ? "已比较完整版本，发送差异摘要" : `已送入模型 ${source.includedCharacters} / ${source.characters} 字符${source.truncated ? " · 内容已截取，请留意资料缺口" : ""}`}</small>
    </div>) : <p>{run.error ? "来源读取或运行失败；资料选择已保留在任务中。继续前可检查权限和版本，或将任务带回输入区重新选择。" : workflow.sources.length ? workflow.sources.map(s => s.path).join("、") : "按本次意图检索已授权资料，实际读取将在运行中记录。"}</p>}
  </details>;
}
