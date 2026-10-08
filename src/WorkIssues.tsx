import React, { useState } from "react";
import type { DecisionCenterView, DecisionStatus, FileRef, Request } from "../shared/types";
import type { BusinessRuleCheckInput, BusinessRuleCheckView } from "../shared/business-rules";
import { businessPathKey } from "../shared/business-rules";
import { BusinessTrace, type BusinessTraceRequirement } from "./BusinessTrace";

export type ProductRecordsView = {
  workspaceId: string;
  revision: number;
  requirements: Array<BusinessTraceRequirement & { summary: string; status: string; sourceConversationIds?: string[]; assumptions: Array<{ id?: string; text?: string; status: string }>; pendingQuestions: Array<{ id?: string; question?: string; status: string; answer?: string }>; confirmedFacts: unknown[] }>;
  artifacts: Array<{ id: string; mountId: string; relativePath: string; title: string; kind?: string; sourceConversationIds?: string[] }>;
  reviews: Array<{ id: string; title: string; status?: string; artifactId: string; artifactVersionHash: string; sourceConversationId?: string; issues: Array<{ id: string; title: string; description: string; locator: string; basis: string; impact: string; status: string; clarificationQuestion?: string; resolution?: string; transitions?: Array<{ from: string; to: string; at: string; note?: string }> }> }>;
  artifactLinks: Array<{ id: string; fromArtifactId: string; toArtifactId: string; relation: string; certainty: string; rationale: string }>;
  designPackages: Array<{ id: string; title: string; description?: string; artifactIds: string[]; requirementIds: string[] }>;
};

const labels: Record<string, string> = { pending: "待确认", confirmed: "已确认", rejected: "已拒绝", needs_verification: "待核对", superseded: "已替代", open: "待处理", accepted: "已接受", resolved: "已解决", needs_clarification: "待澄清", draft: "草稿", deprecated: "已停用" };
const closed = (status: string) => ["confirmed", "rejected", "resolved", "superseded", "deprecated"].includes(status);

