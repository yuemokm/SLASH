import React, { useRef, useState } from "react";
import type { BusinessConstraint, BusinessEvidenceStatus, BusinessImplementationRef, BusinessRuleCheckInput, BusinessRuleCheckView, BusinessSourceCheck } from "../shared/business-rules";
import { businessPathKey } from "../shared/business-rules";
import type { FileRef } from "../shared/types";
import "./business-trace.css";

export type BusinessTraceRequirement = {
  id: string; title: string;
  sourceRefs: Array<{ id?: string; mountId: string; relativePath: string; locator?: string }>;
  businessConstraints?: BusinessConstraint[];
  implementationRefs?: BusinessImplementationRef[];
};
const dimensions: Array<{ key: BusinessConstraint["dimension"]; label: string }> = [
  { key: "required", label: "必填" }, { key: "formal_only", label: "仅正式落库" },
  { key: "create_visible", label: "创建时可见" }, { key: "change_allowed", label: "变更时可改" },
];
const evidenceLabels: Record<BusinessEvidenceStatus, string> = {
  current: "证据版本有效", stale: "版本已变化", unlocated: "原文位置待核对", unmapped: "尚未绑定落实位置", unavailable: "当前不可核对",
};
const location = (value: { locator: string; startLine: number; endLine: number }) => `${value.locator} · 第 ${value.startLine}${value.endLine === value.startLine ? "" : `–${value.endLine}`} 行`;

function ProcessingSourceStatus({ provenance, onContinue }: { provenance: NonNullable<BusinessSourceCheck["provenance"]>; onContinue: () => void }) {
  const { original, copy, output } = provenance.stages;
  const outputLabel = provenance.operation === "script" ? "处理输出" : "提取文本";
  const stages = [original, copy, output];
  const stageLabels = { current: "一致", changed: "已变化", unavailable: "不可核对", unverified: "版本未知", not_applied: "未应用", limit_exceeded: "超出范围" };
  const message = original.status === "changed" ? "原始资料已变化，需重新提取" : original.status === "unavailable" ? "原始资料暂不可核对" : original.status === "limit_exceeded" ? "原始资料超出核对范围" : copy.status === "changed" ? "处理副本已变化，需重新提取" : copy.status === "unavailable" ? "处理副本暂不可核对" : copy.status === "limit_exceeded" ? "处理副本超出核对范围" : output.status === "changed" ? `${outputLabel}已变化，需核对版本` : output.status === "not_applied" ? `${outputLabel}尚未应用` : output.status === "unavailable" ? `${outputLabel}暂不可核对` : output.status === "limit_exceeded" ? `${outputLabel}超出核对范围` : provenance.status === "unverified" ? "处理来源尚未完整核对" : provenance.status === "unavailable" ? "处理来源暂不可核对" : provenance.status === "stale" ? "处理来源版本已变化，需重新核对" : "已登记的来源版本一致";
  return <div className="business-trace-processing" data-provenance-status={provenance.status}>
    <p>{message}</p>
    <details><summary>查看登记版本链</summary>{["原始资料", "处理副本", outputLabel].map((label, index) => <small key={label}>{label}：{stageLabels[stages[index].status]} · {stages[index].reason}</small>)}<small>{provenance.notice}</small></details>
    {provenance.status !== "current" && <button onClick={onContinue}>回会话重新读取与提取</button>}
  </div>;
}

