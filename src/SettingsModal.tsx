import { Icon } from "./Icon";
import {approvalResolutionNotice,type ApprovalResolutionResult} from "../shared/approval";
import React, { useEffect, useMemo, useRef, useState } from "react";
import type {
  ApprovalRequest,
  AppPreferences,
  ModelEntry,
  ModelGroup,
  ModelProtocol,
  Mount,
  PermissionCapability,
  PermissionDecision,
  Request,
  State,
  SystemPromptView,
} from "../shared/types";
import { ConnectionsPanel } from "./ConnectionsPanel";
import { McpExecute } from "./Delivery";
import { ProjectStructureEditor } from "./ProjectStructureEditor";
import { ModelLimitsSettings } from "./ModelLimitsSettings";
import { GlobalSkillsSettings } from "./GlobalSkillsSettings";
import type {GlobalSkillsView,GlobalSkillMutationReceipt} from '../shared/global-skills';
import "./settings-focus.css";
import { searchSettings, type SettingsTab, type SettingsAdvancedGroup, type SettingsItem } from "./settings-navigation";

type Call = (request: Request) => Promise<unknown>;
export type ThemeName = "reference" | "graphite" | "sand";
type ModelDraft = {
  id?: string;
  provider: string;
  name: string;
  baseUrl: string;
  modelId: string;
  protocol: ModelProtocol;
  supportsVision: boolean;
  key: string;
  contextWindow: string;
  maxTokens: string;
};

const emptyModel: ModelDraft = {
  provider: "",
  name: "",
  baseUrl: "https://api.openai.com/v1",
  modelId: "",
  protocol: "openai-completions",
  supportsVision: false,
  key: "",
  contextWindow: "",
  maxTokens: "",
};
const defaultAppPreferences: AppPreferences = {
  qualityGateEnabled: true,
  forceQualityCheckBeforeDelivery: true,
  maxParallelTasks: 4,
  maxParallelConcurrency: 2,
  subAgentMaxDepth: 1,
  subAgentMaxTasks: 8,
  shareLockTtlMs: 120000,
  modelRouting: {
    strategy: "task_type",
    taskTypes: {
      research: "",
      analysis: "",
      writing: "",
      coding: "",
      review: "",
      general: "",
    },
  },
  subAgentTools: [
    "read_file",
    "search_files",
    "read_workspace_rules",
    "list_artifact_versions",
    "list_product_records",
    "query_artifact_impact",
    "read_web_page",
    "list_connections",
  ],
  visionAutoFallback: true,
};
const subAgentToolLabels: Record<string, string> = {
  read_file: "读取文件",
  search_files: "搜索资料",
  read_workspace_rules: "读取工作区规则",
  list_artifact_versions: "查看成果版本",
  list_product_records: "查看产品记录",
  query_artifact_impact: "查询影响关系",
  read_web_page: "读取网页",
  list_connections: "查看外部连接",
};
const taskTypeLabels: Record<string, string> = {
  research: "研究",
  analysis: "分析",
  writing: "PRD / 文档",
  coding: "原型 / 代码",
  review: "评审",
  general: "普通任务",
};
const protocolLabels: Record<ModelProtocol, string> = {
  "openai-completions": "completions",
  "openai-responses": "responses",
  "anthropic-messages": "claude",
};
const modelPresets = [
  {
    id: "baishan-deepseek",
    label: "百山云 · DeepSeek V4 Flash",
    provider: "baishan",
    name: "Baishan DeepSeek-V4-Flash-0731",
    baseUrl: "https://api.edgefn.net/v1",
    modelId: "DeepSeek-V4-Flash-0731",
    protocol: "openai-completions",
  },
  {
    id: "custom",
    label: "自定义供应商与模型",
    provider: "",
    name: "",
    baseUrl: "",
    modelId: "",
    protocol: "openai-completions",
  },
] as const;
const providerNames: Record<string, string> = {
  baishan: "百山云",
  openai: "OpenAI",
  anthropic: "Anthropic",
  custom: "自定义",
};
const capabilityCopy: Record<
  PermissionCapability,
  { name: string; description: string }
> = {
  workspace_read: {
    name: "读取工作资料",
    description: "查询和读取已授权目录中的文件。",
  },
  web_read: { name: "访问互联网", description: "查询公开网页和资料。" },
  connection_config: {
    name: "调整连接配置",
    description: "添加或修改 CLI、MCP 等外部连接。",
  },
  process_execute: {
    name: "运行本机工具",
    description: "允许 Agent 以当前 Windows 用户权限启动程序或命令。",
  },
  external_action: {
    name: "对外发布与操作",
    description: "创建在线文档、调用远端工具或发布成果。",
  },
  artifact_write: {
    name: "修改成果文件",
    description: "通过草稿和版本机制写入授权目录。",
  },
};
const decisionCopy: Record<PermissionDecision, string> = {
  ask: "每次询问",
  allow: "允许",
  deny: "禁止",
};

function Switch({
  checked,
  label,
  onChange,
}: {
  checked: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={`switch ${checked ? "on" : ""}`}
      onClick={() => onChange(!checked)}
    >
      <span />
    </button>
  );
}

