import {RunRuntimeStatus} from './RunRuntimeStatus';
import { Icon, FileIcon } from "./Icon";
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import "./composer-select.css";
import "./reference-picker.css";
import { DecryptedStream } from "./DecryptedStream";
import { ReplyDetails, type ReplyPanelState } from "./ReplyDetails";
import { runHistoryAnchors } from "./run-history-anchors";
import { browserTree, fileInBrowserNode, fileTreeRole, preservedBrowserDirectories } from "./project-browser";
import { ComposerModelMenu, ComposerModeMenu, ComposerPermissionMenu, ComposerPopover, type ThinkingCapability, type ThinkingLevel } from "./ComposerControls";
import { appendComposerPreset, resolveComposerIntent } from "./composer-intent";
import { planThinkingOverride } from "./composer-thinking";
import { ReferencePicker } from "./ReferencePicker";
import { WorkIssues, type ProductRecordsView } from "./WorkIssues";
import { PrototypeAcceptance } from "./PrototypeAcceptance";
import type { BusinessRuleCheckView } from "../shared/business-rules";
import "./pm-workflows.css";
import { pmWorkflows, starterActions, WorkflowReceipt, type PmWorkflowKind, type PmWorkflowSource } from "./PmWorkflows";
import type {
  AgentMode,
  Change,
  Connection,
  DecisionStatus,
  DecisionCenterView,
  DocumentContent,
  Event,
  ExternalActionProposal,
  FileRef,
  FlowPreview,
  ImpactGraphView,
  PreviewHandle,
  ProcessingCopy,
  ProjectTreeView,
  Request,
  Run,
  QualityCheckResult,
  QualityHistoryView,
  RunCheckpoint,
  State,
  TemplateWorkflowView,
  VersionSummary,
} from "../shared/types";
import { Delivery } from "./Delivery";
import { SettingsModal } from "./SettingsModal";
import type { ThemeName } from "./SettingsModal";
import { SharingPanel } from "./SharingPanel";
import { ProjectResourcesBrowser } from "./ProjectResourcesBrowser";
import type { ProjectFileRef } from "../shared/project-catalog";
import { isApprovalActionable, approvalResolutionNotice, type ApprovalResolutionResult } from "../shared/approval";
import {
  Sidebar,
  type ConversationItem,
  type ImportCategory,
  type ProjectEntry,
  type SidebarProject,
} from "./Sidebar";

type View =
  | "会话"
  | "资源"
  | "成果"
  | "规则与模板"
  | "共享文件夹";
type SelectionContext = {
  label: string;
  text: string;
  locator: string;
  version: string;
};
const capabilityLabels: Record<string, string> = {
  workspace_read: "读取工作资料",
  web_read: "访问互联网",
  connection_config: "调整连接配置",
  process_execute: "运行本机工具",
  external_action: "对外发布与操作",
  artifact_write: "修改成果文件",
};
const PROCESSING_PREVIEW_UNAVAILABLE_NOTICE = "副本已加入会话，预览暂不可用；可在会话中请求处理，原件保留。";
const folderTypeLabels: Record<string, string> = {
  md: "Markdown",
  html: "HTML",
  htm: "HTML",
  drawio: "draw.io",
  docx: "Word",
  pdf: "PDF",
  png: "图片",
  jpg: "图片",
  jpeg: "图片",
  gif: "图片",
  webp: "图片",
  svg: "SVG",
  txt: "文本",
  csv: "表格",
  json: "JSON",
  xml: "XML",
  yaml: "YAML",
  yml: "YAML",
  xlsx: "表格",
  css: "样式",
  js: "脚本",
  ts: "脚本",
  tsx: "脚本",
};

function Markdown({
  children,
  className = "markdown",
}: {
  children: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <ReactMarkdown
        skipHtml
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ children: label }) => (
            <span className="text-link">{label}</span>
          ),
          table: ({ children }) => (
            <div className="markdown-table-scroll" role="region" aria-label="表格" tabIndex={0}>
              <table>{children}</table>
            </div>
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}

function Status({ value }: { value: string }) {
  const labels: Record<string, string> = {
    queued: "排队中",
    running: "运行中",
    waiting_user: "待确认",
    awaiting_plan: "待确认方案",
    validating: "检查中",
    cancelling: "取消中",
    cancelled: "已取消",
    interrupted: "已中断",
    succeeded: "已完成",
    failed: "失败",
    preview: "仅预览",
    executing: "执行中",
    outcome_unknown: "结果待核对",
    pending: "待确认",
    approved: "已批准",
    rejected: "已拒绝",
    draft: "草稿",
    needs_clarification: "待澄清",
    confirmed: "已确认",
    deprecated: "已停用",
    open: "待处理",
    accepted: "已接受",
    resolved: "已解决",
    completed: "已完成",
    candidate: "候选影响",
    partial: "部分完成",
    conflict: "冲突",
    needs_verification: "待核对",
    superseded: "已替代",
  };
  return <span className={`status ${value}`}>{labels[value] || value}</span>;
}

const phaseLabels: Record<string, string> = {
  queued: "排队等待",
  preparing_context: "准备任务资料",
  starting_model: "启动模型",
  generating: "生成与执行",
  tool_call: "调用工具",
  waiting_approval: "等待授权",
  waiting_plan: "等待确认方案",
  validating: "检查成果",
  cancelling: "取消中",
  completed: "已完成",
  cancelled: "已取消",
  interrupted: "已中断",
  failed: "执行失败",
};