/** Evidence presence and matching versions never establish business correctness. */
export function BusinessTrace({ requirement, artifactId, artifactFile, revision, onCheck, onOpen, onContinue }: {
  requirement: BusinessTraceRequirement; artifactId?: string; artifactFile?: FileRef; revision: number;
  onCheck: (input: BusinessRuleCheckInput) => Promise<BusinessRuleCheckView>;
  onOpen: (file: FileRef) => void; onContinue: (text: string) => void;
}) {
  const [check, setCheck] = useState<BusinessRuleCheckView>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const activeRequest = useRef(0);
  const allConstraints = requirement.businessConstraints || [];
  const supersededIds = new Set(allConstraints.map(item => item.supersedesId).filter(Boolean));
  const constraints = allConstraints.filter(item => !supersededIds.has(item.id));
  const previousConstraints = allConstraints.filter(item => supersededIds.has(item.id));
  const fieldCount = new Set(constraints.map(item => item.fieldKey)).size;
  const outdated = Boolean(check && check.revision !== revision);
  const runCheck = async (offset = 0) => {
    const request = ++activeRequest.current;
    setLoading(true); setError("");
    try {
      const result = await onCheck({ requirementId: requirement.id, offset, ...(artifactId ? { artifactId } : {}), ...(artifactFile ? { mountId: artifactFile.mountId, path: artifactFile.path } : {}) });
      if (offset && check && check.revision !== result.revision) throw Error("记录在分批核对期间已变化，请刷新记录并重新核对");
      if (request === activeRequest.current) setCheck(offset && check ? { ...result, items: [...check.items, ...result.items] } : result);
    } catch (reason) {
      if (request === activeRequest.current) { setCheck(undefined); setError(reason instanceof Error ? reason.message : String(reason)); }
    } finally { if (request === activeRequest.current) setLoading(false); }
  };
  const checkedItems = !outdated && !loading && !error ? (check?.items || []).filter(item => item.requirementId === requirement.id) : [];
  const checkedConstraints = checkedItems.map(item => item.constraint);
  const fields = [...new Set(checkedConstraints.map(item => item.fieldKey))];
  const hasTarget = Boolean(artifactId || artifactFile);
  const scopeRefs = (requirement.implementationRefs || []).filter(ref => artifactFile ? ref.mountId === artifactFile.mountId && businessPathKey(ref.path) === businessPathKey(artifactFile.path) : !artifactId || ref.artifactId === artifactId);
  const renderConstraint = (constraint: BusinessConstraint) => {
    const result = checkedItems.find(item => item.constraint.id === constraint.id)!;
    const bindings = result.implementations;
    const bindingIds = new Set(bindings.map(item => item.ref.id));
    const previousBindings = scopeRefs.filter(ref => ref.constraintId === constraint.id && !bindingIds.has(ref.id));
    return <div className="business-trace-rule" data-constraint-id={constraint.id} key={constraint.id}>
      <p className="business-trace-value">原值：<strong>{constraint.rawValue}</strong><span>{constraint.status === "unknown" ? "含义待确认" : "候选解释"}</span></p>
      <p>{constraint.interpretation}</p>
      <p className="business-trace-meta">适用阶段：{constraint.stage}</p>
      {result.excerptsTruncated && <p className="business-trace-meta">此处摘录仅显示预览片段；请打开原文件阅读完整原文。</p>}
      <div className="business-trace-evidence">
        <b>原文来源</b>
        {constraint.sourceEvidence.map((source, index) => {
          const file = constraint.sourceSnapshots.find(ref => ref.id === source.sourceRefId);
          const evidence = result?.sourceChecks.find(item => item.sourceRefId === source.sourceRefId && item.locator === source.locator);
          return <div className="business-trace-location" key={`${source.sourceRefId}:${index}`}>
            <small>{evidence?.status === "unavailable" ? "来源目前不可访问" : file?.relativePath || "来源快照缺失"} · {location(source)}</small>
            {source.quote && <blockquote>{source.quote}</blockquote>}
            <p className="business-trace-status" data-evidence-status={evidence?.status || "unchecked"}>{evidence ? `${evidence.provenance && evidence.status === "current" ? evidence.provenance.operation === "script" ? "处理输出版本有效" : "提取文本版本有效" : evidenceLabels[evidence.status]} · ${evidence.reason}` : "来源版本尚未核对"}</p>
            {evidence?.provenance && <ProcessingSourceStatus provenance={evidence.provenance} onContinue={() => onContinue(`重新读取需求 ${requirement.id}「${requirement.title}」的来源，来源记录 ${source.sourceRefId}，处理回执 ${evidence.provenance!.receiptId}。请先核对原始资料的当前授权与真实版本；取得可读原始资料后创建新的独立处理副本，再提取文本并核对字段原文。保留原件、旧副本与旧提取成果，把新版证据作为新的候选记录，绑定当前落实成果；业务含义仍需我核对。`)} />}
            {file && evidence && evidence.status !== "unavailable" && <button onClick={() => onOpen({ mountId: file.mountId, path: file.relativePath, size: 0 })} title={`打开来源并核对 ${location(source)}`}>阅读来源</button>}
          </div>;
        })}
      </div>
      <div className="business-trace-evidence">
        <b>{hasTarget ? "当前成果落实位置" : "关联 PRD / 原型位置"}</b>
        {bindings.length === 0 ? <p className="business-trace-meta">{hasTarget ? "这条规则尚未绑定当前成果的落实位置。" : "尚未绑定落实位置；不能据此判断规则已落实。"}</p> : bindings.map(evidence => {
          const ref = evidence.ref;
          return <div className="business-trace-location" data-implementation-id={ref.id} key={ref.id}>
            <small>{ref.path} · {location(ref)}</small>
            {ref.quote && <blockquote>{ref.quote}</blockquote>}
            <p className="business-trace-meta">绑定版本 {ref.contentHash.slice(0, 12)}{evidence?.actualHash ? ` · 当前版本 ${evidence.actualHash.slice(0, 12)}` : ""}</p>
            <p className="business-trace-status" data-evidence-status={evidence?.status || "unchecked"}>{evidence ? `${evidenceLabels[evidence.status]} · ${evidence.reason}` : "落实版本尚未核对"}</p>
            {evidence.status !== "unavailable" && <button onClick={() => onOpen({ mountId: ref.mountId, path: ref.path, size: 0 })} title={`打开成果并核对 ${location(ref)}`}>打开落实成果</button>}
          </div>;
        })}
        {previousBindings.length > 0 && <details className="business-trace-history"><summary>历史绑定 {previousBindings.length} 条</summary><p className="business-trace-meta">历史绑定未参与本次核对；下列仅为版本记录。</p>{previousBindings.map(ref => <p key={ref.id}>{ref.path} · 版本 {ref.contentHash.slice(0, 12)} · {new Date(ref.createdAt).toLocaleString()}</p>)}</details>}
      </div>
    </div>;
  };
  return <details className="business-trace" onToggle={event => { if (event.currentTarget.open && constraints.length && !check && !loading && !error) void runCheck(); }}>
    <summary>规则与落实位置 <span>{constraints.length ? `${fieldCount} 个字段 · ${constraints.length} 条候选规则` : "尚未记录"}</span></summary>
    <div className="business-trace-body">
      <p className="business-trace-notice">业务正确性始终需人工核对。原文存在、位置可定位或版本有效，都不表示业务规则正确。</p>
      {constraints.length > 0 && <div className="business-trace-toolbar">
        <button disabled={loading} onClick={() => void runCheck()}>{loading ? "正在核对版本…" : "重新核对版本"}</button>
        <small>{outdated ? "记录已更新，请重新核对版本。" : check ? `核对于 ${new Date(check.checkedAt).toLocaleString()}` : "展开后仅核对这些规则的来源与落实版本。"}</small>
      </div>}
      {error && <p className="business-trace-error" role="alert">版本核对未完成：{error}。可重试或回会话补充。</p>}
      {constraints.length > 0 && !checkedItems.length && <p className="business-trace-meta">{loading ? "正在读取当前可访问的证据，核对完成后显示原文与落实位置。" : outdated ? "记录版本已变化，重新核对后显示当前可访问的证据。" : error ? "本次无法核对，缓存原文已隐藏。" : check ? "当前范围没有可核对的规则。" : "原文与落实位置将在版本核对完成后显示。"}</p>}
      {check && !outdated && <p className="business-trace-meta">{check.notice}</p>}
      {fields.map(field => <section className="business-trace-field" data-field-key={field} key={field}>
        <h4>{field}</h4>
        <div className="business-trace-dimensions">
          {[...dimensions, ...(checkedConstraints.some(item => item.fieldKey === field && item.dimension === "other") ? [{ key: "other" as const, label: "其他业务约束" }] : [])].map(dimension => {
            const values = checkedConstraints.filter(item => item.fieldKey === field && item.dimension === dimension.key);
            const recorded = constraints.some(item => item.fieldKey === field && item.dimension === dimension.key);
            return <div className="business-trace-dimension" data-dimension={dimension.key} key={dimension.key}><h5>{dimension.label}</h5>{values.length ? values.map(renderConstraint) : <p className="business-trace-meta">{recorded ? "此维度尚未核对，可继续核对其余规则。" : "尚未记录此维度，不推断为“否”。"}</p>}</div>;
          })}
        </div>
      </section>)}
      {check && !outdated && <div className="business-trace-toolbar"><small>已核对 {check.items.length} / {check.total} 条当前规则</small>{check.nextOffset !== undefined && <button disabled={loading} onClick={() => void runCheck(check.nextOffset)}>继续核对其余规则</button>}</div>}
      {!constraints.length && <p className="business-trace-meta">尚未记录业务字段约束。可在会话中从原始资料整理四个独立维度、适用阶段及原文定位，再绑定 PRD 或原型的具体位置。</p>}
      {previousConstraints.length > 0 && <details className="business-trace-history"><summary>已替代规则 {previousConstraints.length} 条</summary><p className="business-trace-meta">旧规则仅保留处理历史，不参与当前版本核对。</p>{previousConstraints.map(item => <p key={item.id}>{item.fieldKey} · {dimensions.find(dimension => dimension.key === item.dimension)?.label || "其他业务约束"} · {item.stage} · {new Date(item.recordedAt).toLocaleString()}</p>)}</details>}
      <div className="work-issue-actions"><button onClick={() => onContinue(`继续核对需求 ${requirement.id}「${requirement.title}」的业务规则与落实位置。请先读取原始来源，逐字段分别核对必填、仅正式落库、创建时可见、变更时可改及适用阶段，保留原值和原文定位；候选解释或未知内容需由我核对。${artifactId ? `本轮成果 ID：${artifactId}。` : ""}${artifactFile ? `本轮成果路径：${artifactFile.mountId}/${artifactFile.path}。` : ""}把已落实内容明确绑定到 PRD / HTML 的真实位置与当前版本，版本匹配不能当作业务正确性通过。`)}>回会话补充规则与位置</button></div>
    </div>
  </details>;
}