/** Contextual work list. Project history is available only after an explicit scope change. */
export function WorkIssues({ records, decisions, conversationId, artifactId, artifactFile, businessAccessKey, runIds = [], expanded = false, onContinue, onOpen, onRefresh, onDecision, onReview, onCreate, onAnswer, onBusinessCheck }: {
  records?: ProductRecordsView; decisions?: DecisionCenterView; conversationId?: string; artifactId?: string; artifactFile?: FileRef; businessAccessKey?: string; runIds?: string[];
  expanded?: boolean;
  onContinue: (text: string) => void; onOpen: (file: FileRef) => void; onRefresh: () => void;
  onDecision: (id: string, status: DecisionStatus) => void;
  onReview: (reviewId: string, issueId: string, status: "open" | "accepted" | "rejected" | "needs_clarification" | "resolved", details?: { clarificationQuestion?: string; resolution?: string; note?: string }) => Promise<boolean>;
  onCreate: (input: Extract<Request, { type: "decisionCreate" }>["decision"]) => Promise<boolean>;
  onAnswer: (requirementId: string, questionId: string, answer: string) => Promise<boolean>;
  onBusinessCheck: (input: BusinessRuleCheckInput) => Promise<BusinessRuleCheckView>;
}) {
  const [history, setHistory] = useState(false);
  const [projectHistory, setProjectHistory] = useState(false);
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [answering, setAnswering] = useState<string>();
  const [reviewAction, setReviewAction] = useState<{ reviewId: string; issueId: string; status: "needs_clarification" | "resolved"; text: string }>();
  const [reviewSaving, setReviewSaving] = useState(false);
  const artifacts = records?.artifacts || [];
  const relevantArtifacts = new Set(artifacts.filter(a => a.id === artifactId || Boolean(conversationId && a.sourceConversationIds?.includes(conversationId))).map(a => a.id));
  const currentArtifact = artifacts.find(a => a.id === artifactId);
  const currentArtifactFile = artifactFile || (currentArtifact ? { mountId: currentArtifact.mountId, path: currentArtifact.relativePath, size: 0 } : undefined);
  const boundToCurrentArtifact = (r: ProductRecordsView["requirements"][number]) => r.implementationRefs?.some(ref => Boolean(artifactId && ref.artifactId === artifactId) || Boolean(currentArtifactFile && ref.mountId === currentArtifactFile.mountId && businessPathKey(ref.path) === businessPathKey(currentArtifactFile.path)));
  const requirements = (records?.requirements || []).filter(r => projectHistory || (!conversationId && (artifactId || currentArtifactFile) ? boundToCurrentArtifact(r) : Boolean(conversationId && (r.sourceConversationIds?.includes(conversationId) || r.implementationRefs?.some(ref => ref.sourceConversationId === conversationId))) || r.implementationRefs?.some(ref => relevantArtifacts.has(ref.artifactId || "")) || r.sourceRefs.some(s => artifacts.some(a => relevantArtifacts.has(a.id) && a.mountId === s.mountId && a.relativePath === s.relativePath))));
  const requirementIds = new Set(requirements.map(r => r.id));
  const reviews = (records?.reviews || []).filter(r => projectHistory || relevantArtifacts.has(r.artifactId) || Boolean(conversationId && r.sourceConversationId === conversationId));
  const items = (decisions?.items || []).filter(item => {
    if (item.kind === "review_issue" || item.kind === "requirement_question") return false;
    if (projectHistory) return true;
    const extra = item;
    return Boolean(item.artifactId && relevantArtifacts.has(item.artifactId)) || Boolean(conversationId && (extra.conversationId === conversationId || extra.conversationIds?.includes(conversationId))) || extra.artifactIds?.some(id => relevantArtifacts.has(id)) || extra.requirementIds?.some(id => requirementIds.has(id)) || item.sourceRefs?.some(ref => (ref.kind === "conversation" && ref.id === conversationId) || (ref.kind === "run" && runIds.includes(ref.id)) || (ref.kind === "artifact" && relevantArtifacts.has(ref.id)) || (ref.kind === "requirement" && requirementIds.has(ref.id)));
  });
  const visibleItems = items.filter(i => history || !closed(i.status));
  const visibleReviews = reviews.flatMap(r => r.issues.filter(i => history || !closed(i.status)).map(i => ({ review: r, issue: i })));
  const pendingRequirements = requirements.filter(r => history || r.pendingQuestions.some(q => q.status === "open") || r.assumptions.some(a => a.status === "active") || r.status === "needs_clarification" || r.status === "draft");
  const visibleRequirements = requirements.filter(r => pendingRequirements.includes(r) || r.businessConstraints?.length || r.implementationRefs?.length);
  const count = visibleItems.length + visibleReviews.length + pendingRequirements.length;
  const Wrapper = expanded ? "div" : "details";
  return <section className={`work-issues ${count === 0 ? "quiet" : ""}`} aria-label="待确认与检查问题">
    <Wrapper>
      {!expanded && <summary>{count ? <>待确认与检查问题 <span>{count}</span></> : "工作记录与项目历史"}</summary>}
      <div className="work-issues-toolbar">
        <button className={history ? "active" : ""} onClick={() => setHistory(v => !v)}>{history ? "只看待处理" : "包含已处理"}</button>
        <button className={projectHistory ? "active" : ""} onClick={() => { setProjectHistory(v => !v); setHistory(true); }}>{projectHistory ? "返回当前工作" : "项目历史"}</button>
        <button onClick={onRefresh}>刷新</button>
        {conversationId && <button onClick={() => setAdding(v => !v)}>记录待确认</button>}
      </div>
      <small className="work-issues-scope">{projectHistory ? "当前项目历史记录" : artifactId ? "当前成果及当前会话相关记录" : "当前会话相关记录"}</small>
      {!records || !decisions ? <p className="detail-muted">正在读取记录…</p> : count === 0 && <p className="detail-muted">当前范围没有{history ? "待处理记录" : "待处理事项"}。{visibleRequirements.length ? "下方可查看已关联需求的规则与落实位置。" : "可查看项目历史，或在会话中整理资料与检查成果。"}</p>}
      {adding && <form className="work-issue-compose" onSubmit={async e => { e.preventDefault(); if (!title.trim() || !description.trim() || !conversationId) return; setSaving(true); const saved = await onCreate({ kind: "decision", title: title.trim(), description: description.trim(), sourceRefs: [{ kind: "conversation", id: conversationId, label: "当前会话" }], conversationIds: [conversationId], requirementIds: [], artifactIds: artifactId ? [artifactId] : [], impact: "待核对对当前任务与成果的影响", nextAction: "在会话中补充证据并确认" }); setSaving(false); if (saved) { setTitle(""); setDescription(""); setAdding(false); } }}>
        <input aria-label="待确认标题" placeholder="需要确认什么" value={title} maxLength={500} onChange={e => setTitle(e.target.value)} />
        <textarea aria-label="待确认说明" placeholder="已有依据、仍未知的内容" value={description} maxLength={20000} onChange={e => setDescription(e.target.value)} />
        <button type="submit" disabled={saving || !title.trim() || !description.trim()}>{saving ? "正在保存…" : "保存待确认"}</button>
      </form>}
      {visibleRequirements.map(r => <article className="work-issue" data-record-id={r.id} key={r.id}>
        <div><b>{r.title}</b><span>{labels[r.status] || r.status}</span></div><p>{r.summary}</p>
        {r.pendingQuestions.filter(q => history || q.status === "open").map((q, i) => {
          const key = `${r.id}:${q.id || i}`;
          return <div key={key} className="work-question"><p>{q.status === "answered" ? "已答复" : "待确认"}：{q.question || "读取需求记录查看问题"}{q.answer ? ` · ${q.answer}` : ""}</p>{q.id && q.status === "open" && <form onSubmit={async e => { e.preventDefault(); const answer = answers[key]?.trim(); if (!answer) return; setAnswering(key); const saved = await onAnswer(r.id, q.id!, answer); setAnswering(undefined); if (saved) setAnswers(current => ({ ...current, [key]: "" })); }}><textarea aria-label={`答复 ${q.question || q.id}`} placeholder="填写明确答复，保存后保留在需求记录中" maxLength={20000} value={answers[key] || ""} onChange={e => setAnswers(current => ({ ...current, [key]: e.target.value }))} /><button type="submit" disabled={Boolean(answering) || !answers[key]?.trim()}>{answering === key ? "正在保存…" : "保存答复"}</button></form>}</div>;
        })}
        {r.assumptions.filter(a => history || a.status === "active").map((a, i) => <p key={a.id || i}>假设：{a.text || "待核对"}</p>)}
        <BusinessTrace key={`${r.id}:${businessAccessKey || ""}:${projectHistory ? "history" : conversationId || artifactId || (currentArtifactFile ? `${currentArtifactFile.mountId}:${currentArtifactFile.path}` : "")}`} requirement={r} artifactId={projectHistory || conversationId ? undefined : artifactId} artifactFile={projectHistory || conversationId ? undefined : currentArtifactFile} revision={records?.revision || 0} onCheck={onBusinessCheck} onOpen={onOpen} onContinue={onContinue} />
        <div className="work-issue-actions">{r.sourceRefs.map((s, i) => <button key={`${s.mountId}:${s.relativePath}:${i}`} title={s.relativePath} onClick={() => onOpen({ mountId: s.mountId, path: s.relativePath, size: 0 })}>阅读来源</button>)}<button onClick={() => onContinue(`继续整理需求 ${r.id}「${r.title}」。请读取原始来源与待确认问题，根据我的补充更新证据和状态；未经确认的内容保留为假设。`)}>回会话补充</button></div>
      </article>)}
      {visibleReviews.map(({ review, issue }) => <article className="work-issue" data-record-id={issue.id} key={`${review.id}:${issue.id}`}>
        <div><b>{issue.title}</b><span>{labels[issue.status] || issue.status}</span></div><p>{issue.description}</p><small>{review.title} · {issue.locator} · 版本 {review.artifactVersionHash.slice(0, 12)}</small><p>依据：{issue.basis} · 影响：{issue.impact}</p>
        {issue.clarificationQuestion && <p>需澄清：{issue.clarificationQuestion}</p>}{issue.resolution && <p>解决说明：{issue.resolution}</p>}
        {issue.transitions?.length ? <details><summary>问题处理记录</summary>{issue.transitions.map((transition,i) => <p key={i}>{labels[transition.from] || transition.from} → {labels[transition.to] || transition.to} · {new Date(transition.at).toLocaleString()} {transition.note || ""}</p>)}</details> : null}
        <div className="work-issue-actions">
          {artifacts.filter(a => a.id === review.artifactId).map(a => <button key={a.id} onClick={() => onOpen({ mountId: a.mountId, path: a.relativePath, size: 0 })}>阅读问题所在成果</button>)}
          <button onClick={() => onContinue(`处理检查问题 ${issue.id}（评审 ${review.id}）：${issue.title}。版本 ${review.artifactVersionHash}，位置 ${issue.locator}。请先读取实际成果与依据，再按我的要求修改；完成后核对检查状态。`)}>回会话修改</button>
          {review.status !== "completed" && <>
            {["open", "needs_clarification"].includes(issue.status) && <button onClick={() => void onReview(review.id, issue.id, "accepted")}>接受意见</button>}
            {issue.status === "open" && <button onClick={() => setReviewAction({ reviewId: review.id, issueId: issue.id, status: "needs_clarification", text: "" })}>需要澄清</button>}
            {!closed(issue.status) && <button onClick={() => setReviewAction({ reviewId: review.id, issueId: issue.id, status: "resolved", text: "" })}>标记已解决</button>}
            {["open", "needs_clarification"].includes(issue.status) && <button onClick={() => void onReview(review.id, issue.id, "rejected")}>拒绝意见</button>}
            {issue.status !== "open" && <button onClick={() => void onReview(review.id, issue.id, "open")}>重新打开问题</button>}
          </>}
        </div>
        {reviewAction?.reviewId === review.id && reviewAction.issueId === issue.id && <form className="work-question" onSubmit={async e => { e.preventDefault(); if (!reviewAction.text.trim() || reviewSaving) return; setReviewSaving(true); const saved = await onReview(review.id, issue.id, reviewAction.status, reviewAction.status === "resolved" ? { resolution: reviewAction.text.trim() } : { clarificationQuestion: reviewAction.text.trim() }); setReviewSaving(false); if (saved) setReviewAction(undefined); }}>
          <textarea aria-label={reviewAction.status === "resolved" ? "检查问题解决说明" : "检查问题澄清内容"} placeholder={reviewAction.status === "resolved" ? "说明已修复的内容与核对结果" : "写下需要澄清的具体问题"} maxLength={10000} value={reviewAction.text} onChange={e => setReviewAction(current => current ? { ...current, text: e.target.value } : current)} />
          <div className="work-issue-actions"><button type="submit" disabled={reviewSaving || !reviewAction.text.trim()}>{reviewSaving ? "正在保存…" : "保存处理说明"}</button><button type="button" onClick={() => setReviewAction(undefined)}>取消</button></div>
        </form>}
      </article>)}
      {visibleItems.map(item => {
        const extra = item;
        return <article className="work-issue" data-record-id={item.recordId || item.id} key={item.id}><div><b>{item.title}</b><span>{labels[item.status] || item.status}</span></div><p>{item.description}</p>{item.impact && <small>影响：{item.impact}</small>}{item.nextAction && <p>{item.nextAction}</p>}<small>来源：{item.sourceRefs?.map(s => s.label || s.id).join("、") || item.sourceId}</small>
          {extra.history?.length ? <details><summary>处理记录</summary>{extra.history.map((h, i) => <p key={i}>{labels[h.from] || h.from} → {labels[h.to] || h.to} · {new Date(h.at).toLocaleString()} {h.actor || ""} {h.note || ""}</p>)}</details> : null}
          <div className="work-issue-actions">{artifacts.filter(a => item.artifactIds?.includes(a.id)).map(a => <button key={a.id} onClick={() => onOpen({ mountId: a.mountId, path: a.relativePath, size: 0 })}>阅读关联成果</button>)}<button onClick={() => onContinue(`继续处理记录 ${item.recordId || item.sourceId}「${item.title}」。当前状态 ${item.status}。先核对来源、影响和历史，再根据我的补充推进。${item.kind === "external_action" ? "外部结果未知时先核对真实回执，不重复发布。" : ""}`)}>回会话处理</button>{item.recordId && <><button disabled={item.status === "confirmed"} onClick={() => onDecision(item.recordId!, "confirmed")}>确认</button><button disabled={item.status === "needs_verification"} onClick={() => onDecision(item.recordId!, "needs_verification")}>待核对</button><button disabled={item.status === "rejected"} onClick={() => onDecision(item.recordId!, "rejected")}>否决</button><button disabled={item.status === "superseded"} onClick={() => onDecision(item.recordId!, "superseded")}>标记已替代</button></>}</div>
        </article>;
      })}
    </Wrapper>
  </section>;
}