export function SettingsModal({
  open,
  state,
  call,
  onClose,
  onRefresh,
  onNotice,
  onError,
  onPrefillSession,
  onOpenConversation,
  onDeleteConversation,
  theme,
  onThemeChange,
}: {
  open: boolean;
  state?: State;
  call: Call;
  onClose: () => void;
  onRefresh: () => Promise<void>;
  onNotice: (text: string) => void;
  onError: (text: string) => void;
  onPrefillSession: (text: string) => void;
  onOpenConversation: (conversationId: string) => void;
  /** Permanently removes an archived conversation. The host owns the API. */
  onDeleteConversation?: (conversationId: string) => Promise<void> | void;
  theme: ThemeName;
  onThemeChange: (theme: ThemeName) => void;
}) {
  const [tab, setTab] = useState<SettingsTab>("general");
  // Discovery changes after a successful conversation installation. Ordinary
  // progress saves keep this key stable and do not reload the management list.
  const globalSkillsRefreshKey = (state?.runs??[]).filter(run=>run.skillDiscovery).map(run=>`${run.id}:${run.skillDiscovery!.discoveredAt}`).sort().join('|');
  const [settingsQuery, setSettingsQuery] = useState("");
  const [advancedGroups, setAdvancedGroups] = useState<Partial<Record<SettingsAdvancedGroup, boolean>>>({});
  const [settingTarget, setSettingTarget] = useState("");
  const searchResults = searchSettings(settingsQuery);
  const [models, setModels] = useState<ModelEntry[]>([]);
  const [approvals, setApprovals] = useState<ApprovalRequest[]>([]);
  const [preferences, setPreferences] = useState<AppPreferences>(defaultAppPreferences);
  const [modelDraft, setModelDraft] = useState<ModelDraft>();
  const [modelDetailsOpen, setModelDetailsOpen] = useState(true);
  const [modelResult, setModelResult] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState("");
  const resolvingApprovals = useRef(new Set<string>());
  const [feedback, setFeedback] = useState<{
    kind: "error" | "success";
    text: string;
  }>();
  const modalRef = useRef<HTMLElement>(null);
  const providers = useMemo(
    () => Array.from(new Set(models.map((item) => item.provider))),
    [models],
  );
  const load = async () => {
    const [modelResponse, approvalItems, preferenceResponse] = await Promise.all([
      call({ type: "models" }),
      call({ type: "pendingApprovals" }),
      call({ type: "appPreferences" }),
    ]);
    const groups = (modelResponse as { groups: ModelGroup[] }).groups;
    setModels(groups.flatMap((group) => group.models));
    setApprovals(approvalItems as ApprovalRequest[]);
    setPreferences({
      ...defaultAppPreferences,
      ...(preferenceResponse as Partial<AppPreferences>),
      modelRouting: {
        ...defaultAppPreferences.modelRouting,
        ...((preferenceResponse as Partial<AppPreferences>)?.modelRouting || {}),
        taskTypes: {
          ...defaultAppPreferences.modelRouting.taskTypes,
          ...((preferenceResponse as Partial<AppPreferences>)?.modelRouting?.taskTypes || {}),
        },
      },
    });
  };
  useEffect(() => {
    if (!open) {
      setFeedback(undefined);
      setModelDraft(undefined);
      setModelDetailsOpen(true);
      return;
    }
    setFeedback(undefined);
    void load().catch((reason) => {
        const text = reason instanceof Error ? reason.message : String(reason);
        // The page-level banner is behind the settings modal. Keep failures
        // visible inside the modal as well so a failed initial load is not
        // indistinguishable from an unresponsive tab.
        setFeedback({ kind: "error", text });
        onError(text);
      });
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const keydown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (event.key === "Escape") {
        event.preventDefault();
        if (modelDraft) closeModelDraft();
        else onClose();
        return;
      }
      if (event.key === "Tab" && modalRef.current) {
        const scope = modalRef.current.querySelector<HTMLElement>(".connection-form-modal") || (modelDraft ? modalRef.current.querySelector<HTMLElement>(".subdialog") : modalRef.current);
        const focusable = Array.from(
          scope?.querySelectorAll<HTMLElement>(
            'button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),summary,[tabindex]:not([tabindex="-1"])',
          ) || [],
        ).filter((item) => item.offsetParent !== null);
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, [open, modelDraft, onClose]);
  useEffect(() => {
    if (!open) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
    requestAnimationFrame(() =>
      modalRef.current
        ?.querySelector<HTMLElement>(".modal-close")
        ?.focus(),
    );
    return () => { requestAnimationFrame(() => previousFocus?.focus()); };
  }, [open]);
  if (!open) return null;
  const notify = (text: string) => {
    setFeedback({ kind: "success", text });
    onNotice(text);
  };
  const perform = async (id: string, action: () => Promise<void>) => {
    setBusy(id);
    setFeedback(undefined);
    try {
      await action();
    } catch (reason) {
      const text = reason instanceof Error ? reason.message : String(reason);
      setFeedback({ kind: "error", text });
      onError(text);
    } finally {
      setBusy("");
    }
  };
  const selectTab = (next: SettingsTab) => {
    setFeedback(undefined);
    setTab(next);
  };
  const closeModelDraft = () => {
    setModelDraft(undefined);
    setModelDetailsOpen(true);
    setFeedback(undefined);
  };
  const openModelDraft = (draft: ModelDraft) => {
    setModelDetailsOpen(true);
    setFeedback(undefined);
    setModelDraft(draft);
  };
  const saveModel = async () => {
    if (!modelDraft) return;
    const provider = modelDraft.provider.trim();
    const name = modelDraft.name.trim();
    const baseUrl = modelDraft.baseUrl.trim();
    const modelId = modelDraft.modelId.trim();
    let validUrl = false;
    try {
      const parsed = new URL(baseUrl);
      validUrl = (parsed.protocol === "http:" || parsed.protocol === "https:") && !parsed.username && !parsed.password;
    } catch {
      validUrl = false;
    }
    if (!provider || !name || !validUrl || !modelId) {
      setFeedback({
        kind: "error",
        text: !provider
          ? "请填写供应商名称"
          : !name
            ? "请填写模型名称"
            : !validUrl
              ? "请输入有效的 HTTP 或 HTTPS API 地址"
              : "请填写模型 ID",
      });
      return;
    }
    const contextWindow = modelDraft.contextWindow.trim() ? Number(modelDraft.contextWindow) : undefined;
    const maxTokens = modelDraft.maxTokens.trim() ? Number(modelDraft.maxTokens) : undefined;
    if ([contextWindow, maxTokens].some(value => value !== undefined && (!Number.isSafeInteger(value) || value <= 0))) {
      setFeedback({ kind: "error", text: "上下文窗口和最大输出请填写大于 0 的整数，留空使用自动值。" });
      return;
    }
    if (contextWindow !== undefined && maxTokens !== undefined && maxTokens >= contextWindow) {
      setFeedback({ kind: "error", text: "最大输出必须小于上下文窗口，才能为输入资料和对话留出空间。" });
      return;
    }
    await perform("model-save", async () => {
      await call({
        type: "modelUpsert",
        model: {
          id: modelDraft.id,
          provider,
          name,
          baseUrl,
          modelId,
          protocol: modelDraft.protocol,
          supportsVision: modelDraft.supportsVision,
          contextWindow: contextWindow ?? null,
          maxTokens: maxTokens ?? null,
        },
        key: modelDraft.key || undefined,
      });
      setModelDraft(undefined);
      await load();
      await onRefresh();
      notify("模型配置已保存");
    });
  };
  const resolveApproval = async (
    id: string,
    decision: "allow_once" | "allow" | "deny",
  ) => {
    if(resolvingApprovals.current.has(id))return;
    resolvingApprovals.current.add(id);
    try { await perform(`approval-${id}`, async () => {
      try {
        const result=await call({ type: "approvalResolve", id, decision }) as ApprovalResolutionResult;
        notify(approvalResolutionNotice(result));
      } finally { await load(); await onRefresh(); }
    }); } finally { resolvingApprovals.current.delete(id); }
  };
  const updatePreferences = async (
    patch: Partial<AppPreferences>,
    notice = "设置已保存",
  ) => {
    await perform("preferences", async () => {
      const next = await call({
        type: "appPreferences",
        patch: patch as Record<string, unknown>,
      });
      setPreferences((current) => ({
        ...current,
        ...(next as AppPreferences),
        modelRouting: {
          ...current.modelRouting,
          ...((next as AppPreferences).modelRouting || {}),
          taskTypes: {
            ...current.modelRouting.taskTypes,
            ...((next as AppPreferences).modelRouting?.taskTypes || {}),
          },
        },
      }));
      notify(notice);
    });
  };
  const updateModelRouting = async (
    patch: Partial<AppPreferences["modelRouting"]>,
  ) => {
    const nextRouting = {
      ...preferences.modelRouting,
      ...patch,
      taskTypes: {
        ...preferences.modelRouting.taskTypes,
        ...(patch.taskTypes || {}),
      },
    };
    await updatePreferences({ modelRouting: nextRouting });
  };
  const openSetting = (item: SettingsItem) => {
    selectTab(item.tab);
    if (item.advanced) setAdvancedGroups(current => ({ ...current, [item.advanced!]: true }));
    setSettingsQuery("");
    setSettingTarget(item.id);
    requestAnimationFrame(() => {
      const target = modalRef.current?.querySelector<HTMLElement>(`[data-setting-id="${item.id}"]`);
      target?.scrollIntoView({ block: "nearest" });
      target?.focus();
    });
  };
  const toggleAdvanced = (group: SettingsAdvancedGroup, value: boolean) =>
    setAdvancedGroups(current => current[group] === value ? current : { ...current, [group]: value });
  return (
    <div className="modal-layer">
      <section
        ref={modalRef}
        className="settings-modal settings-focus"
        role="dialog"
        aria-modal="true"
        aria-label="设置"
        aria-labelledby="settings-title"
      >
        <div className="settings-top">
          <div><h1 id="settings-title">设置</h1><p>管理偏好、工作空间，以及 Slash 的工作方式。</p></div>
          <div className="settings-top-actions">
            <div className="settings-search-wrap">
              <label className="settings-search"><Icon name="search" size={16}/><input aria-label="搜索设置" placeholder="搜索设置…" aria-controls="settings-search-results" aria-expanded={Boolean(settingsQuery.trim())} value={settingsQuery} onChange={event => setSettingsQuery(event.target.value)} onKeyDown={event => {
                if (event.key === "Enter" && searchResults[0]) { event.preventDefault(); openSetting(searchResults[0]); }
                if (event.key === "Escape" && settingsQuery) { event.preventDefault(); setSettingsQuery(""); }
              }} /></label>
              {settingsQuery.trim() && <div id="settings-search-results" className="settings-search-results" aria-label="设置搜索结果">
                {searchResults.length ? searchResults.map(item => <button key={item.id} type="button" onClick={() => openSetting(item)}><b>{item.label}</b><small>{{ general: "通用", workspace: "工作空间", models: "模型", policies: "质量检查", connections: "连接", permissions: "权限与审批", archive: "归档会话", prompt: "系统提示词", skills:"全局技能" }[item.tab]}{item.advanced ? " · 高级" : ""}</small></button>) : <p role="status">没有找到相关设置</p>}
              </div>}
            </div>
            <button className="modal-close" aria-label="关闭设置" onClick={onClose}><Icon name="close" size={16}/></button>
          </div>
        </div>
        <aside className="settings-nav">
          <nav aria-label="设置分类">
            <button className={tab === "general" ? "active" : ""} onClick={() => selectTab("general")}><Icon name="settings" size={17}/>通用</button>
            <button className={tab === "prompt" ? "active" : ""} onClick={() => selectTab("prompt")}><Icon name="edit" size={17}/>系统提示词</button>
            <button className={tab === "skills" ? "active" : ""} onClick={() => selectTab("skills")}><Icon name="book" size={17}/>全局技能</button>
            <button className={tab === "workspace" ? "active" : ""} onClick={() => selectTab("workspace")}><Icon name="folder" size={17}/>工作空间</button>
            <button
              className={tab === "models" ? "active" : ""}
              onClick={() => selectTab("models")}
            >
              <Icon name="model" size={17}/>模型
            </button>
            <button
              className={tab === "policies" ? "active" : ""}
              onClick={() => selectTab("policies")}
            >
              <Icon name="shield" size={17}/>质量检查
            </button>
            <button
              className={tab === "connections" ? "active" : ""}
              onClick={() => selectTab("connections")}
            >
              <Icon name="external" size={17}/>连接
            </button>
            <button
              className={tab === "permissions" ? "active" : ""}
              onClick={() => selectTab("permissions")}
            >
              <Icon name="shield" size={17}/>权限与审批
              {approvals.length > 0 && <b>{approvals.length}</b>}
            </button>
            <button className={tab === "archive" ? "active" : ""} onClick={() => selectTab("archive")}><Icon name="archive" size={17}/>归档会话</button>
          </nav>
        </aside>
        <div className="settings-body" data-setting-target={settingTarget}>
          {tab === 'skills' && <GlobalSkillsSettings refreshKey={globalSkillsRefreshKey} call={async input=>await call({type:'globalSkills',...input}) as GlobalSkillsView|GlobalSkillMutationReceipt} onChooseFolder={async()=>await call({type:'globalSkillsChooseFolder'}) as string|undefined}/>} 
          {feedback && (
            <div
              className={`modal-feedback ${feedback.kind}`}
              role={feedback.kind === "error" ? "alert" : "status"}
            >
              {feedback.text}
              <button
                aria-label="关闭提示"
                onClick={() => setFeedback(undefined)}
              ><Icon name="close" size={16}/></button>
            </div>
          )}
          {tab === "models" && (
            <section className="settings-section" data-setting-id="model-list" tabIndex={-1}>
              <div className="settings-heading">
                <div>
                  <h1>模型</h1>
                  <p>按供应商管理模型，并选择会话默认使用的模型。</p>
                </div>
                <button
                  className="primary"
                  onClick={() => openModelDraft(emptyModel)}
                >
                  添加模型
                </button>
              </div>
              <div className="vision-model-setting" data-setting-id="vision-model" tabIndex={-1}><div><b>图片辅助模型</b><small>当前模型不支持图片时，使用这个模型提取 OCR、版面和交互证据。</small></div><select aria-label="图片辅助模型" value={preferences.visionModelId || ""} onChange={(event) => void updatePreferences({ visionModelId: event.target.value || undefined })}><option value="">自动选择已标记的视觉模型</option>{models.filter((model) => model.supportsVision).map((model) => <option key={model.id} value={model.id}>{model.provider} · {model.name}</option>)}</select></div><label className="check vision-fallback-check"><input type="checkbox" checked={preferences.visionAutoFallback !== false} onChange={(event) => void updatePreferences({ visionAutoFallback: event.target.checked })} />当前模型不支持图片时自动回退</label>
              {!models.length ? (
                <div className="settings-empty">
                  <b>还没有可用模型</b>
                  <p>添加一个模型后，就可以在会话中运行任务。</p>
                  <button onClick={() => openModelDraft(emptyModel)}>
                    添加第一个模型
                  </button>
                </div>
              ) : (
                providers.map((provider) => (
                  <div className="settings-group" key={provider}>
                    <div className="settings-group-title">
                      <h3>{providerNames[provider] || provider}</h3>
                      <span>
                        {
                          models.filter((item) => item.provider === provider)
                            .length
                        }
                      </span>
                    </div>
                    <div className="settings-rows">
                      {models
                        .filter((item) => item.provider === provider)
                        .map((item) => (
                          <div className="settings-row model-row" key={item.id}>
                            <div className="provider-mark">
                              {(providerNames[provider] || provider)
                                .slice(0, 1)
                                .toUpperCase()}
                            </div>
                            <div>
                              <b>{item.name}</b>
                              <small>
                                {item.modelId} ·{" "}
                                {protocolLabels[item.protocol] || item.protocol}{" "}
                                · {item.hasKey ? "密钥已保存" : "尚未保存密钥"}{item.supportsVision ? " · 支持图片" : ""}
                              </small>
                            </div>
                            {state?.defaultModelId === item.id ? (
                              <span className="default-label">默认</span>
                            ) : (
                              <button
                                className="quiet"
                                onClick={() =>
                                  void perform(
                                    `default-${item.id}`,
                                    async () => {
                                      await call({
                                        type: "modelDefault",
                                        id: item.id,
                                      });
                                      await onRefresh();
                                      notify("默认模型已更新");
                                    },
                                  )
                                }
                              >
                                设为默认
                              </button>
                            )}
                            <button
                              disabled={busy === `test-${item.id}`}
                              onClick={() =>
                                void perform(`test-${item.id}`, async () => {
                                  const result = await call({
                                    type: "modelTest",
                                    id: item.id,
                                  });
                                  setModelResult((value) => ({
                                    ...value,
                                    [item.id]: JSON.stringify(result),
                                  }));
                                  notify("模型连接测试已完成");
                                })
                              }
                            >
                              测试
                            </button>
                            <button
                              onClick={() =>
                                openModelDraft({ ...item, supportsVision: Boolean(item.supportsVision), key: "", contextWindow: item.contextWindow === undefined ? "" : String(item.contextWindow), maxTokens: item.maxTokens === undefined ? "" : String(item.maxTokens) })
                              }
                            >
                              编辑
                            </button>
                            <button
                              className="quiet danger-text"
                              onClick={() =>
                                void perform(`remove-${item.id}`, async () => {
                                  await call({
                                    type: "modelRemove",
                                    id: item.id,
                                  });
                                  await load();
                                  await onRefresh();
                                  notify("模型已移除");
                                })
                              }
                            >
                              移除
                            </button>
                            {modelResult[item.id] && (
                              <small className="row-result">
                                {modelResult[item.id]}
                              </small>
                            )}
                          </div>
                        ))}
                    </div>
                  </div>
                ))
              )}
              <details className="settings-advanced" data-setting-id="model-routing" tabIndex={-1} open={Boolean(advancedGroups.routing)} onToggle={event => toggleAdvanced("routing", event.currentTarget.open)}>
                <summary>高级：模型分工</summary>
                <div className="settings-advanced-body">
              <div className="settings-group">
                <div className="settings-group-title">
                  <div><h3>模型分工</h3><small>会话选择“自动”时按此设置选模型；会话中指定模型时固定使用所选配置。</small></div>
                </div>
                <div className="settings-row">
                  <div><b>模型选择方式</b><small>按任务分工，或始终使用上方标记的默认模型。</small></div>
                  <select aria-label="模型选择方式" value={preferences.modelRouting.strategy} onChange={(event) => void updateModelRouting({ strategy: event.target.value as AppPreferences["modelRouting"]["strategy"] })}>
                    <option value="task_type">按任务类型</option>
                    <option value="fixed">固定默认模型</option>
                    {(preferences.modelRouting.strategy === "cost_aware" || preferences.modelRouting.strategy === "fallback") && <option value={preferences.modelRouting.strategy}>兼容旧策略 · {preferences.modelRouting.strategy === "cost_aware" ? "成本优先" : "按回退顺序"}</option>}
                  </select>
                </div>
                {(preferences.modelRouting.strategy === "cost_aware" || preferences.modelRouting.strategy === "fallback") && <p className="settings-quality-note">保留已保存的旧策略。当前没有模型成本数据或可配置的回退顺序；可主动切换为按任务类型或固定默认模型。</p>}
                <div className="settings-policy-grid">
                  {Object.entries(taskTypeLabels).map(([taskType, label]) => {
                    const saved = preferences.modelRouting.taskTypes[taskType] || "";
                    const exact = models.find(model => model.id === saved);
                    const legacyMatches = exact ? [] : models.filter(model => model.modelId === saved);
                    const legacy = legacyMatches.length === 1 ? legacyMatches[0] : undefined;
                    const selected = exact?.id || legacy?.id || saved;
                    return (
                      <label className="settings-policy-field" key={taskType}>
                        <span>{label}</span>
                        <select aria-label={`${label}模型`} disabled={preferences.modelRouting.strategy !== "task_type"} value={selected} onChange={(event) => void updateModelRouting({ taskTypes: { [taskType]: event.target.value } })}>
                          <option value="">默认模型</option>
                          {saved && !exact && !legacy && <option value={saved}>已保存旧值：{saved}</option>}
                          {models.map(model => <option key={model.id} value={model.id}>{model.provider} · {model.name}</option>)}
                        </select>
                        {saved && !exact && <small>{legacy ? "兼容旧模型 ID；重新选择后保存具体供应商配置。" : legacyMatches.length > 1 ? "旧模型 ID 对应多个供应商，请选择具体配置。旧值仍保留。" : "旧配置未匹配当前模型，旧值仍保留；可重新选择。"}</small>}
                      </label>
                    );
                  })}
                </div>
              </div>
                </div>
              </details>
            </section>
          )}
          {tab === "policies" && (
            <section className="settings-section">
              <div className="settings-heading">
                <div>
                  <h1>质量检查</h1>
                  <p>交付前检查当前成果，并提示需要人工核对的内容。</p>
                </div>
              </div>
              <div className="settings-group quality-preferences" data-setting-id="quality" tabIndex={-1}>
                <div className="settings-group-title"><div><h3>在线文档发布检查</h3><small>控制飞书与钉钉在线文档发布前的结构质量门禁。</small></div></div>
                <div className="settings-row"><div><b>发布前强制质量检查</b><small>开启后，结构等阻断问题会阻止在线文档发布。每次发布仍会实时检查文件。</small></div><Switch checked={preferences.qualityGateEnabled && preferences.forceQualityCheckBeforeDelivery} label="在线文档发布前强制质量检查" onChange={(checked) => void updatePreferences({ qualityGateEnabled: checked, forceQualityCheckBeforeDelivery: checked })} /></div>
                <p className="settings-quality-note">关闭后仍保留检查结果；空文件、版本冲突和未核对的外部结果始终阻止发布。原型交互和业务规则仍需要实际试用；模板迁移继续检查所选模板的必填结构。</p>
              </div>

            </section>
          )}
          {tab === "permissions" && (
            <section className="settings-section" data-setting-id="approvals" tabIndex={-1}>
              <div className="settings-heading">
                <div>
                  <h1>权限与审批</h1>
                  <p>
                    能力权限决定 Agent 能做什么；目录权限决定它能访问哪些文件。
                  </p>
                </div>
              </div>
              {approvals.length > 0 && (
                <div className="pending-settings">
                  <div className="settings-group-title">
                    <h3>正在等待你确认</h3>
                    <span>{approvals.length}</span>
                  </div>
                  {approvals.map((item) => (
                    <article className="pending-approval" key={item.id}>
                      <div>
                        <b>{item.summary}</b>
                        <small>
                          {capabilityCopy[item.capability].name} ·{" "}
                          {new Date(item.createdAt).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </small>
                      </div>
                      <div className="button-row">
                        <button
                          onClick={() => void resolveApproval(item.id, "deny")}
                          disabled={busy === `approval-${item.id}`}
                        >
                          拒绝
                        </button>
                        <button
                          disabled={busy === `approval-${item.id}`}
                          onClick={() =>
                            void resolveApproval(item.id, "allow_once")
                          }
                        >
                          仅这次允许
                        </button>
                        <button
                          className="primary"
                          disabled={busy === `approval-${item.id}`}
                          onClick={() => void resolveApproval(item.id, "allow")}
                        >
                          允许并记住
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
              <div className="settings-group">
                <div className="settings-group-title">
                  <div>
                    <h3>Agent 自动工具权限</h3>
                    <small>
                      控制会话中由 Agent 发起的调用。你亲自点击测试、发布或“允许”属于当次明确操作。
                    </small>
                  </div>
                  <small>“每次询问”会在执行前暂停任务</small>
                </div>
                <div className="permission-list">
                  {(Object.keys(capabilityCopy) as PermissionCapability[]).map(
                    (capability) => (
                      <div className="permission-row" key={capability}>
                        <div>
                          <b>{capabilityCopy[capability].name}</b>
                          <small>
                            {capabilityCopy[capability].description}
                          </small>
                        </div>
                        <div
                          className="segments"
                          aria-label={capabilityCopy[capability].name}
                        >
                          {(
                            ["ask", "allow", "deny"] as PermissionDecision[]
                          ).map((decision) => (
                            <button
                              key={decision} aria-pressed={(state?.permissions?.[capability] || "ask") === decision}
                              className={
                                (state?.permissions?.[capability] || "ask") ===
                                decision
                                  ? "active"
                                  : ""
                              }
                              onClick={() =>
                                void perform(
                                  `permission-${capability}`,
                                  async () => {
                                    await call({
                                      type: "permissionSet",
                                      capability,
                                      decision,
                                    });
                                    await onRefresh();
                                    notify(
                                      `${capabilityCopy[capability].name}已设为“${decisionCopy[decision]}”`,
                                    );
                                  },
                                )
                              }
                            >
                              {decisionCopy[decision]}
                            </button>
                          ))}
                        </div>
                      </div>
                    ),
                  )}
                </div>
                <div className="settings-note"><b>运行权限模式</b><p>标准权限沿用每项能力的询问、允许或禁止。自动接受会自动允许成果编辑；完全访问会自动允许未明确禁止的能力。明确禁止始终优先，完全访问也不会提升 Windows 身份或绕过路径、版本和结果核对。</p></div>
              </div>
              <div className="settings-row"><div><b>目录权限</b><small>在工作空间中管理目录访问；拒绝或只读会覆盖成果写入能力。</small></div><button onClick={() => selectTab("workspace")}>管理目录权限 →</button></div>
              <details className="settings-advanced" data-setting-id="assistance-limits" tabIndex={-1} open={Boolean(advancedGroups.assistance)} onToggle={event => toggleAdvanced("assistance", event.currentTarget.open)}>
                <summary>高级：辅助任务限制与工具</summary>
                <div className="settings-advanced-body">
              <div className="settings-group">
                <div className="settings-group-title"><div><h3>辅助任务限制</h3><small>只读研究与检查可同时进行；正式写入仍集中处理，并遵循目录和工具权限。</small></div></div>
                <div className="settings-policy-grid">
                  <label className="settings-policy-field"><span>单次任务数上限</span><input type="number" min={1} max={32} value={preferences.maxParallelTasks} onChange={(event) => setPreferences((value) => ({ ...value, maxParallelTasks: Math.max(1, Math.min(32, Number(event.target.value) || 1)) }))} onBlur={() => void updatePreferences({ maxParallelTasks: preferences.maxParallelTasks })} /></label>
                  <label className="settings-policy-field"><span>同时运行上限</span><input type="number" min={1} max={16} value={preferences.maxParallelConcurrency} onChange={(event) => setPreferences((value) => ({ ...value, maxParallelConcurrency: Math.max(1, Math.min(16, Number(event.target.value) || 1)) }))} onBlur={() => void updatePreferences({ maxParallelConcurrency: preferences.maxParallelConcurrency })} /></label>
                  <label className="settings-policy-field"><span>辅助任务总数上限</span><input type="number" min={1} max={32} value={preferences.subAgentMaxTasks} onChange={(event) => setPreferences((value) => ({ ...value, subAgentMaxTasks: Math.max(1, Math.min(32, Number(event.target.value) || 1)) }))} onBlur={() => void updatePreferences({ subAgentMaxTasks: preferences.subAgentMaxTasks })} /></label>
                </div>
                <div className="settings-group-title settings-subheading"><div><h3>辅助任务可用工具</h3><small>关闭后，辅助任务不会获得对应的只读工具。</small></div></div>
                <div className="settings-tool-grid">
                  {defaultAppPreferences.subAgentTools.map((tool) => {
                    const enabled = preferences.subAgentTools.includes(tool);
                    return <label className="settings-tool-option" key={tool}><Switch checked={enabled} label={subAgentToolLabels[tool] || tool} onChange={(checked) => void updatePreferences({ subAgentTools: checked ? [...new Set([...preferences.subAgentTools, tool])] : preferences.subAgentTools.filter((item) => item !== tool) })} /><span>{subAgentToolLabels[tool] || tool}</span></label>;
                  })}
                </div>
              </div>
                </div>
              </details>
            </section>
          )}
          <section className="settings-section" hidden={tab !== "workspace"}>
              <div className="settings-heading">
                <div>
                  <h1>工作空间</h1>
                  <p>工作空间汇总已授权目录，不要求资料位于同一个文件夹。</p>
                </div>
                <button
                  onClick={() =>
                    void perform("workspace", async () => {
                      const selected = await call({ type: "workspace" });
                      if (selected == null) return;
                      await onRefresh();
                      notify("工作空间已更新");
                    })
                  }
                >
                  选择工作目录
                </button>
              </div>
              <div className="workspace-root" data-setting-id="workspace-root" tabIndex={-1}>
                <span>当前工作目录</span>
                <b>{state?.root || "尚未选择"}</b>
              </div>
              <ProjectStructureEditor key={state?.root || "default"} root={state?.root || ""} call={call} onRefresh={onRefresh} onNotice={onNotice} onError={onError}/>
              <div className="settings-group" data-setting-id="directory-access" tabIndex={-1}>
                <div className="settings-group-title">
                  <h3>目录权限</h3>
                  <button disabled={busy === "mount-add"} onClick={() => void perform("mount-add", async () => {
                    const selected = await call({ type: "mount", write: false });
                    if (selected == null) return;
                    await onRefresh();
                    notify("参考目录已添加，默认只读");
                  })}>添加参考目录</button>
                </div>
                <div className="mount-list">
                  <p className="inline-hint">参考资料原件始终只读。可导入新文件；转换或脚本请先创建处理副本。</p>
                  {state?.mounts.map((mount) => (
                    <MountPermission
                      key={mount.id}
                      mount={mount}
                      busy={busy}
                      onChange={(enabled, write) =>
                        void perform(`mount-${mount.id}`, async () => {
                          await call({
                            type: "mountAccess",
                            id: mount.id,
                            enabled,
                            write,
                          });
                          await onRefresh();
                          notify("目录权限已更新");
                        })
                      }
                    />
                  ))}
                </div>
              </div>
              <details className="settings-advanced" data-setting-id="share-lock" tabIndex={-1} open={Boolean(advancedGroups.sharing)} onToggle={event => toggleAdvanced("sharing", event.currentTarget.open)}>
                <summary>高级：共享编辑保护</summary>
                <div className="settings-advanced-body">
              <div className="settings-group">
                <div className="settings-group-title"><div><h3>共享编辑保护</h3><small>新申请的读写锁在有效期内保护文件；到期后需要重新申请。</small></div></div>
                <div className="settings-row"><div><b>共享锁有效期</b><small>当前 {Math.round(preferences.shareLockTtlMs / 60000)} 分钟；可选范围为 1 分钟至 24 小时。</small></div><select aria-label="共享锁有效期" value={preferences.shareLockTtlMs} onChange={(event) => void updatePreferences({ shareLockTtlMs: Number(event.target.value) })}>{![120000,300000,900000,1800000,3600000,14400000,86400000].includes(preferences.shareLockTtlMs) && <option value={preferences.shareLockTtlMs}>已保存：{Math.round(preferences.shareLockTtlMs / 60000)} 分钟</option>}<option value={120000}>2 分钟</option><option value={300000}>5 分钟</option><option value={900000}>15 分钟</option><option value={1800000}>30 分钟</option><option value={3600000}>1 小时</option><option value={14400000}>4 小时</option><option value={86400000}>24 小时</option></select></div>
              </div>
                </div>
              </details>
            </section>
          <section className="settings-section" hidden={tab !== "prompt"}>
            <SystemPromptSettings call={call} onNotice={onNotice} onError={onError}/>
          </section>
          {tab === "connections" && (
            <section className="settings-section" data-setting-id="connections" tabIndex={-1}>
              <div className="settings-heading">
                <div>
                  <h1>连接</h1>
                  <p>
                    管理 MCP 与官方 CLI 连接；能力检查通过不代表业务发布已验证。
                  </p>
                </div>
              </div>
              <ConnectionsPanel
                connections={state?.connections || []}
                call={call}
                onRefresh={onRefresh}
                onPrefill={onPrefillSession}
                onNotice={onNotice}
                onError={onError}
              />
              <details className="settings-advanced" data-setting-id="manual-tools" tabIndex={-1} open={Boolean(advancedGroups.manual)} onToggle={event => toggleAdvanced("manual", event.currentTarget.open)}>
                <summary>高级：手动调用工具</summary>
                <div className="settings-advanced-body">
              <McpExecute connections={state?.connections || []} call={call} />
                </div>
              </details>

            </section>
          )}
          {tab === "archive" && (
            <section className="settings-section" data-setting-id="archive" tabIndex={-1}>
              <div className="settings-heading"><div><h1>归档会话</h1><p>归档内容不会出现在左侧最近对话中，需要时可以恢复。</p></div></div>
              <div className="task-list">
                {(state?.conversations || []).filter((conversation) => conversation.archived).map((conversation) => (
                  <div className="task" key={conversation.id}><div><b>{conversation.title}</b><small>{conversation.messages.length} 条消息</small></div><button onClick={() => void perform(`restore-${conversation.id}`, async () => { await call({ type: "conversation", id: conversation.id, archived: false }); await onRefresh(); notify("会话已恢复"); })}>恢复会话</button><button onClick={() => onOpenConversation(conversation.id)}>打开</button>{onDeleteConversation && <button className="danger" onClick={() => { if (!window.confirm(`确定永久删除“${conversation.title}”吗？`)) return; void perform(`delete-${conversation.id}`, async () => { await onDeleteConversation(conversation.id); await onRefresh(); notify("会话已删除"); }); }}>删除</button>}</div>
                ))}
                {!(state?.conversations || []).some((conversation) => conversation.archived) && <p className="empty compact">暂无归档会话</p>}
              </div>
            </section>
          )}
          {tab === "general" && (
            <section className="settings-section">
              <div className="settings-heading">
                <div>
                  <h1>通用</h1>
                  <p>选择工作台的外观主题。</p>
                </div>
              </div>
              <div className="settings-group">
                <div className="settings-group-title"><h3>外观</h3></div>
                <div className="theme-options" data-setting-id="appearance" tabIndex={-1} role="radiogroup" aria-label="界面主题">
                  {([
                    ["reference", "经典瓷白", "明亮清晰的工作界面 · 朱橙强调"],
                    ["graphite", "石墨深色", "低眩光的深色工作台"],
                    ["sand", "柔和米色", "温和的暖色纸张质感"],
                  ] as Array<[ThemeName, string, string]>).map(([value, label, description]) => (
                    <button key={value} type="button" role="radio" aria-checked={theme === value} className={`theme-option ${value} ${theme === value ? "selected" : ""}`} onClick={() => onThemeChange(value)}>
                      <span className="theme-swatch"><i /><i /><i /></span><b>{label}</b><small>{description}</small>
                    </button>
                  ))}
                </div>
              </div>
            </section>
          )}
        </div>
        {modelDraft && (
          <div className="subdialog-layer">
            <form
              className="subdialog"
              noValidate
              onSubmit={(event) => {
                event.preventDefault();
                void saveModel();
              }}
            >
              <div className="subdialog-heading">
                <div>
                  <span className="eyebrow">
                    {modelDraft.id ? "编辑模型" : "新模型"}
                  </span>
                  <h2>
                    {modelDraft.id ? "编辑模型" : "添加模型"}
                  </h2>{modelDraft.id && <small className="editor-name" title={modelDraft.name}>{modelDraft.name || "模型配置"}</small>}
                </div>
                <button
                  type="button"
                  className="icon-button"
                  aria-label="关闭模型表单"
                  onClick={closeModelDraft}
                >
                  <Icon name="close" size={17}/>
                </button>
              </div>
              <div className="subdialog-body">
              {feedback && (
                <div
                  className={`modal-feedback ${feedback.kind}`}
                  role={feedback.kind === "error" ? "alert" : "status"}
                >
                  {feedback.text}
                </div>
              )}
              {!modelDraft.id && (
                <label>
                  常用配置
                  <select
                    autoFocus
                    defaultValue=""
                    onChange={(event) => {
                      const preset = modelPresets.find(
                        (item) => item.id === event.target.value,
                      );
                      if (preset)
                        setModelDraft((value) => ({
                          ...value!,
                          provider: preset.provider,
                          name: preset.name,
                          baseUrl: preset.baseUrl,
                          modelId: preset.modelId,
                          protocol: preset.protocol,
                        }));
                    }}
                  >
                    <option value="" disabled>
                      选择供应商和模型
                    </option>
                    {modelPresets.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <div className="form-grid">
                <label>
                  供应商名称
                  <input
                    required
                    value={modelDraft.provider}
                    onChange={(event) =>
                      setModelDraft((value) => ({
                        ...value!,
                        provider: event.target.value,
                      }))
                    }
                    placeholder="例如 openai"
                  />
                </label>
                <label>
                  显示名称
                  <input
                    required
                    value={modelDraft.name}
                    onChange={(event) =>
                      setModelDraft((value) => ({
                        ...value!,
                        name: event.target.value,
                      }))
                    }
                    placeholder="会话中看到的名称"
                  />
                </label>
              </div>
              <details className="advanced" open={modelDetailsOpen} onToggle={(event) => setModelDetailsOpen(event.currentTarget.open)}>
                <summary>连接详情</summary>
                <label>
                  API 地址
                  <input
                    required
                    type="url"
                    value={modelDraft.baseUrl}
                    onChange={(event) =>
                      setModelDraft((value) => ({
                        ...value!,
                        baseUrl: event.target.value,
                      }))
                    }
                  />
                </label>
                <label>
                  模型 ID
                  <input
                    required
                    value={modelDraft.modelId}
                    onChange={(event) =>
                      setModelDraft((value) => ({
                        ...value!,
                        modelId: event.target.value,
                      }))
                    }
                    placeholder="选择常用配置后会自动填写"
                  />
                </label>
              </details>
              <label>
                接口协议
                <select
                  value={modelDraft.protocol}
                  onChange={(event) =>
                    setModelDraft((value) => ({
                      ...value!,
                      protocol: event.target.value as ModelProtocol,
                    }))
                  }
                >
                  <option value="openai-completions">
                    OpenAI 兼容 · chat/completions
                  </option>
                  <option value="openai-responses">
                    OpenAI 兼容 · responses
                  </option>
                  <option value="anthropic-messages">
                    Anthropic 兼容 · messages
                  </option>
                </select>
              </label>
              <ModelLimitsSettings
                call={call}
                model={modelDraft}
                savedModel={models.find(item => item.id === modelDraft.id)}
                onChange={patch => setModelDraft(value => ({ ...value!, ...patch }))}
              />
              <label className="check model-vision-check">
                <input
                  type="checkbox"
                  checked={Boolean(modelDraft.supportsVision)}
                  onChange={(event) =>
                    setModelDraft((value) => ({
                      ...value!,
                      supportsVision: event.target.checked,
                    }))
                  }
                />
                支持图片输入（视觉模型）
              </label>
              <label>
                API 密钥
                <input
                  type="password"
                  autoComplete="off"
                  value={modelDraft.key}
                  onChange={(event) =>
                    setModelDraft((value) => ({
                      ...value!,
                      key: event.target.value,
                    }))
                  }
                  placeholder={
                    modelDraft.id ? "留空保留已保存的密钥" : "输入 API 密钥"
                  }
                />
                <small>
                  {modelDraft.id
                    ? "留空会保留原密钥；输入新值会替换。若修改 API 地址而未填新密钥，为避免把密钥发送到其他服务，原密钥会被清除。"
                    : "密钥只保存在本机，不会在设置中回显。"}
                </small>
              </label>
              </div><div className="subdialog-actions">
                <button type="button" onClick={closeModelDraft}>
                  取消
                </button>
                <button
                  className="primary"
                  disabled={busy === "model-save"}
                  type="submit"
                >
                  保存模型
                </button>
              </div>
            </form>
          </div>
        )}
      </section>
    </div>
  );
}

function SystemPromptSettings({call,onNotice,onError}:{call:Call;onNotice:(text:string)=>void;onError:(text:string)=>void}) {
 const [view,setView]=useState<SystemPromptView>();
 const [content,setContent]=useState("");
 const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false);
 const [feedback,setFeedback]=useState<{kind:"success"|"error";text:string}>();
 useEffect(()=>{let disposed=false;
  void call({type:"systemPromptGet"}).then(value=>{if(disposed)return;const next=value as SystemPromptView;setView(next);setContent(next.content);}).catch(reason=>{if(!disposed)setFeedback({kind:"error",text:reason instanceof Error?reason.message:String(reason)});}).finally(()=>{if(!disposed)setLoading(false);});
  return()=>{disposed=true;};
 },[call]);
 const dirty=Boolean(view&&content!==view.content);
 const invalid=!content.trim()?"系统提示词不能为空。":content.trim().length>16000?"系统提示词不能超过16000个字符。":content.includes("\0")?"系统提示词不能包含空字符。":"";
 const save=async(reset=false)=>{
  if(busy||!view||(!reset&&invalid))return;setBusy(true);setFeedback(undefined);
  try{
   const next=await call(reset?{type:"systemPromptReset"}:{type:"systemPromptSave",content}) as SystemPromptView;
   setView(next);setContent(next.content);const text=reset?"默认系统提示词已恢复并保存，下一任务生效。":"系统提示词已保存，下一任务生效。";
   setFeedback({kind:"success",text});onNotice(text);
  }catch(reason){const text=reason instanceof Error?reason.message:String(reason);setFeedback({kind:"error",text});onError(text);}
  finally{setBusy(false);}
 };
 return <div className="system-prompt-settings" data-setting-id="system-prompt" tabIndex={-1}>
  <div className="settings-heading"><div><h1>系统提示词</h1><p>设置所有任务共同遵循的回答和交付规范。保存后下一任务生效。</p></div></div>
  {loading?<p role="status">正在读取系统提示词…</p>:view?<>
   <label className="system-prompt-field"><span>回答与格式规范</span><textarea aria-label="系统提示词内容" aria-describedby="system-prompt-state" value={content} disabled={busy} spellCheck={false} onChange={event=>{setContent(event.target.value);setFeedback(undefined);}}/></label>
   {invalid&&<p className="system-prompt-error" role="alert">{invalid}</p>}
   <div className="system-prompt-actions"><small id="system-prompt-state" aria-live="polite">{busy?"正在保存…":dirty?"有未保存修改":view.isDefault?"默认规范已保存":"已保存"}</small><button type="button" disabled={busy||(view.isDefault&&!dirty)} onClick={()=>void save(true)}>恢复默认</button><button type="button" disabled={busy||!dirty} onClick={()=>{setContent(view.content);setFeedback(undefined);}}>放弃修改</button><button type="button" className="primary" disabled={busy||!dirty||Boolean(invalid)} onClick={()=>void save()}>{busy?"正在保存…":"保存提示词"}</button></div>
  </>:null}
  {feedback&&<p className={`inline-feedback ${feedback.kind}`} role={feedback.kind==="error"?"alert":"status"}>{feedback.text}</p>}
 </div>;
}

function MountPermission({
  mount,
  busy,
  onChange,
}: {
  mount: Mount;
  busy: string;
  onChange: (enabled: boolean, write: boolean) => void;
}) {
  return (
    <div className="permission-row mount-permission">
      <div>
        <b>{mount.name}</b>
        <small className="path">{mount.path}</small>
      </div>
      <select
        aria-label={`${mount.name}目录权限`}
        disabled={busy === `mount-${mount.id}`}
        value={!mount.enabled ? "deny" : mount.write ? "read_write" : "read"}
        onChange={(event) => {
          const value = event.target.value;
          onChange(value !== "deny", value === "read_write");
        }}
      >
        <option value="deny">不允许访问</option>
        <option value="read">只读</option>
        <option value="read_write">可读写</option>
      </select>

    </div>
  );
}