function RunPlanCard({ run, checkpoint, onResume, onEdit, onPlanDraft, onPlanConfirm, pendingChanges = 0 }: { run: Run; pendingChanges?: number; checkpoint?: RunCheckpoint; onResume?: () => void; onEdit?: () => void; onPlanDraft?: (ids:string[], text:string)=>void; onPlanConfirm?: (ids:string[], text:string)=>void }) {
  const plan = run.plan;
  const proposal = run.proposal;
  const completedOperations = checkpoint?.completedOperations.filter(operation => ["succeeded", "applied", "completed"].includes(operation.state) && operation.tool !== "read_workflow_sources") || [];
  const readSourceCount = run.workflow?.receipts.filter(receipt => receipt.contentStatus !== "metadata_only").length || 0;
  const metadataSourceCount = run.workflow?.receipts.filter(receipt => receipt.contentStatus === "metadata_only").length || 0;
  const needsAttention = Boolean(run.error) || proposal?.status === "pending" || ["waiting_user", "awaiting_plan", "interrupted", "failed"].includes(run.status);
  const phaseTitle = run.status === "succeeded" ? (pendingChanges ? "执行完成 · 草稿待应用" : "执行完成") : phaseLabels[run.phase || run.status] || "处理中";
  const [selected, setSelected] = useState<string[]>(proposal?.selectedOptionIds || []);
  const [customText, setCustomText] = useState(proposal?.customText || '');
  useEffect(()=>{if(proposal){setSelected(proposal.selectedOptionIds||[]);setCustomText(proposal.customText||'');}},[proposal?.status, proposal?.selectedOptionIds?.join(','), proposal?.customText]);
  return (
    <article className={`run-plan-card ${needsAttention ? "needs-attention" : ""} ${run.status === "failed" || run.error ? "has-error" : ""}`}>
      <div className="run-plan-head">
        <div>
          <b>{phaseTitle}</b>
        </div>

      </div>
      <details className="run-execution-details">
      <summary>执行记录{completedOperations.length ? ` · ${completedOperations.length} 次工具操作` : ""}{run.workflow?.receipts.length ? ` · 来源输入：正文 ${readSourceCount} 份 · 仅文件信息 ${metadataSourceCount} 份` : ""}</summary>
      <ol className="run-actual-progress" aria-label="实际执行记录">
        {(run.runtimeStatus||Boolean(run.inputs?.length))&&<li><RunRuntimeStatus run={run} active={false} onClear={()=>{}}/></li>}
        {run.skillDiscovery && <li><span>已发现 {run.skillDiscovery.skills.length} 个有效项目技能；实际加载 {run.skillLoads?.length || 0} 次。发现列表不代表已读取正文。</span></li>}
        {run.imageReads?.map((image,index)=><li className="done" key={`${image.contentHash}-${index}`}><span>已读取{image.source === 'prototype_screenshot' ? '验收截图' : '图片'}：{image.path} · {image.width}×{image.height}{image.viewport ? ` · CSS视口 ${image.viewport.width}×${image.viewport.height}` : ''}{image.caseId ? ` · 用例 ${image.caseId}` : ''}{image.versionState === 'stale' ? ' · 历史版本，当前成果已变化' : ''}<small>图片哈希：{image.contentHash}{image.entryHash ? ` · 成果哈希：${image.entryHash}` : ''}</small></span></li>)}
        {run.skillLoads?.map((skill,index)=><li className="done" key={`${skill.name}-${index}`}><span>已读取技能 {skill.name} · {skill.path} · {skill.characters} 字符 · {skill.invocation === 'command' ? '用户指定' : '按需加载'}<small>读取时间：{new Date(skill.readAt).toLocaleString()} · 内容哈希：{skill.contentHash}</small></span></li>)}
        {readSourceCount > 0 && <li className="done"><span>输入时已读取 {readSourceCount} 份来源正文，版本见回执</span></li>}
        {metadataSourceCount > 0 && <li className="done"><span>仅核验 {metadataSourceCount} 份副本信息，任务开始时未预载正文；提取结果见本轮草稿或工具记录</span></li>}
        {completedOperations.map(operation => <li className="done" key={operation.id}><span>{({ write_draft: "已生成修改草稿", read_file: "已读取文件", search_files: "已检索授权资料", apply_change: "已应用修改", check_quality: "已执行成果检查", quality_check: "已执行成果检查" } as Record<string,string>)[operation.tool] || `已执行工具：${operation.tool}`}</span></li>)}
        {checkpoint?.assistantText && <li className="done"><span>已输出回复内容</span></li>}
        {!run.workflow?.receipts.length && !checkpoint?.completedOperations.some(operation => ["succeeded", "applied", "completed"].includes(operation.state)) && !checkpoint?.assistantText && <li><span>{run.status === "succeeded" ? "任务运行已结束，可核对回复与成果" : "读取来源与工具调用后，执行记录会在这里更新"}</span></li>}
      </ol>
      {run.skillDiscovery && <details><summary>项目技能与发现问题</summary><ul>{run.skillDiscovery.skills.map(skill=><li key={`${skill.mountId}-${skill.path}`}><b>{skill.name}</b>：{skill.description} · {skill.path}{skill.disableModelInvocation ? '（仅用户显式加载）' : ''}</li>)}{run.skillDiscovery.diagnostics.map((issue,index)=><li key={index}><span>{issue.path || '技能目录'}：{issue.message}（{issue.code}）</span></li>)}</ul></details>}
      <small>第 {run.attempt || 1} 次尝试 · 最近更新 {run.updatedAt ? new Date(run.updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "刚刚"}{run.resumable ? " · 可继续" : ""}</small>
      </details>
      {plan && <details className="run-intended-plan"><summary>查看任务计划</summary><ol>{plan.steps.map((step, index) => <li key={`${run.id}-plan-${index}`}><span>{step}</span></li>)}</ol><small>实际完成情况见执行记录、检查结果和版本回执。</small></details>}
      {run.mode === "plan" && proposal && (
        <div className="plan-proposal">
          <p className="plan-summary">{proposal.summary}</p>
          {proposal.options.map(option => <label className="plan-option" key={option.id}><input type="checkbox" checked={selected.includes(option.id)} disabled={proposal.status !== "pending"} onChange={e=>{const next=e.target.checked?[...selected,option.id]:selected.filter(id=>id!==option.id);setSelected(next);onPlanDraft?.(next,customText)}}/><span><b>{option.title}</b>{option.steps.length>0&&<small>{option.steps.join(" · ")}</small>}</span></label>)}
          {proposal.status === "pending" && <><textarea aria-label="自定义方案补充" value={customText} onChange={e=>{setCustomText(e.target.value);onPlanDraft?.(selected,e.target.value)}} placeholder="补充或改写批准后的执行内容…"/><button className="primary" onClick={()=>onPlanConfirm?.(selected,customText)}>确认并开始 Build</button></>}
          {proposal.status === "confirmed" && <small>方案已确认，Build Run：{proposal.buildRunId || "准备中"}</small>}
        </div>
      )}
      <WorkflowReceipt run={run} />
      {run.error && <p className="run-plan-error">{run.error}</p>}
      {run.contextRecovery?.status === "compacting" && <p className="muted" role="status">正在整理上下文，已有回复与工具记录保留。</p>}
      {(run.interruptionReason === "context_budget" || run.contextRecovery?.status === "failed") && <p className="muted">上下文仍不足或整理未完成。可减少输入后继续，或新建会话并引用必要资料。</p>}
      {checkpoint && (checkpoint.safeToResume || checkpoint.completedOperations.length > 0 || checkpoint.assistantText) && (
        <details className="run-checkpoint">
          <summary>查看恢复检查点</summary>
          <small>阶段：{phaseLabels[checkpoint.phase] || checkpoint.phase} · {checkpoint.safeToResume ? "可继续" : "已完成"} · {new Date(checkpoint.updatedAt).toLocaleString()}</small>
          {checkpoint.completedOperations.length > 0 && <small>工具记录：{checkpoint.completedOperations.map((operation) => `${operation.tool} (${operation.state})`).slice(0, 8).join("、")}</small>}
          {checkpoint.assistantText && <pre>{checkpoint.assistantText.slice(-1200)}</pre>}
        </details>
      )}
      {run.workflow && run.error && onEdit && <button onClick={onEdit}>调整资料与任务后重试</button>}
      {run.resumable && onResume && (
        <button className="primary" onClick={onResume}>{run.interruptionReason === "model_output_limit" ? "继续生成" : "继续任务"}</button>
      )}
    </article>
  );
}

type ArtifactDiffView = {
  artifactId: string;
  fromVersionId: string;
  toVersionId: string;
  file: {
    added: number;
    removed: number;
    fromLines: number;
    toLines: number;
  };
  structure: {
    addedHeadings: string[];
    removedHeadings: string[];
  };
  impact: {
    requirements: string[];
    links: string[];
    reviews: string[];
  };
};

type ProjectRecord = {
  id: string;
  name: string;
  title?: string;
  path?: string;
  root?: string;
  pinned?: boolean;
  activeRunCount?: number;
  conversationCount?: number;
  conversations?: Array<{ id: string; title: string; archived: boolean }>;
  isDefault?: boolean;
  default?: boolean;
  files?: unknown[];
  resources?: unknown[];
  artifacts?: unknown[];
  outputs?: unknown[];
};

type FutureResponse = { ok: boolean; data?: unknown; error?: string };

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function WorkflowDraftsPanel({
  workflow,
  onContinue,
  onApplyGroup,
  onApplyRules,
}: {
  workflow?: TemplateWorkflowView;
  onContinue: (text: string) => void;
  onApplyGroup: (id: string) => void;
  onApplyRules: (id: string) => void;
}) {
  if (!workflow)
    return (
      <section className="records-loading" aria-label="模板与规则草稿">
        正在读取模板迁移与规则草稿…
      </section>
    );
  const previews = [...workflow.previews].reverse(),
    groups = [...workflow.groups].reverse(),
    rules = [...workflow.ruleChanges].reverse();
  if (!previews.length && !groups.length && !rules.length)
    return (
      <section className="records-empty" aria-label="模板与规则草稿">
        <b>还没有模板迁移或规则草稿</b>
        <p>
          在会话中注册模板、预览迁移影响或起草工作空间规则后，这里会显示可核对的记录。
        </p>
      </section>
    );
  return (
    <section className="workflow-records" aria-label="模板与规则草稿">
      <div className="records-head">
        <div>
          <span className="eyebrow">结构化变更</span>
          <h2>模板迁移与规则草稿</h2>
        </div>
        <small>先核对影响，再提交完整草稿组</small>
      </div>
      <div className="records-grid">
        <section className="record-group">
          <div className="record-group-title">
            <h3>迁移影响预览</h3>
            <span>{previews.length}</span>
          </div>
          {previews.map((preview) => (
            <article
              className="record-card"
              data-workflow-id={preview.previewId}
              key={preview.previewId}
            >
              <div className="record-title">
                <b>{preview.template.title}</b>
                <span className="record-pill">{preview.template.version}</span>
              </div>
              {preview.impacts.map((impact) => (
                <div
                  className="migration-target"
                  key={impact.target.mountId + impact.target.path}
                >
                  <b>{impact.target.path}</b>
                  <small>
                    {impact.changed
                      ? "将调整 " + impact.sectionChanges.length + " 个章节"
                      : "结构无需调整"}{" "}
                    · {impact.canDraft ? "可生成草稿" : "存在阻塞"}
                  </small>
                  {impact.issues.map((issue, index) => (
                    <span
                      className={`migration-issue ${issue.severity}`}
                      key={issue.code + index}
                    >
                      {issue.message}
                    </span>
                  ))}
                </div>
              ))}
              <button
                onClick={() =>
                  onContinue(
                    `模板迁移预览 ${preview.previewId} 已生成。请让我逐项确认迁移目标；只有我明确确认的目标才能生成迁移草稿组。`,
                  )
                }
              >
                在会话中确认目标
              </button>
            </article>
          ))}
        </section>
        <section className="record-group">
          <div className="record-group-title">
            <h3>迁移草稿组</h3>
            <span>{groups.length}</span>
          </div>
          {groups.map((group) => (
            <article
              className="record-card"
              data-workflow-id={group.id}
              key={group.id}
            >
              <div className="record-title">
                <b>{group.changeIds.length} 个文件</b>
                <Status value={group.status} />
              </div>
              <small>
                已应用 {group.appliedChangeIds.length} · 待应用{" "}
                {group.remainingChangeIds.length}
              </small>
              {group.error && <p className="workflow-error">{group.error}</p>}
              {group.status === "pending" && (
                <button
                  className="primary"
                  onClick={() => onApplyGroup(group.id)}
                >
                  应用整个草稿组
                </button>
              )}
            </article>
          ))}
          {!groups.length && (
            <p className="record-placeholder">确认迁移目标后才会生成草稿组</p>
          )}
        </section>
        <section className="record-group">
          <div className="record-group-title">
            <h3>工作空间规则草稿</h3>
            <span>{rules.length}</span>
          </div>
          {rules.map((rule) => (
            <article
              className="record-card"
              data-workflow-id={rule.id}
              key={rule.id}
            >
              <div className="record-title">
                <b>{rule.relativePath}</b>
                <Status value={rule.status} />
              </div>
              <pre className="rule-draft">{rule.content}</pre>
              <small>
                基于 {rule.beforeHash ? rule.beforeHash.slice(0, 12) : "新文件"}{" "}
                · {new Date(rule.createdAt).toLocaleString()}
              </small>
              {rule.status === "pending" && (
                <button
                  className="primary"
                  onClick={() => onApplyRules(rule.id)}
                >
                  应用规则草稿
                </button>
              )}
            </article>
          ))}
        </section>
      </div>
    </section>
  );
}

function FlowPreviewPane({
  file,
  value,
  onClose,
  onReference,
  onReveal,
  onProcessingCopy,
  processingBusy,
}: {
  file: FileRef;
  value: FlowPreview;
  onClose: () => void;
  onReference: () => void;
  onReveal: () => void;
  onProcessingCopy?: () => void;
  processingBusy?: boolean;
}) {
  return (
    <aside className="preview flow-preview" aria-label="流程图预览">
      <div className="preview-head">
        <div>
          <span className="eyebrow">安全静态预览</span>
          <b>{file.path.split(/[\\/]/).pop()}</b>
          <small>版本 {value.version.slice(0, 12)}</small>
          {file.referenceProtected && <small>参考只读</small>}
        </div>
        <button className="icon-button" aria-label="关闭预览" onClick={onClose}>
          <Icon name="close" size={16}/>
        </button>
      </div>
      <div className="preview-actions">
        <button onClick={onReference}>引用流程图</button>
        <button onClick={onReveal}>定位文件</button>
        {onProcessingCopy && <button disabled={processingBusy} onClick={onProcessingCopy}>{processingBusy ? "创建中…" : "创建处理副本"}</button>}
      </div>
      <section
        className={`flow-report ${value.report.valid ? "valid" : "invalid"}`}
      >
        <div>
          <b>{value.report.valid ? "检查通过" : "检查发现问题"}</b>
          <span>
            {value.report.counts.vertices} 节点 · {value.report.counts.edges}{" "}
            连线 · {value.report.counts.errors} 错误 ·{" "}
            {value.report.counts.warnings} 警告
          </span>
        </div>
        <small>
          规范 {value.report.specId} v{value.report.specVersion}
        </small>
        {value.report.issues.map((issue, index) => (
          <p key={issue.code + issue.diagramId + index}>
            <strong>{issue.severity === "error" ? "错误" : "警告"}</strong>{" "}
            {issue.message}
            {issue.cellId && ` · ${issue.cellId}`}
          </p>
        ))}
      </section>
      <div className="flow-pages">
        {value.previews.map((page) => (
          <section className="flow-page" key={page.diagramId}>
            <div>
              <b>{page.name}</b>
              <small>{page.diagramId}</small>
            </div>
            {page.svg ? (
              <img
                src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(page.svg)}`}
                alt={`${page.name} 流程图静态预览`}
              />
            ) : (
              <p className="reader-notice">
                当前页面无法生成安全静态预览，请保留 draw.io 源文件查看。
              </p>
            )}
            {page.limitations.map((item, index) => (
              <p className="flow-limitation" key={item.code + index}>
                {item.message}
              </p>
            ))}
          </section>
        ))}
      </div>
      {value.limitations.length > 0 && (
        <section className="flow-limitations">
          <b>预览限制</b>
          {value.limitations.map((item, index) => (
            <p key={item.code + index}>{item.message}</p>
          ))}
        </section>
      )}
    </aside>
  );
}

function PreviewPane({
  file,
  artifactId,
  documentView,
  preview,
  selection,
  onSelection,
  onClose,
  onReference,
  onReveal,
  onExport,
  onWorkflow,
  onContinue,
  mode,
  acceptanceAccessKey,
  onVersions,
  onOpenVersion,
  onRestore,
  onProcessingCopy,
  processingBusy,
  versions,
  versionLabel,
  connections,
  call,
}: {
  file: FileRef;
  artifactId?: string;
  documentView?: DocumentContent;
  preview?: PreviewHandle;
  selection?: SelectionContext;
  onSelection: (value?: SelectionContext) => void;
  onClose: () => void;
  onReference: () => void;
  onReveal: () => void;
  onExport: (format: "copy" | "docx" | "zip") => void;
  onWorkflow: (kind: PmWorkflowKind, sources: PmWorkflowSource[]) => void;
  onContinue: (text: string) => void;
  mode: AgentMode;
  acceptanceAccessKey: string;
  onVersions: () => void;
  onOpenVersion: (id: string) => void;
  onRestore: (id: string) => void;
  onProcessingCopy?: () => void;
  processingBusy?: boolean;
  versions: VersionSummary[];
  versionLabel?: string;
  connections: Connection[];
  call: (request: Request) => Promise<unknown>;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const reader = useRef<HTMLDivElement>(null);
  const moreActions = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (event.target instanceof Node && !moreActions.current?.contains(event.target) && moreActions.current) moreActions.current.open = false;
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      const actions = moreActions.current;
      if (event.key !== "Escape" || event.defaultPrevented || !actions?.open) return;
      // A disabled async action can leave focus on body. Handle that case here,
      // while keeping the active settings, picker or popup in charge of Escape.
      if (document.querySelector('.settings-modal,.reference-picker,[role="listbox"],.context-menu,.subdialog,.form-modal-layer')) return;
      event.preventDefault();
      actions.open = false;
      actions.querySelector("summary")?.focus();
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);
  const [selecting, setSelecting] = useState(false);
  const [selectionReady, setSelectionReady] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [quality, setQuality] = useState<QualityCheckResult>();
  const [qualityBusy, setQualityBusy] = useState(false);
  const [qualityError, setQualityError] = useState("");
  const [diff, setDiff] = useState<ArtifactDiffView>();
  const [diffVersions, setDiffVersions] = useState<VersionSummary[]>([]);
  const [diffFromVersion, setDiffFromVersion] = useState("");
  const [diffBusy, setDiffBusy] = useState(false);
  const [diffOpen, setDiffOpen] = useState(false);
  const [diffError, setDiffError] = useState("");
  const [qualityHistory, setQualityHistory] = useState<QualityHistoryView>();
  const [qualityHistoryOpen, setQualityHistoryOpen] = useState(false);
  const [impactGraph, setImpactGraph] = useState<ImpactGraphView>();
  const [impactGraphOpen, setImpactGraphOpen] = useState(false);
  const runQualityCheck = async () => {
    setQualityBusy(true);
    setQualityError("");
    try {
      setQuality((await call({ type: "qualityCheck", mountId: file.mountId, path: file.path })) as QualityCheckResult);
    } catch (reason) {
      setQualityError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setQualityBusy(false);
    }
  };
  const loadQualityHistory = async () => {
    if (!artifactId) return;
    setQualityHistoryOpen(true);
    try {
      setQualityHistory((await call({ type: "qualityHistory", artifactId, mountId: file.mountId, path: file.path, limit: 20 })) as QualityHistoryView);
    } catch (reason) {
      setQualityError(reason instanceof Error ? reason.message : String(reason));
    }
  };
  const loadImpactGraph = async () => {
    if (!artifactId) return;
    setImpactGraphOpen(true);
    try {
      setImpactGraph((await call({ type: "artifactImpactGraph", artifactId, direction: "both", includeCandidates: true, maxDepth: 5 })) as ImpactGraphView);
    } catch (reason) {
      setDiffError(reason instanceof Error ? reason.message : String(reason));
    }
  };
  const runArtifactDiff = async (fromVersionId?: string, toVersionId?: string) => {
    if (!artifactId) {
      setDiffError("该文件尚未注册为成果，暂时无法生成版本差异。");
      setDiffOpen(true);
      return;
    }
    setDiffBusy(true);
    setDiffError("");
    setDiffOpen(true);
    try {
      let available = diffVersions.length ? diffVersions : versions;
      if (!available.length) {
        available = (await call({
          type: "versions",
          mountId: file.mountId,
          path: file.path,
        })) as VersionSummary[];
      }
      setDiffVersions(available);
      const from = fromVersionId || diffFromVersion || available.find((item) => item.id !== "current")?.id || available[0]?.id;
      if (!from) throw Error("没有可比较的历史版本");
      setDiffFromVersion(from);
      setDiff(
        (await call({
          type: "artifactDiff",
          artifactId,
          fromVersionId: from,
          ...(toVersionId ? { toVersionId } : {}),
        })) as ArtifactDiffView,
      );
    } catch (reason) {
      setDiff(undefined);
      setDiffError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setDiffBusy(false);
    }
  };
  useEffect(() => {
    setDiff(undefined);
    setDiffVersions([]);
    setDiffFromVersion("");
    setDiffError("");
    setDiffOpen(false);
    setQualityHistory(undefined);
    setQualityHistoryOpen(false);
    setImpactGraph(undefined);
    setImpactGraphOpen(false);
  }, [file.mountId, file.path, artifactId]);
  const postSelectionMode = (enabled: boolean) =>
    frame.current?.contentWindow?.postMessage(
      { type: "pm:select", enabled },
      "*",
    );
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow) return;
      if (event.data?.type === "pm:select-state") {
        setSelectionReady(Boolean(event.data.enabled));
        return;
      }
      if (
        event.data?.type !== "pm:element" ||
        typeof event.data.text !== "string"
      )
        return;
      const tag = String(event.data.tag || "element").slice(0, 30);
      const id = String(event.data.id || "").slice(0, 100);
      onSelection({
        label: "原型元素",
        text: event.data.text.slice(0, 5000),
        locator: `${tag}${id ? " #" + id : ""}`,
        version: preview?.version || "未知版本",
      });
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [onSelection, preview?.version]);
  const captureText = () => {
    const current = window.getSelection();
    if (
      !current ||
      current.isCollapsed ||
      !reader.current ||
      !current.rangeCount
    )
      return;
    const range = current.getRangeAt(0);
    const node = range.commonAncestorContainer;
    const element =
      node.nodeType === Node.ELEMENT_NODE
        ? (node as Element)
        : node.parentElement;
    if (!element || !reader.current.contains(element)) return;
    const prefix = window.document.createRange();
    prefix.selectNodeContents(reader.current);
    prefix.setEnd(range.startContainer, range.startOffset);
    const selected = current.toString().trim();
    if (!selected) return;
    const heading = element.closest("h1,h2,h3,h4,h5,h6,p,li");
    onSelection({
      label: "文档选段",
      text: selected.slice(0, 5000),
      locator: `正文字符 ${prefix.toString().length} · ${(heading?.textContent || selected).trim().slice(0, 80)}`,
      version: documentView?.version || "未知版本",
    });
  };
  return (
    <aside className="preview" aria-label="资料预览">
      <div className="preview-head">
        <div>
          <span className="eyebrow">阅读器</span>
          <b>{file.path.split(/[\\/]/).pop()}</b>
          {versionLabel && <small>{versionLabel}</small>}
          {file.referenceProtected && <small title="原件保留；转换或脚本请先创建处理副本">参考只读</small>}
        </div>
        <button className="icon-button" aria-label="关闭预览" onClick={onClose}><Icon name="close" size={16}/></button>
      </div>
      <div className="preview-actions">
        <button onClick={onReference}>引用文件</button>
        {preview && (
          <button
            className={selectionReady ? "active" : ""}
            onClick={() => {
              const next = !selecting;
              setSelecting(next);
              setSelectionReady(false);
              postSelectionMode(next);
            }}
          >
            {selecting
              ? selectionReady
                ? "退出点选"
                : "正在启用…"
              : "选择元素"}
          </button>
        )}
        <details className="preview-more" ref={moreActions} onKeyDown={event => {
          if (event.key === "Escape" && moreActions.current?.open) {
            event.preventDefault();
            event.stopPropagation();
            moreActions.current.open = false;
            moreActions.current.querySelector("summary")?.focus();
          }
        }}>
          <summary><Icon name="more" size={16}/><span>更多</span><Icon name="chevronDown" size={12}/></summary>
          <div className="preview-more-panel">
            <div className="preview-more-actions" onClick={event => { if ((event.target as HTMLElement).closest("button:not(:disabled)")) { if (moreActions.current) moreActions.current.open = false; } }}>
        {preview && <button aria-label="基于原型补 PRD" onClick={() => onWorkflow("prototype_to_prd", [{ mountId: file.mountId, path: file.path, artifactId, contentHash: preview.version }])}>基于原型补 PRD</button>}
        <button onClick={onReveal}>定位文件</button>
        {onProcessingCopy && <button disabled={processingBusy} onClick={onProcessingCopy}>{processingBusy ? "创建中…" : "创建处理副本"}</button>}
        <button
          onClick={() => {
            setHistoryOpen((value) => !value);
            onVersions();
          }}
        >
          历史
        </button>
        <button disabled={qualityBusy} className={quality?.check.valid ? "active" : ""} onClick={() => void runQualityCheck()}>
          {qualityBusy ? "检查中…" : "质量检查"}
        </button>
        <button disabled={!artifactId} className={qualityHistoryOpen ? "active" : ""} onClick={() => void loadQualityHistory()}>检查历史</button>
        <button disabled={!artifactId} className={impactGraphOpen ? "active" : ""} onClick={() => void loadImpactGraph()}>受影响内容</button>
        <button
          disabled={diffBusy || !artifactId}
          className={diffOpen && diff ? "active" : ""}
          title={artifactId ? "比较成果版本并查看影响" : "该文件尚未注册为成果"}
          onClick={() => void runArtifactDiff()}
        >
          {diffBusy ? "计算差异…" : "查看差异"}
        </button>
        <button onClick={() => onExport("copy")}>导出原文件</button>
        {/\.md$/i.test(file.path) && (
          <button disabled={file.referenceProtected} title={file.referenceProtected ? "请先创建处理副本再转换" : undefined} onClick={() => onExport("docx")}>导出 Word</button>
        )}
        {preview && <button onClick={() => onExport("zip")}>打包项目</button>}
            </div>
            <Delivery
              connections={connections}
              file={file}
              sourceHash={documentView?.version || preview?.version}
              call={call}
            />
          </div>
        </details>
      </div>
      {historyOpen && (
        <section className="version-panel">
          <div className="version-title">
            <b>成果历史</b>
            <small>恢复会创建新的会话变更，不覆盖当前内容</small>
          </div>
          {versions.length ? (
            versions.map((version) => (
              <div className="version-row" key={version.id}>
                <div>
                  <b>{version.label}</b>
                  <small>
                    {new Date(version.createdAt).toLocaleString()}
                    {version.runId ? ` · run ${version.runId.slice(0, 8)}` : ""}
                  </small>
                </div>
                <button onClick={() => onOpenVersion(version.id)}>查看</button>
                <button
                  disabled={!version.restorable || file.referenceProtected}
                  title={file.referenceProtected ? "参考原件只读，请创建处理副本后修改" : undefined}
                  onClick={() => onRestore(version.id)}
                >
                  恢复
                </button>
              </div>
            ))
          ) : (
            <p className="empty compact">还没有可查看的版本</p>
          )}
        </section>
      )}
      {preview && <PrototypeAcceptance key={`${acceptanceAccessKey}:${file.mountId}:${file.path}`} file={file} artifactId={artifactId} version={preview.version} mode={mode} call={call} onContinue={onContinue} />}
      {(quality || qualityError) && (
        <section className="quality-check-panel" aria-label="成果质量检查结果">
          <div className="version-title"><b>质量检查</b>{quality && <Status value={quality.check.valid ? "succeeded" : "failed"} />}</div>
          {qualityError ? <p className="inline-error">{qualityError}</p> : quality && <>
            <p>{quality.check.summary}</p>
            <small>阻塞问题 {quality.check.counts.blocking} · 警告 {quality.check.counts.warnings}</small>
            {quality.check.issues.length > 0 && <details className="quality-issue-details"><summary>查看 {quality.check.issues.length} 项检查详情</summary><ul className="quality-issues">{quality.check.issues.map((issue, index) => <li key={`${issue.code}-${index}`}><Status value={issue.severity === "blocking" ? "failed" : "partial"} /> {issue.message}{issue.locator ? ` · ${issue.locator}` : ""}</li>)}</ul></details>}
          </>}
        </section>
      )}
      {qualityHistoryOpen && (
        <section className="quality-history-panel" aria-label="质量检查历史">
          <div className="version-title"><b>检查历史</b><small>{qualityHistory?.reports.length ?? 0} 条记录</small></div>
          {qualityHistory?.reports.length ? qualityHistory.reports.map((record) => (
            <div className="quality-history-row" key={record.id}><span>{new Date(record.createdAt).toLocaleString()}</span><Status value={record.gate.allowed ? "succeeded" : "failed"} /><small>{record.report.checkedVersion || "当前版本"} · 阻断 {record.report.counts.blocking} · 警告 {record.report.counts.warnings}</small></div>
          )) : <p className="detail-muted">还没有保存的质量检查结果。</p>}
        </section>
      )}
      {impactGraphOpen && (
        <section className="impact-graph-panel" aria-label="成果影响关系">
          <div className="version-title"><b>受影响内容</b><small>{impactGraph ? `${impactGraph.nodes.length} 项` : "正在读取…"}</small></div>
          {impactGraph ? <ul className="affected-content-list" aria-label="受影响内容清单">{impactGraph.nodes.map(node => <li data-record-id={node.id} key={node.id}><b>{node.title}</b><small>{({ artifact: "成果文件", requirement: "需求", review: "检查记录", delivery: "交付" } as Record<string,string>)[node.kind]} · {node.path || node.id} · {node.certainty === "candidate" ? "候选影响，待核对" : node.id === impactGraph.originArtifactId ? "当前成果" : "已建立关联"}{node.status ? ` · ${node.status}` : ""}</small>{impactGraph.edges.filter(edge => edge.from === node.id || edge.to === node.id).map(edge => <small key={edge.id}>{edge.rationale || edge.relation}{edge.locator ? ` · ${edge.locator}` : ""}</small>)}</li>)}</ul> : <p className="detail-muted">正在读取涉及的成果、需求、检查和交付记录。</p>}
        </section>
      )}
      {diffOpen && (
        <section className="artifact-diff-panel" aria-label="成果版本差异">
          <div className="version-title artifact-diff-head">
            <div>
              <b>版本差异</b>
              <small>确定性解析文件、章节结构和关联影响，模型不会改写差异结果。</small>
            </div>
            {diff && <button disabled={diff.fromVersionId === diff.toVersionId} aria-label="根据实际差异生成变更说明" onClick={() => onWorkflow("change_summary", [{ mountId: file.mountId, path: file.path, artifactId, versionId: diff.fromVersionId }, { mountId: file.mountId, path: file.path, artifactId, versionId: diff.toVersionId }])}>生成变更说明</button>}
            <button disabled={diffBusy || !artifactId} onClick={() => void runArtifactDiff(diffFromVersion)}>
              刷新
            </button>
          </div>
          {diffError ? (
            <p className="inline-error">{diffError}</p>
          ) : diff ? (
            <>
              <div className="artifact-diff-controls">
                <label>
                  对比版本
                  <select
                    value={diffFromVersion}
                    onChange={(event) => {
                      setDiffFromVersion(event.target.value);
                      void runArtifactDiff(event.target.value);
                    }}
                  >
                    {diffVersions.map((version) => (
                      <option key={version.id} value={version.id}>{version.label}</option>
                    ))}
                  </select>
                </label>
                <span className="artifact-diff-target">目标：当前版本</span>
              </div>
              <div className="artifact-diff-metrics">
                <div><b>+{diff.file.added}</b><small>新增行</small></div>
                <div><b>−{diff.file.removed}</b><small>删除行</small></div>
                <div><b>{diff.file.fromLines} → {diff.file.toLines}</b><small>文件行数</small></div>
              </div>
              <div className="artifact-diff-sections">
                <section>
                  <h4>章节结构</h4>
                  {diff.structure.addedHeadings.length ? <div><b className="diff-added-label">新增</b>{diff.structure.addedHeadings.map((heading) => <p className="diff-line added" key={`added-${heading}`}>{heading}</p>)}</div> : <small>没有新增章节</small>}
                  {diff.structure.removedHeadings.length ? <div><b className="diff-removed-label">删除</b>{diff.structure.removedHeadings.map((heading) => <p className="diff-line removed" key={`removed-${heading}`}>{heading}</p>)}</div> : <small>没有删除章节</small>}
                </section>
                <section>
                  <h4>影响摘要</h4>
                  <div className="artifact-diff-impact">
                    <span>需求 <b>{diff.impact.requirements.length}</b></span>
                    <span>关联成果 <b>{diff.impact.links.length}</b></span>
                    <span>评审 <b>{diff.impact.reviews.length}</b></span>
                  </div>
                  <div className="artifact-diff-impact-refs">
                    {[...diff.impact.requirements.map((id) => `需求 · ${id}`), ...diff.impact.links.map((id) => `关联 · ${id}`), ...diff.impact.reviews.map((id) => `评审 · ${id}`)].slice(0, 6).map((item) => <span key={item}>{item}</span>)}
                  </div>
                  {diff.impact.requirements.length + diff.impact.links.length + diff.impact.reviews.length === 0 ? (
                    <small>没有记录到关联影响。</small>
                  ) : (
                    <small>建议重新检查受影响需求、评审问题和后续交付清单。</small>
                  )}
                </section>
              </div>
            </>
          ) : (
            <p className="detail-muted">点击刷新生成当前成果与历史版本的差异。</p>
          )}
        </section>
      )}
      {selection && (
        <div className="selection-card">
          <div>
            <b>{selection.label}</b>
            <small>{selection.locator}</small>
          </div>
          <p>{selection.text.slice(0, 180)}</p>
          <button className="primary" onClick={onReference}>
            加入会话
          </button>
          <button onClick={() => onSelection(undefined)}>清除</button>
        </div>
      )}
      {preview ? (
        <iframe
          ref={frame}
          title="隔离的原型预览"
          sandbox="allow-scripts allow-modals allow-forms"
          src={preview.url}
          onLoad={() => {
            setSelectionReady(false);
            postSelectionMode(selecting);
          }}
        />
      ) : (
        <div ref={reader} className="document-reader" onMouseUp={captureText}>
          {documentView?.notice && (
            <div className="reader-notice">{documentView.notice}</div>
          )}
          {documentView?.format === "text" ? (
            <pre>{documentView.content}</pre>
          ) : (
            <Markdown>{documentView?.content || ""}</Markdown>
          )}
        </div>
      )}
    </aside>
  );
}

export function App() {
  const [theme, setTheme] = useState<ThemeName>(() => {
    const stored = localStorage.getItem("slash:theme");
    return stored === "graphite" || stored === "sand" ? stored : "reference";
  });
  useEffect(() => localStorage.setItem("slash:theme", theme), [theme]);
  useEffect(() => { void window.pm.request({ type: "windowTheme", theme }); }, [theme]);
  const [state, setState] = useState<State>();
  const [view, setView] = useState<View>("会话");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [conversationId, setConversationId] = useState("");
  const [draft, setDraft] = useState("");
  const [slashOpen, setSlashOpen] = useState(false);
  const [slashIndex, setSlashIndex] = useState(0);
  const [imageAttachment, setImageAttachment] = useState<{path:string;name:string}>();
  const [referencePickerOpen, setReferencePickerOpen] = useState(false);
  const [referenceAttachments, setReferenceAttachments] = useState<FileRef[]>([]);
  const [workflowKind, setWorkflowKind] = useState<PmWorkflowKind>();
  const [workflowSources, setWorkflowSources] = useState<PmWorkflowSource[]>();
  const [visionBusy, setVisionBusy] = useState(false);
  const [agentMode, setAgentMode] = useState<"plan"|"build">("build");
  const [inputDelivery,setInputDelivery]=useState<'steer'|'follow_up'>('steer');
  const inputRequest=useRef<{runId:string;text:string;delivery:'steer'|'follow_up';requestId:string}|undefined>(undefined);
  const [permissionMode, setPermissionMode] = useState<"standard"|"accept_edits"|"full_access">("standard");
  const [modelEntryId, setModelEntryId] = useState("");
  const [thinkingCapability, setThinkingCapability] = useState<ThinkingCapability>();
  const [thinkingLoading, setThinkingLoading] = useState(false);
  const [thinkingLevel, setThinkingLevel] = useState<ThinkingLevel>();
  const [thinkingDirty, setThinkingDirty] = useState(false);
  const thinkingIdentity = useRef("");
  const thinkingRequestId = useRef(0);
  const thinkingScope = useRef("");
  const thinkingLevelRef = useRef(thinkingLevel);
  thinkingLevelRef.current = thinkingLevel;
  useEffect(() => {
    if (modelEntryId && state?.models && !state.models.some(item => item.id === modelEntryId)) setModelEntryId("");
  }, [state?.models, modelEntryId]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const clearProcessingPreviewNotice = () => setNotice(current => current === PROCESSING_PREVIEW_UNAVAILABLE_NOTICE ? "" : current);
  const [files, setFiles] = useState<FileRef[]>([]);
  const [projectTree, setProjectTree] = useState<ProjectTreeView>();
  const [browserTab, setBrowserTab] = useState("");
  const [browserSubtab, setBrowserSubtab] = useState("");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<FileRef>();
  const [processingBusy, setProcessingBusy] = useState(false);
  const [browserReferenceProtected, setBrowserReferenceProtected] = useState(false);
  const currentWorkspaceRef = useRef(state?.root);
  currentWorkspaceRef.current = state?.root;
  const [selectedArtifactId, setSelectedArtifactId] = useState("");
  const [documentView, setDocumentView] = useState<DocumentContent>();
  const [preview, setPreview] = useState<PreviewHandle>();
  const [selection, setSelection] = useState<SelectionContext>();
  const [versions, setVersions] = useState<VersionSummary[]>([]);
  const [versionLabel, setVersionLabel] = useState("");
  const [stream, setStream] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [conversationQuery, setConversationQuery] = useState("");
  const [rename, setRename] = useState("");
  const [editingTitle, setEditingTitle] = useState(false);
  const [proposals, setProposals] = useState<ExternalActionProposal[]>([]);
  const [productRecords, setProductRecords] = useState<ProductRecordsView>();
  const [projectSidebarCollapsed, setProjectSidebarCollapsed] = useState(() => localStorage.getItem("slash:project-sidebar-collapsed") === "true");
  useEffect(() => { localStorage.setItem("slash:project-sidebar-collapsed", String(projectSidebarCollapsed)); }, [projectSidebarCollapsed]);
  const [decisionCenter, setDecisionCenter] = useState<DecisionCenterView>();
  const [replyPanels, setReplyPanels] = useState<Record<string, ReplyPanelState>>({});
  useEffect(() => setReplyPanels({}), [state?.root, conversationId]);
  const [templateWorkflow, setTemplateWorkflow] =
    useState<TemplateWorkflowView>();
  const [flowView, setFlowView] = useState<FlowPreview>();
  const [modelRouteError, setModelRouteError] = useState("");
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [browserProjectId, setBrowserProjectId] = useState<string>();
  const [browserNavigationKey, setBrowserNavigationKey] = useState(0);
  const approvalResolving = useRef(new Set<string>());
  const [approvalBusyIds, setApprovalBusyIds] = useState<string[]>([]);
  const updateBrowserDirectory = useCallback((folder: {mountId:string;path:string}|undefined) => {setFolderMountId(folder?.mountId||"");setFolderPath(folder?.path||"");}, []);
  const [projectId, setProjectId] = useState(
    () => localStorage.getItem("slash:current-project") || "",
  );
  const [projectEntries, setProjectEntries] = useState<ProjectEntry[]>([]);
  const [importBusy, setImportBusy] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(() => localStorage.getItem("slash:details-open") === "true");
  const detailsToggleRef = useRef<HTMLButtonElement>(null);
  const closeDetails = useCallback(() => {
    setDetailsOpen(false);
    requestAnimationFrame(() => detailsToggleRef.current?.focus());
  }, []);
  useEffect(() => {
    localStorage.setItem("slash:details-open", String(detailsOpen));
  }, [detailsOpen]);
  useEffect(() => {
    if (!detailsOpen || settingsOpen || referencePickerOpen || view !== "会话") return;
    const keydown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented || document.querySelector('[role="listbox"],.context-menu,.subdialog,.form-modal-layer')) return;
      event.preventDefault();
      closeDetails();
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, [detailsOpen, settingsOpen, referencePickerOpen, view, closeDetails]);
  const [detailsTab, setDetailsTab] = useState<"details" | "artifacts" | "files">("details");
  const [folderMountId, setFolderMountId] = useState("");
  const [folderPath, setFolderPath] = useState("");
  const [folderMenu, setFolderMenu] = useState<{
    mountId: string;
    path?: string;
    file?: FileRef;
    x: number;
    y: number;
  }>();
  const [messageMenu, setMessageMenu] = useState<{ index: number; text: string; x: number; y: number }>();
  const call = useCallback(async (request: Request) => {
    const response = await window.pm.request(request);
    if (!response.ok) throw Error(response.error || "请求失败");
    return response.data as unknown;
  }, []);
  const futureRequest = useCallback(async (request: unknown) => {
    try {
      const response = await (
        window.pm.request as unknown as (
          value: unknown,
        ) => Promise<FutureResponse>
      )(request);
      return response.ok ? response.data : undefined;
    } catch {
      return undefined;
    }
  }, []);
  const act = useCallback(async (action: () => Promise<unknown>) => {
    setError("");
    try {
      return await action();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  }, []);
  const refresh = useCallback(async () => {
    const next = (await call({ type: "state" })) as State;
    setState(next);
    setConversationId((previous) =>
      next.conversations.some((item) => item.id === previous)
        ? previous
        : next.conversations.find((item) => !item.archived)?.id ||
          next.conversations[0]?.id ||
          "",
    );
  }, [call]);
  const loadProjects = useCallback(async () => {
    const raw = await futureRequest({ type: "projects" });
    const value = record(raw);
    const list = Array.isArray(raw)
      ? raw
      : Array.isArray(value?.projects)
        ? value.projects
        : [];
    const normalized = list
      .map((item) => {
        const value = record(item);
        if (!value) return undefined;
        const id = String(value.id || value.projectId || "");
        if (!id) return undefined;
        return {
          ...value,
          id,
          name: String(value.name || value.title || id),
          isDefault: Boolean(value.isDefault || value.default),
        } as ProjectRecord;
      })
      .filter((item): item is ProjectRecord => Boolean(item));
    setProjects(normalized);
    const currentProjectId =
      (typeof value?.currentProjectId === "string" && value.currentProjectId) ||
      (typeof value?.defaultProjectId === "string" && value.defaultProjectId) ||
      normalized.find((item) => item.isDefault)?.id ||
      normalized[0]?.id ||
      "";
    // The host service is the source of truth after a workspace/project
    // switch. Keeping a stale renderer-local project here can immediately
    // reopen the previous folder during the next refresh or application
    // restart.
    setProjectId(currentProjectId);
  }, [futureRequest]);
  useEffect(() => {
    void act(refresh);
    void loadProjects();
    const cursors = new Map<string, number>();
    const pending = new Map<string, Promise<void>>();
    const apply = (event: Event, refreshState = true) => {
      const streamId = event.streamId || (event.runId ? `run:${event.runId}` : "global");
      if (typeof event.sequence === "number") {
        const previous = cursors.get(streamId) || 0;
        if (event.sequence <= previous) return;
        cursors.set(streamId, event.sequence);
      }
      if (event.type === "state") {
        if (refreshState) void act(refresh);
        return;
      }
      if (event.type === "delta" && event.runId && event.text)
        setStream((previous) => ({
          ...previous,
          [event.runId!]: (previous[event.runId!] || "") + event.text,
        }));
    };
    const replay = async (streamId: string, afterSequence: number, targetSequence: number) => {
      let cursor = afterSequence;
      let refreshState = false;
      for (let page = 0; page < 10; page += 1) {
        const raw = record(await call({ type: "eventReplay", streamId, afterSequence: cursor, limit: 1000 }));
        if (!raw) break;
        if (raw.gap) {
          // The bounded journal no longer contains the requested prefix. A
          // fresh snapshot is the only safe way to rejoin this stream.
          await refresh();
          cursors.set(streamId, Number(raw.latestSequence) || cursor);
          return;
        }
        const events = (Array.isArray(raw.events) ? raw.events : []) as Event[];
        for (const item of events) {
          if (item.type === "state") refreshState = true;
          apply(item, false);
        }
        cursor = Number(raw.latestSequence && raw.hasMore ? events.at(-1)?.sequence : raw.latestSequence) || cursor;
        if (!raw.hasMore || cursor >= targetSequence) break;
      }
      if (refreshState) void act(refresh);
    };
    const enqueue = (event: Event) => {
      if (typeof event.sequence !== "number") {
        apply(event);
        return;
      }
      const streamId = event.streamId || (event.runId ? `run:${event.runId}` : "global");
      const targetSequence = event.sequence;
      const task = (pending.get(streamId) || Promise.resolve()).then(async () => {
        const cursor = cursors.get(streamId) || 0;
        if (targetSequence > cursor + 1) await replay(streamId, cursor, targetSequence);
        apply(event);
      }).catch(() => {
        // A reconnect can race shutdown. The next durable state event will
        // retry the gap and the regular refresh path remains authoritative.
      });
      pending.set(streamId, task);
      void task.finally(() => { if (pending.get(streamId) === task) pending.delete(streamId); });
    };
    return window.pm.subscribe(enqueue);
  }, [act, call, loadProjects, refresh]);
  const fileLoadVersion = useRef(0);
  const fileMountSignature = JSON.stringify(state?.mounts.map(mount => [mount.id, mount.name, mount.path, mount.enabled, mount.write]));
  const loadFiles = useCallback(async (value = query) => {
    const version = ++fileLoadVersion.current;
    const [nextFiles, tree] = await Promise.all([call({ type: "files", query: value }), call({ type: "projectTreeGet" })]);
    if (version !== fileLoadVersion.current) return;
    setFiles(nextFiles as FileRef[]);setProjectTree(tree as ProjectTreeView);
  }, [call, query]);
  useEffect(() => {
    fileLoadVersion.current++;
    setProjectTree(undefined);setFiles([]);setBrowserTab("");setBrowserSubtab("");setFolderMountId("");setFolderPath("");
  }, [state?.root]);
  const openDetailsTab = (tab: "details" | "artifacts" | "files") => {
    setDetailsTab(tab);
    if (tab !== "details") void act(() => loadFiles(""));
  };
  useEffect(() => {
    if (
      state?.root &&
      ["资源", "成果", "规则与模板"].includes(view)
    )
      void act(() => loadFiles());
  }, [act, loadFiles, state?.root, view, fileMountSignature]);
  useEffect(() => {
    if (!conversationId) {
      setProposals([]);
      return;
    }
    void act(async () =>
      setProposals(
        (await call({
          type: "externalActions",
          conversationId,
        })) as ExternalActionProposal[],
      ),
    );
  }, [act, call, conversationId, state]);
  const pendingPlan = state?.runs.find(run => run.conversationId === conversationId && run.mode === "plan" && run.proposal?.status === "pending");
  const composerTaskType = !draft.trim() && pendingPlan?.modelRoute?.taskType ? pendingPlan.modelRoute.taskType as import("../shared/types").ModelTaskType : resolveComposerIntent({ draft, workflowKind, view }).taskType;
  thinkingScope.current = `${modelEntryId}:${composerTaskType}`;
  const modelConfigurationKey = JSON.stringify(state?.models?.map(model => [model.id, model.baseUrl, model.modelId, model.protocol, model.updatedAt]));
  useEffect(() => {
    let disposed = false;
    const requestId = ++thinkingRequestId.current;
    const requestScope = thinkingScope.current;
    setThinkingLoading(true);
    setThinkingCapability(undefined);
    void call({ type: "modelThinkingCapability", modelEntryId: modelEntryId || undefined, taskType: composerTaskType }).then(value => {
      if (disposed || requestId !== thinkingRequestId.current || requestScope !== thinkingScope.current) return;
      const capability = value as ThinkingCapability;
      const identity = `${capability.modelEntryId || ""}:${capability.fingerprint}:${composerTaskType}`;
      if (thinkingIdentity.current !== identity || (thinkingLevelRef.current && !capability.levels.includes(thinkingLevelRef.current))) {
        if (thinkingLevelRef.current) setNotice("模型或任务已变化，思考强度已恢复模型默认。");
        setThinkingLevel(undefined);if (thinkingLevelRef.current) setThinkingDirty(true);
      }
      thinkingIdentity.current = identity;
      setThinkingCapability(capability);
    }).catch(() => { if (!disposed) { setThinkingCapability(undefined);setThinkingLevel(undefined); } }).finally(() => { if (!disposed) setThinkingLoading(false); });
    return () => { disposed = true; };
  }, [call, modelEntryId, composerTaskType, modelConfigurationKey, state?.defaultModelId, settingsOpen]);
  const refreshThinkingCapability = async () => {
    const requestId = ++thinkingRequestId.current, requestScope=thinkingScope.current;setThinkingLoading(true);
    try {
      const capability = await call({type:"modelThinkingCapability",modelEntryId:modelEntryId || undefined,taskType:composerTaskType,refresh:true}) as ThinkingCapability;
      if(requestId !== thinkingRequestId.current || requestScope!==thinkingScope.current)return;
      if(thinkingLevelRef.current && (capability.status !== "supported" || !capability.levels.includes(thinkingLevelRef.current))) { setThinkingLevel(undefined);setThinkingDirty(true);setNotice("检测到的模型档位已变化，思考强度恢复模型默认。"); }
      thinkingIdentity.current=`${capability.modelEntryId || ""}:${capability.fingerprint}:${composerTaskType}`;setThinkingCapability(capability);
    } catch (reason) { if(requestId===thinkingRequestId.current)setError(reason instanceof Error?reason.message:String(reason)); }
    finally { if(requestId===thinkingRequestId.current)setThinkingLoading(false); }
  };
  useEffect(() => {
    if (!state?.model?.id) {
      setModelRouteError("");
      return;
    }
    let disposed = false;
    const selectedModel = state.models?.find((item) => item.id === modelEntryId);
    void call({ type: "modelRoute", strategy: selectedModel ? "fixed" : undefined, taskType: composerTaskType, preferredEntryId: selectedModel?.id })
      .then(() => { if (!disposed) setModelRouteError(""); })
      .catch((reason) => { if (!disposed) setModelRouteError(reason instanceof Error ? reason.message : String(reason)); });
    return () => { disposed = true; };
  }, [call, state?.model?.id, state?.models, state?.defaultModelId, modelEntryId, composerTaskType, settingsOpen]);
  useEffect(() => {
    let disposed = false;
    if (["会话", "资源", "成果"].includes(view) && state?.root) void act(async () => {
      const records = (await call({ type: "productRecords" })) as ProductRecordsView;
      if (!disposed) setProductRecords(records);
    });
    return () => { disposed = true; };
  }, [act, call, state, view]);
  const loadDecisionCenter = useCallback(async () => {
    if (!state?.root) {
      setDecisionCenter(undefined);
      return;
    }
    await act(async () => {
      setDecisionCenter((await call({ type: "decisionCenter" })) as DecisionCenterView);
    });
  }, [act, call, state?.root]);
  const createDecision = useCallback(async (input: Extract<Request, { type: "decisionCreate" }>['decision']) => {
    return Boolean(await act(async () => {
      await call({ type: "decisionCreate", decision: input });
      setNotice("待确认记录已保存，可在后续会话和交付检查中继续引用。");
      await loadDecisionCenter();
      return true;
    }));
  }, [act, call, loadDecisionCenter]);
  const transitionDecision = useCallback(async (id: string, status: DecisionStatus) => {
    await act(async () => {
      await call({ type: "decisionTransition", id, status, actor: status === "confirmed" ? "当前用户" : undefined });
      setNotice(status === "confirmed" ? "记录已确认" : status === "rejected" ? "记录已否决" : "记录状态已更新");
      await loadDecisionCenter();
    });
  }, [act, call, loadDecisionCenter]);
  const transitionReviewIssue = useCallback(async (reviewId: string, issueId: string, status: "open" | "accepted" | "rejected" | "needs_clarification" | "resolved", details?: { clarificationQuestion?: string; resolution?: string; note?: string }) => {
    return Boolean(await act(async () => {
      const current = productRecords?.revision;
      await call({ type: "reviewIssueTransition", reviewId, issueId, status, ...details, expectedRevision: current });
      setNotice(status === "resolved" ? "评审问题已解决" : status === "rejected" ? "评审问题已拒绝" : status === "accepted" ? "评审问题已接受" : "评审问题已标记为待澄清");
      if (state?.root) setProductRecords((await call({ type: "productRecords" })) as ProductRecordsView);
      return true;
    }));
  }, [act, call, productRecords?.revision, state?.root]);
  useEffect(() => {
    if (view === "会话" || view === "成果") void loadDecisionCenter();
  }, [loadDecisionCenter, view, state]);
  useEffect(() => {
    if (view === "规则与模板" && state?.root)
      void act(async () =>
        setTemplateWorkflow(
          (await call({ type: "templateWorkflow" })) as TemplateWorkflowView,
        ),
      );
  }, [act, call, state, view]);
  useEffect(() => {
    if (!selected || !state?.root) {
      setSelectedArtifactId("");
      return;
    }
    let disposed = false;
    void call({ type: "productRecords" })
      .then((raw) => {
        if (disposed) return;
        const records = raw as ProductRecordsView;
        const artifact = records.artifacts.find(
          (item) => item.mountId === selected.mountId && item.relativePath === selected.path,
        );
        setSelectedArtifactId(artifact?.id || "");
      })
      .catch(() => {
        if (!disposed) setSelectedArtifactId("");
      });
    return () => {
      disposed = true;
    };
  }, [call, selected?.mountId, selected?.path, state?.root]);
  const current = state?.conversations.find(
    (item) => item.id === conversationId,
  );
  const captureMessageDecision = useCallback(async (messageText: string, index: number) => {
    if (!conversationId) return;
    await act(async () => {
      const firstLine = messageText.split(/\r?\n/).map((line) => line.trim()).find(Boolean) || "会话消息";
      await call({
        type: "decisionCreate",
        decision: {
          kind: "decision",
          title: `待确认：${firstLine.slice(0, 120)}`,
          description: messageText.slice(0, 20_000),
          sourceRefs: [{ kind: "conversation", id: conversationId, label: `${current?.title || "当前会话"} · 第 ${index + 1} 条消息` }],
          requirementIds: [],
          artifactIds: [],
          conversationIds: [conversationId],
          impact: "待确认该消息对需求、成果和交付范围的影响。",
          nextAction: "在当前会话补充影响范围并确认下一步。",
        },
      });
      setMessageMenu(undefined);
      setNotice("消息已加入当前会话的待确认记录");
      await loadDecisionCenter();
    });
  }, [act, call, conversationId, current?.title, loadDecisionCenter]);
  const workspaceName = state?.root
    ? state.root.split(/[\\/]/).pop() || state.root
    : "默认项目";
  const activeProject: SidebarProject =
    projects.find((item) => item.id === projectId) ||
    projects.find((item) => item.isDefault) ||
    (projectId
      ? { id: projectId, name: projectId }
      : { id: "default", name: workspaceName, isDefault: true });
  useEffect(() => {
    if (projectId) localStorage.setItem("slash:current-project", projectId);
  }, [projectId]);
  useEffect(() => {
    if (!activeProject.id || activeProject.id === "default") {
      setProjectEntries([]);
      return;
    }
    // Loading navigation metadata must not call `project`: that IPC switches
    // the workspace and can reopen a stale renderer-local project on reload.
    const source = projects.find((item) => item.id === activeProject.id);
    if (!source) { setProjectEntries([]); return; }
      const entries: ProjectEntry[] = [];
      const add = (items: unknown, kind: ProjectEntry["kind"]) => {
        if (!Array.isArray(items)) return;
        items.forEach((item, index) => {
          const itemRecord = record(item);
          const path = String(itemRecord?.path || itemRecord?.relativePath || item || "");
          if (!path) return;
          entries.push({
            id: String(itemRecord?.id || `${kind}-${index}-${path}`),
            label: String(itemRecord?.title || itemRecord?.name || path.split(/[\\/]/).pop() || path),
            kind,
            path,
          });
        });
      };
      add(source.resources || source.files, "resource");
      add(source.artifacts || source.outputs, "artifact");
      setProjectEntries(entries);
  }, [activeProject.id, projects]);
  const runs =
    state?.runs.filter((run) => run.conversationId === conversationId) || [];
  const active = runs.find((run) =>
    ["queued", "running", "waiting_user", "cancelling", "validating"].includes(run.status),
  );
  const runStatusLabel = (status?: string) => ({queued:"排队中",running:"进行中",waiting_user:"等待确认",awaiting_plan:"等待方案确认",cancelling:"正在取消",cancelled:"已取消",interrupted:"已中断",validating:"检查中",succeeded:"执行完成",failed:"执行失败"}[status || ""] || "就绪");
  const pendingConversationChanges = state?.changes.filter(change => change.status === "pending" && runs.some(run => run.id === change.runId)).length || 0;
  const conversationStatus = active ? runStatusLabel(active.status) : `${runStatusLabel(runs[0]?.status)}${runs[0]?.status === "succeeded" && pendingConversationChanges ? ` · ${pendingConversationChanges} 份草稿待应用` : ""}`;
  const currentRun = runs.find(run=>run.mode==='plan'&&run.proposal?.status==='pending') || runs[0];
  const historyAnchors = runHistoryAnchors(current?.messages || [], runs, { activeRunId: active?.id, currentRunId: currentRun?.id });
  const lastAssistantIndex =
    current?.messages.reduce(
      (latest, message, index) =>
        message.role === "assistant" ? index : latest,
      -1,
    ) ?? -1;
  const activeText = active ? stream[active.id] || "" : "";
  const messagesRef = useRef<HTMLDivElement>(null);
  const activeMessageRef = useRef<HTMLElement>(null);
  const followOutputRef = useRef(true);
  const followFrameRef = useRef<number | null>(null);
  const autoScrollTopRef = useRef<number | null>(null);
  const outputScrollTarget = useCallback(() => {
    const container = messagesRef.current;
    const message = activeMessageRef.current;
    if (!container || !message) return null;
    const distance = message.getBoundingClientRect().bottom - container.getBoundingClientRect().bottom + 12;
    return Math.max(0, Math.min(container.scrollHeight - container.clientHeight, container.scrollTop + distance));
  }, []);
  const followOutput = useCallback(() => {
    if (!followOutputRef.current || followFrameRef.current !== null) return;
    followFrameRef.current = window.requestAnimationFrame(() => {
      followFrameRef.current = null;
      if (!followOutputRef.current) return;
      const target = outputScrollTarget();
      const container = messagesRef.current;
      if (target === null || !container) return;
      autoScrollTopRef.current = target;
      container.scrollTop = target;
    });
  }, [outputScrollTarget]);
  useLayoutEffect(() => {
    if (followFrameRef.current !== null) window.cancelAnimationFrame(followFrameRef.current);
    followFrameRef.current = null;
    autoScrollTopRef.current = null;
    followOutputRef.current = true;
    if (view === "会话" && active) followOutput();
    return () => {
      if (followFrameRef.current !== null) window.cancelAnimationFrame(followFrameRef.current);
      followFrameRef.current = null;
    };
  }, [conversationId, active?.id, view, followOutput]);
  useLayoutEffect(() => {
    if (view === "会话" && (active || current?.messages.length)) followOutput();
  }, [activeText, active?.id, current?.messages.length, view, followOutput]);
  useEffect(() => {
    const container = messagesRef.current;
    const message = activeMessageRef.current;
    if (view !== "会话" || !active || !container || !message) return;
    const observer = new ResizeObserver(followOutput);
    observer.observe(container);
    observer.observe(message);
    return () => observer.disconnect();
  }, [active?.id, conversationId, view, followOutput]);
  const onMessagesScroll = () => {
    if (!active) return;
    const container = messagesRef.current;
    const target = outputScrollTarget();
    if (!container || target === null) return;
    if (autoScrollTopRef.current !== null && Math.abs(container.scrollTop - autoScrollTopRef.current) <= 2) {
      autoScrollTopRef.current = null;
      return;
    }
    const atMessageEnd = Math.abs(container.scrollTop - target) <= 4;
    const atContainerEnd = container.scrollTop + container.clientHeight >= container.scrollHeight - 8;
    followOutputRef.current = atMessageEnd || atContainerEnd;
  };
  const ensureConversation = async () => {
    if (conversationId) return conversationId;
    const id = (await call({ type: "conversation" })) as string;
    setConversationId(id);
    return id;
  };
  const importProjectFiles = async (items: File[], category: ImportCategory = "resource") => {
    if (!items.length) return;
    setImportBusy(true);
    try {
      const pathForFile = (
        window.pm as unknown as {
          pathForFile?: (file: File) => string | Promise<string>;
        }
      ).pathForFile;
      if (!pathForFile) {
        setNotice("当前版本暂不支持拖拽导入，请使用“添加参考目录”。");
        return;
      }
      const paths = (await Promise.all(items.map((item) => pathForFile(item))))
        .map((item) => String(item || ""))
        .filter(Boolean);
      if (!paths.length) {
        setNotice("没有读取到可导入的文件路径。");
        return;
      }
      const grouped = new Map<ImportCategory, string[]>();
      paths.forEach((filePath) => {
        const target: ImportCategory =
          category === "output" && /\.html?$/i.test(filePath)
            ? "prototype"
            : category;
        grouped.set(target, [...(grouped.get(target) || []), filePath]);
      });
      let imported = 0;
      const importTarget = ["资源", "成果"].includes(view) ? folderMountId ? { mountId: folderMountId, path: folderPath } : browserScope ? { mountId: browserScope.mountId, path: browserScope.prefix } : undefined : undefined;
      for (const [target, targetPaths] of grouped) {
        const result = await futureRequest({
          type: "importFiles",
          files: targetPaths,
          category: target,
          target: importTarget,
        });
        if (result === undefined) {
          setNotice("导入接口暂不可用，请先检查当前项目目录权限。");
          return;
        }
        imported += targetPaths.length;
      }
      if (!imported) {
        setNotice("导入接口暂不可用，请先添加参考目录。");
        return;
      }
      setNotice(`已将 ${imported} 个文件加入当前项目`);
      await loadProjects();
      await loadFiles();
    } catch (reason) {
      setNotice(`文件导入失败：${reason instanceof Error ? reason.message : String(reason)}`);
    } finally {
      setImportBusy(false);
    }
  };
  const newChat = async () => {
    const id = (await call({ type: "conversation" })) as string;
    setConversationId(id);
    setView("会话");
    setDraft("");
    setWorkflowKind(undefined);
    setWorkflowSources(undefined);
    setReferenceAttachments([]);
    setImageAttachment(undefined);
  };
  const attachImage = (file?: File) => {
    if (!file || !/^image\/(png|jpe?g|webp|gif)$/i.test(file.type)) { setError("请拖入 PNG、JPEG、WEBP 或 GIF 图片"); return; }
    const localPath = window.pm.pathForFile?.(file);
    if (!localPath) { setError("当前环境无法读取图片路径"); return; }
    setImageAttachment({ path: localPath, name: file.name || "图片" });
    setNotice("图片已加入当前任务，发送时会由视觉模型生成结构化证据");
  };
  const openReferencePicker = async () => {
    setReferencePickerOpen(true);
    try {
      // Refresh the authorized file list when the picker opens so the chooser
      // does not rely on whichever resource page happened to be visited last.
      await loadFiles("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  };
  const chooseWorkflow = (kind: PmWorkflowKind, sources?: PmWorkflowSource[], intent?: string) => {
    setWorkflowKind(kind);
    setWorkflowSources(sources);
    if (sources) setReferenceAttachments(previous => [...previous, ...sources.map(source => ({ mountId: source.mountId, path: source.path, size: 0 }))].filter((file, i, all) => all.findIndex(other => other.mountId === file.mountId && other.path === file.path) === i));
    setDraft(previous => appendComposerPreset(previous, intent || pmWorkflows[kind].intent));
    setView("会话");
    setNotice("提示词已加入输入区；可直接编辑，或移除任务上下文。");
    if (["meeting", "prototype_to_prd"].includes(kind) && !sources?.length && !referenceAttachments.length) void openReferencePicker();
  };
  const send = async () => {
    if(active){
      if(busy||!draft.trim())return;
      if(imageAttachment||referenceAttachments.length||workflowKind){setNotice('本轮补充仅支持文字；请移除新附件或任务上下文，或等待本轮结束后另发任务。');return;}
      if(!['queued','running','waiting_user'].includes(active.status)){setNotice('本轮正在收尾或取消，请等待结束后另发任务。');return;}
      setBusy(true);setError('');
      const previous=inputRequest.current;
      const request=previous&&previous.runId===active.id&&previous.text===draft&&previous.delivery===inputDelivery?previous:{runId:active.id,text:draft,delivery:inputDelivery,requestId:crypto.randomUUID()};inputRequest.current=request;
      try{await call({type:'runInputEnqueue',...request});inputRequest.current=undefined;setDraft('');setNotice('补充已加入本轮，沿用本轮模式、权限与模型；运行记录会显示实际送达状态。');}
      catch(reason){setError(reason instanceof Error?reason.message:String(reason));}finally{setBusy(false);}return;
    }
    if (!draft.trim() || busy) return;
    if (thinkingLoading && (thinkingDirty || thinkingLevel)) { setNotice("正在确认思考档位，请稍后发送。");return; }
    const parts = draft.trim().split(/\s+/);
    const { command, kind, taskType } = resolveComposerIntent({ draft, workflowKind, view });
    const commandText: Record<string, string> = { "/plan": "请先研究相关资料并生成可确认的执行方案。", "/research": "请检索已授权资料并整理证据。", "/prd": "请按当前 PRD 模板生成结构化产品需求文档。", "/prototype": "请生成或修改 HTML 交互原型。", "/review": "请对当前成果执行质量检查并发起评审。", "/help": "请说明当前会话可用的 Slash 命令和操作方式。" };
    if (command === "/plan") setAgentMode("plan");
    const requestText = commandText[command] ? `${commandText[command]}${parts.slice(1).join(" ") ? `\n补充要求：${parts.slice(1).join(" ")}` : ""}` : draft.trim();
    const sources = workflowSources || referenceAttachments.map(({ mountId, path }) => ({ mountId, path }));
    if (kind && ["meeting", "prototype_to_prd"].includes(kind) && !sources.length) { setError("请先选择实际来源资料，再发送任务。"); await openReferencePicker(); return; }
    if (kind === "change_summary" && sources.length !== 2) { setError("请从成果预览的版本差异中选择旧版与当前版，再生成变更说明。"); return; }
    setBusy(true);
    setError("");
    try {
      const id = await ensureConversation();
      const referenceText = !kind && referenceAttachments.length
        ? `\n\n引用资料（发送时按当前已授权版本读取）：\n${referenceAttachments.map((file) => `- mountId=${file.mountId} · ${file.path}`).join("\n")}`
        : "";
      let finalText = `${requestText}${referenceText}`;
      let attachmentIds: string[] | undefined;
      if (imageAttachment) {
        setVisionBusy(true);
        const attachment = await call({ type: "visionAttach", path: imageAttachment.path }) as { id: string };
        attachmentIds = [attachment.id];
      }
      await call({ type: "send", id, text: finalText, mode: command === "/plan" ? "plan" : agentMode, permissionMode, modelEntryId: modelEntryId || undefined, thinkingLevel: thinkingLoading ? undefined : thinkingLevel, taskType, attachmentIds, workflow: kind ? { kind, sources } : undefined });
      setDraft("");
      setImageAttachment(undefined);
      setReferenceAttachments([]);
      setReferencePickerOpen(false);
      setWorkflowKind(undefined);
      setWorkflowSources(undefined);
      setView("会话");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setVisionBusy(false);
      setBusy(false);
    }
  };
  const slashCommands = [
    ["/plan", "先研究并生成执行方案"],
    ["/research", "检索已授权资料并整理证据"],
    ["/prd", "按模板生成结构化 PRD"],
    ["/prototype", "生成或修改 HTML 交互原型"],
    ["/review", "发起成果质量和评审检查"],
    ["/help", "查看可用命令和当前权限"],
  ] as const;
  const matchingSlashCommands = slashCommands.filter(([command]) => command.startsWith(draft.trim().split(/\s+/)[0] || "/"));
  const savePlanDraft = async (runId:string, ids:string[], customText:string) => { try { await call({type:"planDraft",id:runId,selectedOptionIds:ids,customText}); } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); } };
  const confirmPlan = async (runId:string, ids:string[], customText:string) => { if(thinkingLoading && (thinkingDirty || thinkingLevel)){setNotice("正在确认思考档位，请稍后确认方案。");return;} setBusy(true); setError(""); try { await call({type:"planConfirm",id:runId,selectedOptionIds:ids,customText,permissionMode,modelEntryId:modelEntryId || undefined,thinkingLevel:planThinkingOverride(thinkingLevel,thinkingDirty)}); setAgentMode("build"); await refresh(); } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); } finally { setBusy(false); } };
  const resumeRun = async (runId: string) => {
    setBusy(true);
    setError("");
    try {
      await call({ type: "resume", id: runId });
      setNotice("已创建继续任务，正在从上次会话上下文恢复");
      await refresh();
      setView("会话");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  };
  const openFile = async (file: FileRef) => {
    const workspace = currentWorkspaceRef.current;
    const protection = (await call({ type: "fileProtection", mountId: file.mountId, path: file.path })) as { referenceProtected: boolean };
    if (currentWorkspaceRef.current !== workspace) return;
    setSelected({ ...file, referenceProtected: protection.referenceProtected });
    setSelection(undefined);
    setVersionLabel("");
    setVersions([]);
    setFlowView(undefined);
    if (/\.html?$/i.test(file.path)) {
      setDocumentView(undefined);
      const value = (await call({
          type: "preview",
          mountId: file.mountId,
          path: file.path,
        })) as PreviewHandle;
      if (currentWorkspaceRef.current === workspace) setPreview(value);
    } else if (/\.(?:drawio|xml)$/i.test(file.path)) {
      setDocumentView(undefined);
      setPreview(undefined);
      const value = (await call({
          type: "flowPreview",
          mountId: file.mountId,
          path: file.path,
        })) as FlowPreview;
      if (currentWorkspaceRef.current === workspace) setFlowView(value);
    } else {
      setPreview(undefined);
      const value = (await call({
          type: "readDocument",
          mountId: file.mountId,
          path: file.path,
        })) as DocumentContent;
      if (currentWorkspaceRef.current === workspace) setDocumentView(value);
    }
    if (currentWorkspaceRef.current === workspace) clearProcessingPreviewNotice();
  };
  const referenceSelected = () => {
    if (!selected) return;
    const suffix = selection
      ? `\n选中范围：${selection.locator}\n版本：${selection.version}\n引用内容：\n${selection.text}\n`
      : `\n参考文件（mountId=${selected.mountId}，版本=${documentView?.version || preview?.version || flowView?.version || "读取时版本"}）：${selected.path}\n`;
    setDraft((previous) => (previous.trimEnd() + suffix).trimStart());
    setReferenceAttachments(current => current.some(file => file.mountId === selected.mountId && file.path === selected.path) ? current : [...current, selected]);
    if (workflowKind !== "change_summary") setWorkflowSources(undefined);
    setView("会话");
  };
  const referenceProjectFile = async (file: ProjectFileRef) => {
    await act(async () => {
      if (file.projectId !== projectId && file.projectId !== activeProject.id) {
        const result = await call({type:"project",id:file.projectId}) as {currentProjectId:string};
        setProjectId(result.currentProjectId||file.projectId);
        setSelected(undefined);setDocumentView(undefined);setPreview(undefined);setFlowView(undefined);
        setProductRecords(undefined);setDecisionCenter(undefined);setWorkflowKind(undefined);setWorkflowSources(undefined);setImageAttachment(undefined);
        await refresh();await loadProjects();
        const id = await call({type:"conversation",title:`引用 ${file.path.split(/[\\/]/).pop()}`}) as string;
        setConversationId(id);setReferenceAttachments([file]);setDraft(`请参考文件（mountId=${file.mountId}）：${file.path}\n`);
      } else {
        setReferenceAttachments(current=>current.some(item=>item.mountId===file.mountId&&item.path===file.path)?current:[...current,file]);
        setDraft(previous=>(previous+`\n参考文件（mountId=${file.mountId}）：${file.path}\n`).trimStart());
        if(workflowKind!=="change_summary")setWorkflowSources(undefined);
      }
      setView("会话");setSettingsOpen(false);
    });
  };
  const loadVersions = async () => {
    if (selected)
      setVersions(
        (await call({
          type: "versions",
          mountId: selected.mountId,
          path: selected.path,
        })) as VersionSummary[],
      );
  };
  const openVersion = async (id: string) => {
    if (!selected) return;
    const item = (await call({
      type: "versionContent",
      mountId: selected.mountId,
      path: selected.path,
      versionId: id,
    })) as { content: string; summary: VersionSummary };
    setPreview(undefined);
    setDocumentView({
      content: item.content,
      version: item.summary.contentHash,
      format: /\.md$/i.test(selected.path) ? "markdown" : "text",
    });
    setVersionLabel(
      item.summary.label +
        " · " +
        new Date(item.summary.createdAt).toLocaleString(),
    );
  };
  const restoreVersion = async (id: string) => {
    if (!selected) return;
    if (selected.referenceProtected) { setNotice("参考原件只读，请先创建处理副本。"); return; }
    const cid = await ensureConversation();
    await call({
      type: "restore",
      mountId: selected.mountId,
      path: selected.path,
      versionId: id,
      conversationId: cid,
    });
    setNotice("已在会话中准备恢复草稿，应用后会形成新版本");
    setView("会话");
  };
  const createProcessingCopy = async (file: FileRef) => {
    const workspace = state?.root;
    setProcessingBusy(true);
    try {
      const copy = (await call({ type: "copyForProcessing", mountId: file.mountId, path: file.path })) as ProcessingCopy;
      if (currentWorkspaceRef.current !== workspace) return;
      const target = { ...copy.copy, size: copy.size };
      setReferenceAttachments(current => current.some(item => item.mountId === target.mountId && item.path === target.path) ? current : [...current, target]);
      setDraft(previous => (previous + `\n处理副本（copyId=${copy.id}，mountId=${target.mountId}）：${target.path}\n转换或脚本仅处理这个副本，保留参考原件。\n`).trimStart());
      setWorkflowKind(undefined);
      setWorkflowSources(undefined);
      setView("会话");
      setNotice("已创建处理副本并加入会话；参考原件保留。");
      setSelected(undefined);setDocumentView(undefined);setPreview(undefined);setFlowView(undefined);setSelection(undefined);setVersions([]);setVersionLabel("");
      await loadFiles().catch(() => {});
      if (currentWorkspaceRef.current !== workspace) return;
      try {
        await openFile(target);
        if (currentWorkspaceRef.current !== workspace) return;
      } catch {
        if (currentWorkspaceRef.current !== workspace) return;
        setSelected(undefined);setDocumentView(undefined);setPreview(undefined);setFlowView(undefined);
        setNotice(PROCESSING_PREVIEW_UNAVAILABLE_NOTICE);
      }
    } finally { setProcessingBusy(false); }
  };
  const prefill = (text: string) => {
    setDraft(text);
    setWorkflowKind(undefined);
    setWorkflowSources(undefined);
    setView("会话");
  };
  const visibleConversations: ConversationItem[] =
    state?.conversations
      .filter(
        (item) =>
          item.archived === showArchived &&
          item.title.toLowerCase().includes(conversationQuery.toLowerCase()),
      )
      .map((item) => {
        const value = item as typeof item & {
          projectId?: string;
          projectName?: string;
        };
        return {
          id: item.id,
          title: item.title,
          archived: item.archived,
          projectId: value.projectId,
          projectName: value.projectName,
        };
      }) || [];
  const appliedTree = browserTree(projectTree && projectTree.root === state?.root ? projectTree.appliedNodes : []);
  const browserRoots = appliedTree.filter(item => item.node.role === (view === "成果" ? "output" : "resource"));
  const browserOptions = browserRoots.flatMap(item => item.children);
  const browserSelection = browserOptions.find(item => item.node.id === browserTab);
  const browserScope = browserSelection?.children.find(item => item.node.id === browserSubtab) || browserSelection;
  const changeBrowserTab = (id: string, sub = false) => {
    if (sub) setBrowserSubtab(id);else { setBrowserTab(id);setBrowserSubtab(""); }
    setFolderMountId("");setFolderPath("");
  };
  const isResultFile = (file: FileRef) => {
    const role = fileTreeRole(file, appliedTree) || projectTree?.mountRoles?.[file.mountId];
    if (role) return role === "output";
    const artifact = productRecords?.artifacts.find(item => item.mountId === file.mountId && item.relativePath === file.path);
    if (artifact?.kind && ["reference", "knowledge", "template"].includes(artifact.kind)) return false;
    if (artifact?.kind && ["document", "prototype", "flow"].includes(artifact.kind)) return true;
    const mount = state?.mounts.find(item => item.id === file.mountId)?.name || "";
    return ["原型", "产出材料", "成果"].includes(mount);
  };
  const registeredResultFiles: FileRef[] = (productRecords?.artifacts || [])
    .filter(artifact => ["document", "prototype", "flow"].includes(artifact.kind || "") && state?.mounts.some(mount => mount.id === artifact.mountId && mount.enabled) && (!query.trim() || `${artifact.relativePath} ${artifact.title}`.toLowerCase().includes(query.trim().toLowerCase())))
    .map(artifact => ({ mountId: artifact.mountId, path: artifact.relativePath, size: 0 }));
  const allFiles = [...files, ...registeredResultFiles].filter((file, index, collection) => collection.findIndex(other => other.mountId === file.mountId && other.path === file.path) === index);
  const filteredFiles = allFiles.filter(file => {
    if (["资源", "成果"].includes(view) && browserScope && !fileInBrowserNode(file, browserScope)) return false;
    if (view === "资源") return !isResultFile(file);
    if (view === "成果") return isResultFile(file);
    if (view === "规则与模板") return /(^|[\\/])skills([\\/]|$)|AGENTS\.md|模板|界面规范|流程图规范|规则/i.test(file.path);
    return true;
  });
  const detailsFiles = allFiles.filter(file => detailsTab !== "artifacts" || isResultFile(file));
  const folderView = [
    "资源",
    "成果",
    "规则与模板",
  ].includes(view);
  const visibleFiles = folderMountId
    ? filteredFiles.filter((file) => file.mountId === folderMountId && (!folderPath || file.path.replace(/\\/g, "/").toLowerCase().startsWith(folderPath.toLowerCase() + "/")))
    : filteredFiles;
  const treeDirectories = browserScope ? browserScope.children : browserRoots.flatMap(item => item.children.length ? item.children : [item]);
  const directoryEntries = treeDirectories.flatMap(item => {
    const mount = state?.mounts.find(mount => mount.id === item.mountId && mount.enabled);
    return mount ? [{ mount, name: item.node.name, prefix: item.prefix, id: item.node.id }] : [];
  });
  if (!browserScope) for (const directory of preservedBrowserDirectories(projectTree?.preservedDirectories || [], browserRoots)) {
    const mount = state?.mounts.find(mount => mount.id === directory.mountId && mount.enabled);
    if (mount) directoryEntries.push({ ...directory, mount });
  }
  const oldDirectories = browserScope ? [] : (state?.mounts || []).filter(mount => mount.enabled && !browserRoots.some(item => item.mountId === mount.id) && (view === "成果" ? isResultFile({ mountId: mount.id, path: "", size: 0 }) || filteredFiles.some(file => file.mountId === mount.id) : !isResultFile({ mountId: mount.id, path: "", size: 0 }))).map(mount => ({ mount, name: mount.name, prefix: "", id: mount.id }));
  const folderGroups = [...directoryEntries, ...oldDirectories].map(({ mount, name, prefix, id }) => {
      const mountFiles = filteredFiles.filter(file => file.mountId === mount.id && (!prefix || file.path.replace(/\\/g, "/").toLowerCase().startsWith(prefix.toLowerCase() + "/")));
      const extensions = Array.from(
        new Set(
          mountFiles
            .map((file) => file.path.split(".").pop()?.toLowerCase() || "")
            .filter((value) => value.length > 0 && value.length <= 5),
        ),
      ).slice(0, 3);
      return {
        mount,
        name, prefix, id,
        count: mountFiles.length,
        summary: extensions
          .map((value) => folderTypeLabels[value] || value.toUpperCase())
          .join(" · "),
      };
    });
  const folderMenuFile = folderMenu ? folderMenu.file || files.find(file => file.mountId === folderMenu.mountId && file.path === folderMenu.path) : undefined;
  useEffect(() => {
    let disposed = false;
    setBrowserReferenceProtected(false);
    const target = folderMountId ? { mountId: folderMountId, path: folderPath } : browserScope ? { mountId: browserScope.mountId, path: browserScope.prefix } : undefined;
    if (["资源", "成果"].includes(view) && target) {
      void call({ type: "fileProtection", ...target }).then(raw => { if (!disposed) setBrowserReferenceProtected(Boolean((raw as { referenceProtected: boolean }).referenceProtected)); }).catch(() => {});
    }
    return () => { disposed = true; };
  }, [view, state?.root, folderMountId, folderPath, browserScope?.mountId, browserScope?.prefix, fileMountSignature, call]);
  const openFolderMenu = (event: React.MouseEvent, mountId: string, path = ".", file?: FileRef) => {
    event.preventDefault();
    setFolderMenu({
      mountId,
      path,
      file,
      x: event.clientX,
      y: event.clientY,
    });
  };
  useEffect(() => {
    if (!folderMenu) return;
    const close = () => setFolderMenu(undefined);
    window.addEventListener("click", close);
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", keydown);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("keydown", keydown);
    };
  }, [folderMenu]);
  useEffect(() => {
    if (!messageMenu) return;
    const close = () => setMessageMenu(undefined);
    const keydown = (event: KeyboardEvent) => { if (event.key === "Escape") close(); };
    window.addEventListener("click", close);
    window.addEventListener("keydown", keydown);
    return () => { window.removeEventListener("click", close); window.removeEventListener("keydown", keydown); };
  }, [messageMenu]);
  useEffect(() => { setFolderMountId("");setFolderPath("");setBrowserTab("");setBrowserSubtab(""); }, [view]);
  useEffect(() => setMessageMenu(undefined), [conversationId]);
  const approveProposal = async (proposal: ExternalActionProposal) => {
    const result = (await call({
      type: "externalAction",
      id: proposal.id,
      decision: "approve",
    })) as ExternalActionProposal;
    setNotice(
      result.status === "succeeded"
        ? "外部操作已确认成功"
        : result.status === "outcome_unknown"
          ? "外部操作结果待核对，请勿重复执行"
          : result.diagnostic || "外部操作已处理",
    );
    await refresh();
    setProposals(
      (await call({
        type: "externalActions",
        conversationId,
      })) as ExternalActionProposal[],
    );
  };
  const rejectProposal = async (proposal: ExternalActionProposal) => {
    await call({
      type: "externalAction",
      id: proposal.id,
      decision: "reject",
      reason: "用户在桌面工作台拒绝",
    });
    setProposals(
      (await call({
        type: "externalActions",
        conversationId,
      })) as ExternalActionProposal[],
    );
  };
  const resolveToolApproval = async (
    id: string,
    decision: "allow_once" | "allow" | "deny",
  ) => {
    if (approvalResolving.current.has(id)) return;
    approvalResolving.current.add(id);
    setApprovalBusyIds([...approvalResolving.current]);
    try {
      const result = await call({ type: "approvalResolve", id, decision }) as ApprovalResolutionResult;
      setNotice(approvalResolutionNotice(result));
    } finally {
      try { await refresh(); } finally { approvalResolving.current.delete(id);setApprovalBusyIds([...approvalResolving.current]); }
    }
  };
  const applyMigrationGroup = async (id: string) => {
    await call({ type: "applyTemplateMigrationGroup", id });
    setTemplateWorkflow(
      (await call({ type: "templateWorkflow" })) as TemplateWorkflowView,
    );
    setNotice("模板迁移草稿组已提交，并为每个文件保留版本");
  };
  const applyRulesDraft = async (id: string) => {
    await call({ type: "applyWorkspaceRuleChange", id });
    setTemplateWorkflow(
      (await call({ type: "templateWorkflow" })) as TemplateWorkflowView,
    );
    setNotice("工作空间规则草稿已应用并保留历史版本");
  };
  const closePreview = () => {
    setSelected(undefined);
    setSelection(undefined);
    setFlowView(undefined);
  };
  const viewChange = (change: Change) => {
    setSelected({ mountId: change.mountId, path: change.path, size: change.content.length, referenceProtected: files.find(file => file.mountId === change.mountId && file.path === change.path)?.referenceProtected });
    setPreview(undefined);
    setDocumentView({ content: change.content, version: change.id, format: /\.md$/i.test(change.path) ? "markdown" : "text" });
    setVersionLabel(change.status === "applied" ? "已保存版本" : change.status === "pending" ? "变更草稿" : "文件冲突，未提交");
    clearProcessingPreviewNotice();
  };
  const revealChange = (change: Change) => void act(async () => {
    const result = await call({ type: "changeReveal", id: change.id }) as { fileExists: boolean; notice?: string };
    setNotice(result.notice || "已在资源管理器中定位文件。");
  });
  const renderPreview =
    selected &&
    (flowView ? (
      <FlowPreviewPane
        file={selected}
        value={flowView}
        onClose={closePreview}
        onReference={referenceSelected}
        onProcessingCopy={selected.referenceProtected ? () => void act(() => createProcessingCopy(selected)) : undefined}
        processingBusy={processingBusy}
        onReveal={() =>
          void act(() =>
            call({
              type: "reveal",
              mountId: selected.mountId,
              path: selected.path,
            }),
          )
        }
      />
    ) : (
      <PreviewPane
        file={selected}
        artifactId={selectedArtifactId || undefined}
        documentView={documentView}
        preview={preview}
        selection={selection}
        onSelection={setSelection}
        onClose={closePreview}
        onReference={referenceSelected}
        onReveal={() =>
          void act(() =>
            call({
              type: "reveal",
              mountId: selected.mountId,
              path: selected.path,
            }),
          )
        }
        onWorkflow={chooseWorkflow}
        onContinue={prefill}
        mode={agentMode}
        acceptanceAccessKey={JSON.stringify([state?.root, state?.permissions, state?.mounts.map(m => [m.id, m.path, m.enabled, m.write])])}
        onExport={(format) =>
          void act(async () => {
            const result = (await call({
              type: "export",
              mountId: selected.mountId,
              path: selected.path,
              format,
            })) as { path: string; report?: { notice?: string } } | null;
            if (result) setNotice("已导出至 " + result.path + (result.report?.notice ? " · " + result.report.notice : ""));
          })
        }
        onVersions={() => void act(loadVersions)}
        onOpenVersion={(id) => void act(() => openVersion(id))}
        onRestore={(id) => void act(() => restoreVersion(id))}
        onProcessingCopy={selected.referenceProtected ? () => void act(() => createProcessingCopy(selected)) : undefined}
        processingBusy={processingBusy}
        versions={versions}
        versionLabel={versionLabel}
        connections={state?.connections || []}
        call={call}
      />
    ));

  const workIssues = (inConversation: boolean, expanded = false) => <WorkIssues expanded={expanded} key={`${state?.root}:${inConversation ? conversationId : selectedArtifactId}`} records={productRecords} decisions={decisionCenter} conversationId={inConversation ? conversationId || undefined : undefined} artifactId={inConversation ? undefined : selectedArtifactId || undefined} artifactFile={inConversation ? undefined : selected} businessAccessKey={JSON.stringify([state?.permissions, state?.mounts.map(m => [m.id, m.path, m.enabled, m.write])])} runIds={inConversation ? runs.map(run => run.id) : []} onContinue={prefill} onOpen={file => void act(() => openFile(file))} onRefresh={() => void act(async () => { setProductRecords((await call({ type: "productRecords" })) as ProductRecordsView); await loadDecisionCenter(); })} onDecision={(id,status) => void transitionDecision(id,status)} onReview={transitionReviewIssue} onBusinessCheck={async input => (await call({ type: "businessRuleCheck", ...input })) as BusinessRuleCheckView} onCreate={createDecision} onAnswer={async (requirementId, questionId, answer) => Boolean(await act(async () => { const cid = await ensureConversation(); await call({ type: "requirementQuestionAnswer", requirementId, conversationId: cid, answers: [{ questionId, answer }], expectedRevision: productRecords?.revision }); setProductRecords((await call({ type: "productRecords" })) as ProductRecordsView); await loadDecisionCenter(); setNotice("答复已保存到需求记录与会话，问题标记为已答复。"); return true; }))} />;
  const replyKey = (message: State["conversations"][number]["messages"][number], index: number) => message.runId ? `run:${message.runId}:${current?.messages.slice(0,index).filter(item=>item.role === "assistant" && item.runId === message.runId).length || 0}` : `legacy:${message.time}:${index}`;
  const replyDetails = (message: State["conversations"][number]["messages"][number], run: Run | undefined, key: string, streaming = false) => <ReplyDetails key={`${state?.root}:${conversationId}:${key}`} message={message} run={run} streaming={streaming} state={replyPanels[key] || {execution:false,records:false}} onToggle={panel=>setReplyPanels(previous=>{const value=previous[key]||{execution:false,records:false};return {...previous,[key]:{...value,[panel]:!value[panel]}};})} call={call} execution={checkpoint=><RunPlanCard run={run!} pendingChanges={state?.changes.filter(change=>change.runId===run?.id&&change.status==="pending").length||0} checkpoint={checkpoint} onResume={run?.resumable?()=>void resumeRun(run.id):undefined} onEdit={()=>{if(run?.workflow)chooseWorkflow(run.workflow.kind,run.workflow.sources,run.input);}} onPlanDraft={(ids,text)=>{if(run)void savePlanDraft(run.id,ids,text);}} onPlanConfirm={(ids,text)=>{if(run)void confirmPlan(run.id,ids,text);}}/>} records={workIssues(true,true)}/>;
  const historyAnchorsAt = (index: number) => (historyAnchors.get(index) || []).map(run => <div className="reply-run-anchor" key={run.id}><small>任务记录 · {runStatusLabel(run.status)}{Number.isFinite(Date.parse(run.startedAt)) && <> · <time dateTime={run.startedAt}>{new Date(run.startedAt).toLocaleString()}</time></>}（尚无关联回复）</small>{replyDetails({role:"assistant",text:"",time:run.startedAt,runId:run.id},run,`run:${run.id}:0`)}</div>);

  return (
    <div className={`app ${projectSidebarCollapsed ? "project-sidebar-collapsed" : ""}`} data-theme={theme}>
      <Sidebar
        view={view}
        conversations={visibleConversations}
        conversationId={conversationId}
        conversationQuery={conversationQuery}
        showArchived={showArchived}
        project={activeProject}
        projects={projects.map((item) => ({
          id: item.id,
          name: item.name,
          isDefault: item.isDefault,
          root: item.root || item.path,
          pinned: item.pinned,
          activeRunCount: item.id === projectId ? (state?.runs || []).filter(run => ["queued", "running", "waiting_user", "cancelling", "validating"].includes(run.status)).length : item.activeRunCount,
          conversationCount: Number(item.conversationCount || 0),
          conversations: Array.isArray(item.conversations)
            ? item.conversations
                .map((conversation) => {
                  const value = record(conversation);
                  if (!value) return undefined;
                  return {
                    id: String(value.id || ""),
                    title: String(value.title || "新会话"),
                    archived: Boolean(value.archived),
                  };
                })
                .filter((conversation): conversation is { id: string; title: string; archived: boolean } => Boolean(conversation?.id))
            : [],
        }))}
        projectEntries={projectEntries}
        importBusy={importBusy}
        resourceProjectId={browserProjectId}
        onView={(next) => { setSettingsOpen(false); if (["资源", "成果"].includes(next)) { setBrowserProjectId(undefined);setBrowserNavigationKey(value=>value+1);setSelected(undefined);setPreview(undefined);setDocumentView(undefined);setFlowView(undefined); } setView(next); }}
        onConversation={(id) => {
          setConversationId(id);
          setView("会话");
          setSettingsOpen(false);
        }}
        onConversationRename={(id, title) => void act(async () => { await call({ type: "conversation", id, title }); await refresh(); await loadProjects(); })}
        onConversationArchive={(id, archived) => void act(async () => { await call({ type: "conversation", id, archived }); await refresh(); await loadProjects(); })}
        onConversationQuery={setConversationQuery}
        onToggleArchived={() => setShowArchived((value) => !value)}
        onNew={() => { setSettingsOpen(false); void act(newChat); }}
        onSettings={() => setSettingsOpen(true)}
        onProjectChange={async (id) => {
          await act(async () => {
            const result = await futureRequest(
              id === "__choose__" ? { type: "project" } : { type: "project", id },
            );
            const selectedProject = record(result);
            const nextProjectId =
              typeof selectedProject?.currentProjectId === "string"
                ? selectedProject.currentProjectId
                : "";
            if (id === "__choose__" && !nextProjectId) return;
            setProjectId(id);
            if (nextProjectId) setProjectId(nextProjectId);
            setConversationId("");
            setDraft("");
            setWorkflowKind(undefined);
            setWorkflowSources(undefined);
            setReferenceAttachments([]);
            setImageAttachment(undefined);
            setProductRecords(undefined);
            setDecisionCenter(undefined);
            setSelected(undefined);
            setDocumentView(undefined);
            setPreview(undefined);
            setFlowView(undefined);
            setView("会话");
            await refresh();
            await loadProjects();
          });
        }}
        onProjectView={(kind) => { setSettingsOpen(false); setBrowserProjectId(projectId||activeProject.id);setBrowserNavigationKey(value=>value+1);setView(kind === "resource" ? "资源" : "成果"); }}
        onProjectRename={async (id, name) => { await call({ type: "projectRename", id, name });await loadProjects();setNotice("项目名称已保存，本地文件夹名称保留。"); }}
        onProjectPin={async (id, pinned) => { await act(async () => { await call({ type: "projectPin", id, pinned });await loadProjects(); }); }}
        onProjectReveal={async id => { await act(async () => { await call({ type: "projectReveal", id }); }); }}
        onProjectCopyPath={async id => { await act(async () => { const item=projects.find(project=>project.id===id),projectPath=item?.root || item?.path;if(!projectPath)throw Error("项目路径暂不可用，请重新打开项目。");await navigator.clipboard.writeText(projectPath);setNotice("项目路径已复制。"); }); }}
        onProjectRemove={async id => {
          await call({ type: "projectRemove", id });
          if (id === projectId) { setConversationId("");setDraft("");setWorkflowKind(undefined);setWorkflowSources(undefined);setReferenceAttachments([]);setImageAttachment(undefined);setSelected(undefined);setDocumentView(undefined);setPreview(undefined);setFlowView(undefined);setProductRecords(undefined);setDecisionCenter(undefined);setView("会话"); }
          await refresh();await loadProjects();setNotice("项目已从列表移除，本地文件、会话和版本已保留。");
        }}
        onImportFiles={(items, category) => void act(() => importProjectFiles(items, category))}
        projectSidebarCollapsed={projectSidebarCollapsed}
        onToggleProjectSidebar={() => setProjectSidebarCollapsed(value => !value)}
        settingsOpen={settingsOpen}
      />
      <main className={view === "会话" ? "conversation-main" : ""}>
        <header>
          <div className="header-title">
            <span className="breadcrumb">slash / </span>
            {view === "会话" ? current?.title || "新会话" : view}
          </div>
          <div className="header-actions">
            <button className="header-icon-button" aria-label="打开工作区" title="打开工作区" onClick={() => void act(() => call({ type: "workspace" }))}><Icon name="folder"/></button>
            {view === "会话" && current && (
              <>
                {editingTitle ? (
                  <form
                    onSubmit={(event) => {
                      event.preventDefault();
                      void act(async () => {
                        await call({
                          type: "conversation",
                          id: current.id,
                          title: rename.trim(),
                        });
                        setEditingTitle(false);
                      });
                    }}
                  >
                    <input
                      autoFocus
                      value={rename}
                      onChange={(event) => setRename(event.target.value)}
                    />
                    <button type="submit" disabled={!rename.trim()}>
                      保存
                    </button>
                  </form>
                ) : (
                  <button
                    className="quiet"
                    onClick={() => {
                      setRename(current.title);
                      setEditingTitle(true);
                    }}
                  >
                    重命名
                  </button>
                )}
                <button
                  className="quiet"
                  onClick={() =>
                    void act(async () => {
                      await call({
                        type: "conversation",
                        id: current.id,
                        archived: !current.archived,
                      });
                      setNotice(current.archived ? "会话已恢复" : "会话已归档");
                      setConversationId("");
                    })
                  }
                >
                  {current.archived ? "恢复会话" : "归档"}
                </button>
              </>
            )}
          </div>
        </header>
        {error && (
          <div role="alert" className="alert">
            {error}
            <button onClick={() => setError("")}><Icon name="close" size={15}/></button>
          </div>
        )}
        {notice && (
          <div role="status" className="notice">
            {notice}
            <button onClick={() => setNotice("")}><Icon name="close" size={15}/></button>
          </div>
        )}
        {view === "会话" ? (
          <div className={`work ${selected ? "has-stage" : ""} ${detailsOpen ? "details-open" : "details-collapsed"}`}>
            <section className="conversation">
              <div className="conversation-head">
                <div className="conversation-title-block" onContextMenu={(event) => { event.preventDefault(); if (current) { setRename(current.title); setEditingTitle(true); } }}><b>{current?.title || "新会话"}</b><small>{state?.root ? `产品工作 · ${conversationStatus}` : "选择工作空间后开始"}</small></div>
                <div className="conversation-route" aria-label="会话操作">
                  {modelRouteError && <button className="header-icon-button route-error-button" aria-label="检查模型配置" title={modelRouteError} onClick={() => setSettingsOpen(true)}><Icon name="warning" size={16}/></button>}
                  <button className="header-icon-button conversation-workspace-button" aria-label="打开工作目录" title="打开工作目录" onClick={() => void act(() => call({ type: "openFolder" }))}><Icon name="folder"/></button>
                  <button ref={detailsToggleRef} className={`header-icon-button details-toggle ${detailsOpen ? "active" : ""}`} aria-label={detailsOpen ? "收起详情" : "展开详情"} aria-expanded={detailsOpen} aria-controls="conversation-details" title={detailsOpen ? "收起详情" : "展开详情"} onClick={() => detailsOpen ? closeDetails() : setDetailsOpen(true)}><Icon name="panel"/></button>
                </div>
              </div>
              <div
                ref={messagesRef}
                className="messages"
                onScroll={onMessagesScroll}
              >
                {!current?.messages.length ? (
                  <div className="welcome">
                    <h1>今天要推进哪项产品工作？</h1>
                    <p>
                      描述任务，或选择一个起点。
                    </p>
                    <div className="starters">
                      {starterActions.map(({ kind, label, hint }) => (
                        <button key={kind} title={hint} onClick={() => chooseWorkflow(kind)}>
                          <Icon name={kind === "prototype" ? "code" : kind === "prd" ? "file" : kind === "research" ? "search" : "chat"} size={19}/><span><b>{label}</b><small>{({ prototype: "验证页面、操作与交互状态", prd: "把业务规则写清楚", research: "归纳资料、问题与真实依据", meeting: "整理决定、待办与未答问题" })[kind]}</small></span><Icon name="chevronRight" size={15}/>
                        </button>
                      ))}
                    </div>
                    {!state?.root && (
                      <button
                        className="primary"
                        onClick={() =>
                          void act(() => call({ type: "workspace" }))
                        }
                      >
                        选择工作空间
                      </button>
                    )}
                  </div>
                ) : (
                  current.messages.map((message, index) => (
                    <React.Fragment key={`${message.time}-${index}`}>
                    {historyAnchorsAt(index)}
                    <article
                      ref={
                        message.role === "assistant" && index === lastAssistantIndex
                          ? activeMessageRef
                          : undefined
                      }
                      className={`message ${message.role}`}
                      onContextMenu={(event) => {
                        if (message.role === "tool") return;
                        event.preventDefault();
                        setFolderMenu(undefined);
                        setMessageMenu({ index, text: message.text, x: event.clientX, y: event.clientY });
                      }}
                    >
                      {message.role === "tool" ? (
                        <details>
                          <summary>
                            工具记录 · {message.text.split(" ")[0]}
                          </summary>
                          <pre>{message.text}</pre>
                        </details>
                      ) : (
                        <>
                          <div className="byline">
                            {message.role === "user" ? "你" : "slash"}
                            {message.role === "user" && <time>
                              {new Date(message.time).toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </time>}
                          </div>
                          {message.attachmentIds?.length ? <div className="message-attachment-ref">图片附件 · {message.attachmentIds.length} 个 · 已保存为工作空间快照</div> : null}
                          <Markdown className="prose">{message.text}</Markdown>
                          {message.role === "assistant" && replyDetails(message,runs.find(run => run.id === message.runId),replyKey(message,index))}
                        </>
                      )}
                    </article>
                    </React.Fragment>
                  ))
                )}
                {historyAnchorsAt(current?.messages.length || 0)}
                {active && (
                  <article ref={activeMessageRef} className="message assistant">
                    <div className="byline">
                      slash <span className="pulse" aria-label="正在生成"/>
                    </div>
                    {stream[active.id] ? (
                      <DecryptedStream key={active.id} text={stream[active.id]} />
                    ) : (
                      <Markdown className="prose">正在读取上下文并处理任务…</Markdown>
                    )}
                    {replyDetails({ role: "assistant", text: stream[active.id] || "", time: active.startedAt, runId: active.id },active,`run:${active.id}:${current?.messages.filter(message=>message.role === "assistant" && message.runId === active.id).length || 0}`,true)}
                  </article>
                )}
                {state?.pendingApprovals
                  ?.filter(
                    (approval) => isApprovalActionable(approval, state?.runs || []) &&
                      (!approval.conversationId || approval.conversationId === conversationId),
                  )
                  .map((approval) => (
                    <article
                      className="approval-card tool-approval"
                      key={approval.id}
                    >
                      <div>
                        <span className="eyebrow">Agent 正在等待确认</span>
                        <h3>{approval.summary}</h3>
                        <p>
                          {capabilityLabels[approval.capability] ||
                            approval.capability}
                        </p>
                        <small>
                          允许后任务会从暂停处继续；拒绝不会派发这次工具调用。
                        </small>
                        {approval.details &&
                          Object.keys(approval.details).length > 0 && (
                            <details>
                              <summary>查看操作详情</summary>
                              <pre>
                                {JSON.stringify(approval.details, null, 2)}
                              </pre>
                            </details>
                          )}
                      </div>
                      <div className="button-row">
                        <button
                          disabled={approvalBusyIds.includes(approval.id)}
                          onClick={() =>
                            void act(() =>
                              resolveToolApproval(approval.id, "deny"),
                            )
                          }
                        >
                          拒绝
                        </button>
                        <button
                          disabled={approvalBusyIds.includes(approval.id)}
                          onClick={() =>
                            void act(() =>
                              resolveToolApproval(approval.id, "allow_once"),
                            )
                          }
                        >
                          仅这次允许
                        </button>
                        <button
                          className="primary"
                          disabled={approvalBusyIds.includes(approval.id)}
                          onClick={() =>
                            void act(() =>
                              resolveToolApproval(approval.id, "allow"),
                            )
                          }
                        >
                          允许并记住
                        </button>
                      </div>
                    </article>
                  ))}
                {proposals.map((proposal) => (
                  <article className="approval-card" key={proposal.id}>
                    <div>
                      <span className="eyebrow">外部操作待确认</span>
                      <h3>
                        {proposal.kind === "document_delivery"
                          ? "发布在线文档"
                          : "执行 MCP 工具"}
                      </h3>
                      <p>{proposal.target}</p>
                      <small>
                        连接 {proposal.connectionId} ·{" "}
                        {proposal.userAuthorizationExcerpt}
                      </small>
                    </div>
                    <div className="button-row">
                      <button
                        onClick={() => void act(() => rejectProposal(proposal))}
                      >
                        拒绝
                      </button>
                      <button
                        className="primary"
                        onClick={() =>
                          void act(() => approveProposal(proposal))
                        }
                      >
                        批准并执行
                      </button>
                    </div>
                  </article>
                ))}
                {state?.changes
                  .filter((change) =>
                    runs.some((run) => run.id === change.runId),
                  )
                  .map((change) => (
                    <article className="change" key={change.id}>
                      <div>
                        <button className="change-file-link" title={`${change.path}\n点击查看；Ctrl + 左键或 Ctrl + Enter 在资源管理器中定位`} onClick={event => event.ctrlKey ? revealChange(change) : viewChange(change)} onKeyDown={event => { if (event.ctrlKey && event.key === "Enter") { event.preventDefault(); revealChange(change); } }}>{change.path.split(/[\\/]/).pop()}</button>
                        <small className={`change-state ${change.status}`}>
                          {change.status === "applied"
                            ? "已保存版本"
                            : change.status === "conflict"
                              ? "文件冲突，草稿已保留"
                              : "草稿 · 尚未写入项目"}
                        </small>
                        {change.originRunId && <small className="muted" title={`原任务 ${change.originRunId}；已续接 ${change.resumptionHistory?.length || 1} 次`}>已从原任务续接 · {change.resumptionHistory?.length || 1} 次</small>}
                      </div>
                      <button
                        onClick={() => viewChange(change)}
                      >
                        查看
                      </button>
                      {change.status === "pending" && (
                        <button
                          className="primary"
                          disabled={Boolean(files.find(file => file.mountId === change.mountId && file.path === change.path)?.referenceProtected)}
                          title={files.find(file => file.mountId === change.mountId && file.path === change.path)?.referenceProtected ? "参考原件只读，请创建处理副本" : undefined}
                          onClick={() =>
                            void act(() =>
                              call({ type: "apply", id: change.id, source: "ui" }),
                            )
                          }
                        >
                          保存到项目
                        </button>
                      )}
                    </article>
                  ))}
              </div>
              <div className="composer-wrap">
                {(active??runs[0])&&<RunRuntimeStatus run={(active??runs[0])!} active={Boolean(active)} onClear={()=>{if(active)void act(()=>call({type:'runInputClearQueued',runId:active.id}));}}/>}
                <div className="composer" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); attachImage(event.dataTransfer.files?.[0]); }}>
                  <ReferencePicker
                    open={referencePickerOpen}
                    files={allFiles}
                    mounts={state?.mounts || []}
                    projectEntries={projectEntries}
                    selected={referenceAttachments}
                    onClose={() => setReferencePickerOpen(false)}
                    onConfirm={(next) => {
                      setReferenceAttachments(next);
                      if (workflowKind !== "change_summary") setWorkflowSources(undefined);
                      setReferencePickerOpen(false);
                    }}
                  />
                  <textarea
                    aria-label="描述你的任务"
                    placeholder={workflowKind ? pmWorkflows[workflowKind].hint : "描述任务，或加入文件、段落与原型元素…"}
                    value={draft}
                    onChange={(event) => { const value = event.target.value; setDraft(value);if(/^\/(?:prototype|prd|research|review|help)(?:\s|$)/.test(value.trimStart())) { setWorkflowKind(undefined);setWorkflowSources(undefined); }setSlashIndex(0); setSlashOpen(value.trimStart().startsWith("/") && !value.includes(" ")); }}
                    onPaste={(event) => { const image = Array.from(event.clipboardData.files).find((file) => file.type.startsWith("image/")); if (image) { event.preventDefault(); attachImage(image); } }}
                    onDrop={(event) => { event.preventDefault(); attachImage(event.dataTransfer.files?.[0]); }}
                    onKeyDown={(event) => {
                      if (slashOpen && matchingSlashCommands.length) {
                        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                          event.preventDefault();
                          setSlashIndex((value) => (event.key === "ArrowDown" ? (value + 1) % matchingSlashCommands.length : (value - 1 + matchingSlashCommands.length) % matchingSlashCommands.length));
                          return;
                        }
                        if (event.key === "Escape") { event.preventDefault(); setSlashOpen(false); return; }
                        if (event.key === "Tab" || (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing)) {
                          event.preventDefault();
                          setDraft(`${matchingSlashCommands[slashIndex]?.[0] || matchingSlashCommands[0][0]} `);
                          setSlashOpen(false);
                          return;
                        }
                      }
                      if (
                        event.key === "Enter" &&
                        !event.shiftKey &&
                        !event.nativeEvent.isComposing
                      ) {
                        event.preventDefault();
                        void send();
                      }
                    }}
                  />
                  {slashOpen && <div className="slash-command-menu" role="listbox" aria-label="命令建议">
                    {matchingSlashCommands.map(([command, description], index) => <button key={command} type="button" role="option" aria-selected={index === slashIndex} className={index === slashIndex ? "chosen" : ""} onMouseEnter={() => setSlashIndex(index)} onClick={() => { setDraft(`${command} `); setSlashOpen(false); }}><b>{command}</b><small>{description}</small></button>)}
                  </div>}
                  {(workflowKind || referenceAttachments.length > 0 || imageAttachment) && <div className="composer-context">
                    {workflowKind && <span className="composer-task-chip" aria-label="任务上下文" title={pmWorkflows[workflowKind].hint}><Icon name={workflowKind === "prototype" ? "code" : "file"} size={14}/><span>{pmWorkflows[workflowKind].label}{workflowKind === "change_summary" ? ` · ${workflowSources?.[0]?.versionId || "旧版"} → 当前版` : ""}</span><button type="button" aria-label="移除任务上下文" onClick={() => { setWorkflowKind(undefined);setWorkflowSources(undefined);setNotice("已移除任务上下文，输入内容与引用资料保留。"); }}><Icon name="close" size={13}/></button></span>}
                    {workflowSources?.some(source => source.contentHash) && workflowKind !== "change_summary" && <button className="workflow-clear" type="button" onClick={() => { setWorkflowSources(undefined); setNotice("发送时会读取所选资料的当前版本。"); }}>改用当前版本</button>}
                    {referenceAttachments.length > 0 && (
                      <div className="reference-attachments" aria-label="已选择的引用资料">
                        {referenceAttachments.map((file) => (
                          <span className="reference-attachment" key={`${file.mountId}::${file.path}`} title={file.path}>
                            <FileIcon path={file.path} size={14}/> {file.path.split(/[\\/]/).pop() || file.path}
                            <button
                              type="button"
                              aria-label={`移除引用资料 ${file.path}`}
                              onClick={() => { setReferenceAttachments((current) => current.filter((item) => item.mountId !== file.mountId || item.path !== file.path)); setWorkflowSources(undefined); }}
                            ><Icon name="close" size={15}/></button>
                          </span>
                        ))}
                      </div>
                    )}
                    {imageAttachment && <span className="image-attachment" title={imageAttachment.path}><Icon name="image" size={14}/> {imageAttachment.name}<button type="button" aria-label="移除图片" onClick={() => setImageAttachment(undefined)}><Icon name="close" size={15}/></button></span>}
                  </div>}
                  <div className="composer-bottom">
                    <ComposerPopover label="添加" icon="plus">{close => <><div className="composer-popover-heading">加入资料</div><button className="composer-action" type="button" onClick={() => { close();void openReferencePicker(); }}><Icon name="attach" size={17}/><span>引用资料</span></button><label className="composer-action composer-image-action"><Icon name="image" size={17}/><span>添加图片</span><input type="file" accept="image/png,image/jpeg,image/webp,image/gif" aria-label="添加图片" onChange={event => { attachImage(event.target.files?.[0]);event.target.value="";close(); }}/></label><div className="composer-popover-heading composer-popover-divider">快捷动作</div>{starterActions.map(action => <button className="composer-action" type="button" key={action.kind} onClick={() => { close();chooseWorkflow(action.kind); }}><Icon name={action.kind === "prototype" ? "code" : action.kind === "research" ? "search" : action.kind === "meeting" ? "chat" : "file"} size={17}/><span><b>{action.label}</b><small>插入可编辑的提示词</small></span></button>)}</>}</ComposerPopover>
                    <ComposerModelMenu value={modelEntryId} models={state?.models || []} capability={thinkingCapability} loading={thinkingLoading} thinkingLevel={thinkingLevel} onThinkingChange={level => { setThinkingDirty(true);setThinkingLevel(level); }} onRefreshCapability={() => void refreshThinkingCapability()} onChange={id => { if (id !== modelEntryId) { if (thinkingLevel) setNotice("已切换模型，思考强度恢复模型默认。");thinkingRequestId.current+=1;setThinkingCapability(undefined);setThinkingLoading(true);setThinkingLevel(undefined);setThinkingDirty(true);setModelEntryId(id); } }}/>
                    <ComposerModeMenu value={agentMode} onChange={setAgentMode}/>
                    <ComposerPermissionMenu value={permissionMode} onChange={setPermissionMode}/>
                    {active ? (
                      <>
                      <ComposerPopover label={inputDelivery==='steer'?'本轮补充':'本轮结束后处理'} icon="chat">{close=><><button className="composer-action" type="button" aria-pressed={inputDelivery==='steer'} onClick={()=>{setInputDelivery('steer');close();}}>本轮补充<small>当前工具返回后处理</small></button><button className="composer-action" type="button" aria-pressed={inputDelivery==='follow_up'} onClick={()=>{setInputDelivery('follow_up');close();}}>本轮结束后处理<small>当前工具链结束后处理</small></button></>}</ComposerPopover>
                      <button aria-label="发送补充" title="沿用本轮模式、权限与模型" className="send" disabled={busy||!draft.trim()||!['queued','running','waiting_user'].includes(active.status)} onClick={()=>void send()}><Icon name="send" size={19}/></button>
                      <button
                        className="send stop" aria-label="停止任务" title="停止任务"
                        onClick={() =>
                          void act(() =>
                            call({ type: "cancel", id: active.id }),
                          )
                        }
                      >
                        <Icon name="stop" size={16}/>
                      </button></>
                    ) : (
                      <button
                        aria-label="发送"
                        disabled={busy || !draft.trim()}
                        className="send"
                        onClick={() => void send()}
                      >
                        {visionBusy ? <span className="send-loading"/> : <Icon name="send" size={19}/>}
                      </button>
                    )}
                  </div>
                </div>
                <div className="footnote">
                  Enter 发送 · Shift+Enter 换行
                </div>
              </div>
            </section>
            {selected && (
              <section className="document-stage" aria-label="成果工作区">
                {renderPreview}
              </section>
            )}
            {detailsOpen && <button className="details-scrim" aria-label="关闭详情遮罩" tabIndex={-1} onClick={closeDetails} />}
            <aside id="conversation-details" className="details-pane" aria-label="详情">
              <div className="details-tabs">
                <button className={detailsTab === "details" ? "active" : ""} aria-label="详情" title="详情" onClick={() => openDetailsTab("details")}>详情</button>
                <button className={detailsTab === "artifacts" ? "active" : ""} onClick={() => openDetailsTab("artifacts")}>成果</button>
                <button className={detailsTab === "files" ? "active" : ""} onClick={() => openDetailsTab("files")}>文件</button>
                <button className="details-collapse" aria-label="收起详情" onClick={closeDetails}><Icon name="chevronRight" size={16}/></button>
              </div>
              {detailsTab === "details" ? (
                <div className="details-body">
                  <section><h3>当前工作</h3><p>{current?.title || "新会话"}</p><small>{current?.messages.length || 0} 条消息 · {runs.length} 项任务</small></section>
                  <section><h3>状态</h3><span className="detail-status">{conversationStatus}</span></section>
                  <section><h3>工作空间</h3><p>{state?.root ? state.root.split(/[\\/]/).pop() : "尚未选择"}</p><button onClick={() => setSettingsOpen(true)}>管理工作空间　→</button></section>
                  <section><h3>当前文件</h3>{selected ? <><p className="detail-file-name">{selected.path.split(/[\\/]/).pop()}</p><small>{selected.path}</small><button onClick={referenceSelected}>加入会话　→</button></> : <p className="detail-muted">从成果或文件中选择项目文件，查看版本和引用信息。</p>}</section>
                  <section><h3>快捷入口</h3><button onClick={() => openDetailsTab("artifacts")}>查看成果</button><button onClick={() => openDetailsTab("files")}>文件</button></section>
                </div>
              ) : (
                <div className="details-body details-file-list">
                  <div className="details-list-heading"><b>{detailsTab === "artifacts" ? "成果" : "文件"}</b><small>{detailsFiles.length} 项</small></div>
                  {detailsFiles.length ? detailsFiles.map((file) => (
                    <button
                      className={`details-file-row ${selected?.mountId === file.mountId && selected.path === file.path ? "selected" : ""}`}
                      key={`${file.mountId}:${file.path}`}
                      title={file.path}
                      onClick={() => void act(() => openFile(file))}
                      onContextMenu={(event) => openFolderMenu(event, file.mountId, file.path)}
                    >
                      <span className="details-file-icon"><FileIcon path={file.path} size={18}/></span>
                      <span><b>{file.path.split(/[\\/]/).pop()}</b><small>{file.path}</small></span>
                    </button>
                  )) : <p className="detail-muted">当前项目还没有可显示的{detailsTab === "artifacts" ? "成果" : "文件"}。</p>}
                </div>
              )}
            </aside>
          </div>
        ) : (
          <div className={`content-work ${selected ? "with-preview" : ""}`}>
            <div className="page">
              {["资源", "成果"].includes(view) && <ProjectResourcesBrowser kind={view === "成果" ? "output" : "resource"} initialProjectId={browserProjectId} navigationKey={browserNavigationKey} call={call} onOpen={file=>act(()=>openFile(file))} onReference={referenceProjectFile} onError={setError} onDirectory={updateBrowserDirectory} onContextMenu={openFolderMenu}/>}
              {!["资源", "成果"].includes(view) && <div className="page-heading">
                <div>
                  <span className="eyebrow">项目 · {activeProject.name}</span>
                  <h1>{view}</h1>{folderView && <div className="workspace-counts"><span>{folderGroups?.length || 0} 个目录</span><span>{filteredFiles.length} 个文件</span></div>}
                </div>
                {[
                  "资源",
                  "成果",
                  "规则与模板",
                                            ].includes(view) && (
                  <button onClick={() => void act(() => loadFiles())}>
                    刷新
                  </button>
                )}
              </div>}
              {[
                "规则与模板",
                                      ].includes(view) && (
                <>
                  <p className="muted">
                    {view === "规则与模板"
                      ? "查看已授权的 skills、模板和工作规则。修改请带目标进入会话。"
                      : view === "资源"
                            ? "skills、模板与参考资料，按实际文件夹浏览。"
                            : view === "成果"
                              ? "原型、产出材料和已登记成果。"
                              : "文件保留在原目录。你可以阅读、引用和定位，修改从会话发起。"}
                  </p>
                  {view === "规则与模板" && (
                    <div className="intent-banner">
                      <div>
                        <b>
                          按规则或模板工作
                        </b>
                        <small>
                          将明确的目标带入会话，Agent 会继续读取相关授权资料。
                        </small>
                      </div>
                      <button
                        className="primary"
                        onClick={() =>
                          prefill(
                            "请读取我接下来引用的规则或模板，并按其要求生成或修改成果；保留人工内容和版本记录。",
                          )
                        }
                      >
                        在会话中开始
                      </button>
                    </div>
                  )}
                  {view === "规则与模板" && (
                    <WorkflowDraftsPanel
                      workflow={templateWorkflow}
                      onContinue={prefill}
                      onApplyGroup={(id) =>
                        void act(() => applyMigrationGroup(id))
                      }
                      onApplyRules={(id) => void act(() => applyRulesDraft(id))}
                    />
                  )}{" "}
                  {view === "成果" && <div className="work-issues-project">{workIssues(false)}</div>}
                  {["资源", "成果"].includes(view) && <>
                    <div className="project-browser-tabs" role="tablist" aria-label={view === "资源" ? "资源分类" : "成果分类"}>
                      <button role="tab" aria-selected={!browserSelection} onClick={() => changeBrowserTab("")}>{view === "资源" ? "项目目录" : "全部成果"}</button>
                      {browserOptions.map(item => <button role="tab" key={item.node.id} aria-selected={browserTab === item.node.id} onClick={() => changeBrowserTab(item.node.id)}>{item.node.name}</button>)}
                    </div>
                    {Boolean(browserSelection?.children.length) && <div className="project-browser-subtabs" role="tablist" aria-label={`${browserSelection?.node.name}子目录`}>
                      <button role="tab" aria-selected={!browserSubtab} onClick={() => changeBrowserTab("", true)}>全部</button>
                      {browserSelection?.children.map(item => <button role="tab" key={item.node.id} aria-selected={browserSubtab === item.node.id} onClick={() => changeBrowserTab(item.node.id, true)}>{item.node.name}</button>)}
                    </div>}
                    {browserReferenceProtected && <p className="reference-protection-hint" role="status">参考只读 · 可导入新文件；转换或脚本请先创建处理副本，保留原件。</p>}
                    {projectTree?.root === state?.root && Boolean(projectTree?.initializationWarnings?.length) && <div className="project-initialization-warning" role="status" aria-label="项目初始化状态">项目初始化有未完成的操作；重新打开项目时会再次核对。<details><summary>查看提示</summary><ul>{projectTree?.initializationWarnings?.map((warning, index) => <li key={index}>{warning}</li>)}</ul></details></div>}
                    {projectTree?.root === state?.root && projectTree?.index && <div className="project-index-status" aria-label="资料索引同步状态">{projectTree.index.lastError ? "资料索引同步失败，请检查目录权限后刷新" : "资料索引已同步"} · {projectTree.index.entryCount} 项 · {Number.isFinite(Date.parse(projectTree.index.syncedAt)) ? <time dateTime={projectTree.index.syncedAt}>{new Date(projectTree.index.syncedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time> : "尚未成功同步"}{projectTree.index.truncated && " · 部分内容按上限收录"}{(projectTree.index.warnings.length > 0 || projectTree.index.lastError) && <details><summary>同步提示</summary><ul>{projectTree.index.lastError && <li>{projectTree.index.lastError}</li>}{projectTree.index.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul></details>}</div>}
                  </>}
                  <div className="toolbar">
                    <label className="file-search"><Icon name="search" size={17}/><input aria-label="搜索项目文件"
                      placeholder="按文件名搜索"
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                    /></label>
                    <button
                      onClick={() =>
                        void act(() => call({ type: "mount", write: false }))
                      }
                    >
                      <Icon name="plus" size={16}/> 添加目录
                    </button>
                  </div>
                  {folderView && folderMountId && <>
                      <div className="folder-breadcrumb">
                        <button
                          onClick={() => { setFolderMountId("");setFolderPath(""); }}
                          aria-label="返回目录列表"
                        >
                          <Icon name="chevronLeft" size={15}/> 所有目录
                        </button>
                        <b>
                          {folderPath || state?.mounts.find(
                            (mount) => mount.id === folderMountId,
                          )?.name || folderMountId}
                        </b>
                      </div>
                  </>}
                  {!folderMountId && (folderGroups.length > 0 || !browserScope) && <>
<div className="file-section-heading"><b>项目目录</b><small>打开目录查看文件，右键管理</small></div>
                    <div className="folder-card-grid">
                      {(folderGroups ?? []).map(({ mount, name, prefix, id, count, summary }) => (
                        <button
                          className="folder-card"
                          key={id}
                          onClick={() => { setFolderMountId(mount.id);setFolderPath(prefix); }}
                          onContextMenu={(event) =>
                            openFolderMenu(event, mount.id, prefix || ".")
                          }
                        >
                          <span className="folder-card-icon"><Icon name="folder" size={21}/></span>
                          <span className="folder-card-copy"><b>{name}</b>
                          <small>
                            {count} 个文件
                            {summary ? ` · ${summary}` : ""}
                          </small></span><Icon name="chevronRight" size={15}/>
                        </button>
                      ))}
                      {!folderGroups?.length && (
                        <p className="empty">
                          没有匹配的文件。添加目录、拖入文件，或在会话中生成成果。
                        </p>
                      )}
                    </div>
                  </>}
<div className="file-section-heading"><b>{folderMountId ? "目录文件" : "全部文件"}</b><small>{visibleFiles.length} 项 · 阅读或引用到会话</small></div>
                      <div className="file-list">
                        {visibleFiles.map((file) => (
                          <div
                            className={`file-row ${selected?.mountId === file.mountId && selected.path === file.path ? "selected" : ""}`}
                            key={file.mountId + file.path}
                            onContextMenu={(event) => openFolderMenu(event, file.mountId, file.path)}
                          >
                            <span className="file-icon"><FileIcon path={file.path}/></span>
                            <div>
                              <b title={file.path}>{file.path.split(/[\\/]/).pop()}</b>
                              <small>
                                {
                                  state?.mounts.find(
                                    (mount) => mount.id === file.mountId,
                                  )?.name
                                }{" "}
                                · {folderTypeLabels[file.path.split(".").pop()?.toLowerCase() || ""] || "文件"}{file.size > 0 ? ` · ${(file.size / 1024).toFixed(1)} KB` : ""} · {file.path}
                                {file.referenceProtected && <span className="file-access-label"> · 参考只读</span>}
                              </small>
                            </div>
                            <button
                              onClick={() => void act(() => openFile(file))}
                            >
                              阅读
                            </button>
                            <button
                              onClick={() => {
                                setSelected(file);
                                setSelection(undefined);
                                setReferenceAttachments(current => current.some(item => item.mountId === file.mountId && item.path === file.path) ? current : [...current, file]);
                                if (workflowKind !== "change_summary") setWorkflowSources(undefined);
                                setDraft((previous) =>
                                  (
                                    previous +
                                    `\n参考文件（mountId=${file.mountId}）：${file.path}\n`
                                  ).trimStart(),
                                );
                                setView("会话");
                              }}
                            >
                              引用
                            </button>
                          </div>
                        ))}
                        {!visibleFiles.length && (
                          <p className="empty">
                            没有匹配的文件。添加目录、拖入文件，或在会话中生成成果。
                          </p>
                        )}
                      </div>

                </>
              )}
              {view === "共享文件夹" && (
                <SharingPanel call={call} onNotice={setNotice} onError={setError} />
              )}
            </div>
            {renderPreview}
          </div>
        )}
      </main>
      <SettingsModal
        open={settingsOpen}
        state={state}
        call={call}
        onClose={() => setSettingsOpen(false)}
        onRefresh={refresh}
        onNotice={setNotice}
        onError={setError}
        onPrefillSession={prefill}
        onOpenConversation={(conversationId) => {
          setConversationId(conversationId);
          setSettingsOpen(false);
          setView("会话");
        }}
        onDeleteConversation={(conversationId) =>
          call({ type: "conversationDelete", id: conversationId }).then(() => undefined)
        }
        theme={theme}
        onThemeChange={setTheme}
      />
      {messageMenu && (
        <div
          className="context-menu message-context-menu"
          role="menu"
          style={{ left: Math.max(8, Math.min(messageMenu.x, window.innerWidth - 248)), top: Math.max(8, Math.min(messageMenu.y, window.innerHeight - 150)) }}
        >
          <div className="context-menu-label">第 {messageMenu.index + 1} 条消息</div>
          <button role="menuitem" onClick={() => void captureMessageDecision(messageMenu.text, messageMenu.index)}>记录为待确认</button>
          <button role="menuitem" onClick={() => { setDraft(messageMenu.text); setView("会话"); setMessageMenu(undefined); }}>带入输入框继续</button>
          <button role="menuitem" onClick={() => { void navigator.clipboard?.writeText(messageMenu.text); setNotice("消息内容已复制"); setMessageMenu(undefined); }}>复制消息内容</button>
        </div>
      )}
      {folderMenu && (
        <div
          className="context-menu"
          role="menu"
          style={{ left: Math.max(8, Math.min(folderMenu.x, window.innerWidth - 260)), top: Math.max(8, Math.min(folderMenu.y, window.innerHeight - (folderMenuFile?.referenceProtected ? 190 : 100))) }}
        >
          {folderMenuFile?.referenceProtected && <div className="context-menu-label">参考只读 · 原件保留</div>}
          <button
            role="menuitem"
            onClick={() => {
              const mountId = folderMenu.mountId;
              setFolderMenu(undefined);
              void act(() => call({ type: "reveal", mountId, path: folderMenu.path || "." }));
            }}
          >
            在资源管理器打开
          </button>
          {folderMenuFile && <button role="menuitem" onClick={() => { setFolderMenu(undefined); void act(() => openFile(folderMenuFile)); }}>预览文件</button>}
          {folderMenuFile?.referenceProtected && <button role="menuitem" disabled={processingBusy} onClick={() => { setFolderMenu(undefined); void act(() => createProcessingCopy(folderMenuFile)); }}>{processingBusy ? "创建中…" : "创建处理副本"}</button>}
        </div>
      )}
    </div>
  );
}


