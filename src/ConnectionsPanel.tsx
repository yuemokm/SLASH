import {NetlifyPublishingControls} from './NetlifyPublishingControls';
import { connectionDiscoveriesSchema } from "../shared/types";
import { Icon } from "./Icon";
import React, { useEffect, useRef, useState } from "react";
import type { Connection, ConnectionDiscovery, Request } from "../shared/types";
import {McpAuthControls,McpPresetPicker} from './McpConnectionControls';
import {officialMcpPreset,mcpConnectionFields,type McpConnectionOptions} from '../shared/mcp-connections';

type Call = (request: Request) => Promise<unknown>;
type Draft = McpConnectionOptions & {
  id?: string;
  name: string;
  kind: "mcp" | "cli";
  transport: "http" | "stdio";
  provider: string;
  command: string;
  url: string;
  argsText: string;
  mcpNetworkAllowedOriginsText?: string;
  enabled: boolean;
  source?: "manual" | "discovered";
  discoveryId?: string;
  executableVersion?: string;
  capabilities?: string[];
  healthStatus?: Connection["healthStatus"];
  lastCheckedAt?: string;
  healthSummary?: string;
  capabilityHash?: string;
};
const initialDraft: Draft = {
  name: "",
  kind: "mcp",
  transport: "stdio",
  provider: "",
  command: "",
  url: "",
  argsText: "[]",
  enabled: true,
};

function Switch({
  checked,
  label,
  onChange,
}: {
  checked: boolean;
  label: string;
  onChange: (next: boolean) => void;
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

export function ConnectionsPanel({
  connections,
  call,
  onRefresh,
  onPrefill,
  onNotice,
  onError,
}: {
  connections: Connection[];
  call: Call;
  onRefresh: () => Promise<void>;
  onPrefill: (text: string) => void;
  onNotice: (text: string) => void;
  onError: (text: string) => void;
}) {
  const [draft, setDraft] = useState<Draft>();
  const [discoveries, setDiscoveries] = useState<ConnectionDiscovery[]>([]);
  const [discovering, setDiscovering] = useState(false);
  const [busy, setBusy] = useState("");
  const [results, setResults] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState<{
    kind: "error" | "success";
    text: string;
  }>();
  const formRef = useRef<HTMLFormElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const openDraft = (next: Draft) => {
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setFeedback(undefined);
    setDraft(next);
  };
  const closeDraft = () => {
    setFeedback(undefined);
    setDraft(undefined);
    requestAnimationFrame(() => returnFocusRef.current?.focus());
  };
  useEffect(() => {
    if (draft)
      requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>("select, input, button")?.focus());
  }, [Boolean(draft)]);
  useEffect(() => {
    void discover(false);
  }, []);
  const run = async (id: string, action: () => Promise<void>) => {
    setBusy(id);
    setFeedback(undefined);
    try {
      await action();
    } catch (reason) {
      const text = reason instanceof Error ? reason.message : String(reason);
      setFeedback({ kind: "error", text });
      onError(text);
      await onRefresh().catch(() => undefined);
    } finally {
      setBusy("");
    }
  };
  const notify = (text: string) => {
    setFeedback({ kind: "success", text });
    onNotice(text);
  };
  async function discover(showFeedback = true) {
    setDiscovering(true);
    try {
      const items = connectionDiscoveriesSchema.parse(await call({
        type: "connectionDiscover",
      }));
      setDiscoveries(items);
      if (showFeedback)
        setFeedback({
          kind: "success",
          text: items.length
            ? `找到 ${items.length} 个官方 CLI`
            : "没有找到已安装的官方 CLI",
        });
    } catch (reason) {
      const text = reason instanceof Error ? reason.message : String(reason);
      setFeedback({ kind: "error", text });
    } finally {
      setDiscovering(false);
    }
  }
  const save = async () => {
    if (!draft) return;
    const name = draft.name.trim();
    const command = draft.command.trim();
    const url = draft.url.trim();
    if (!name) {
      setFeedback({ kind: "error", text: "请填写连接名称" });
      return;
    }
    if (draft.kind === "cli" && !command) {
      setFeedback({ kind: "error", text: "请选择或填写 CLI 可执行文件" });
      return;
    }
    if (draft.kind === "cli" && !draft.provider.trim()) {
      setFeedback({ kind: "error", text: "请填写服务商名称" });
      return;
    }
    if (draft.kind === "mcp" && !draft.mcpPublisher) {
      if(draft.mcpPreset==='supabase')try{const selected=new URL(url);officialMcpPreset('supabase',{projectRef:selected.searchParams.get('project_ref')??undefined,readOnly:selected.searchParams.get('read_only')!=='false'});}catch(error){setFeedback({kind:'error',text:error instanceof Error?error.message:'项目范围无效'});return;}
      if (draft.transport === "http" && !url) {
        setFeedback({ kind: "error", text: "请填写 MCP 服务地址" });
        return;
      }
      if (draft.transport === "stdio" && !command) {
        setFeedback({ kind: "error", text: "请选择或填写 MCP 本机程序" });
        return;
      }
      if (draft.transport === "http") {
        try {
          const parsed = new URL(url);
          if ((parsed.protocol !== "http:" && parsed.protocol !== "https:") || parsed.username || parsed.password)
            throw new Error();
        } catch {
          setFeedback({ kind: "error", text: "请输入有效的 HTTP 或 HTTPS MCP 地址" });
          return;
        }
      }
    }
    await run("save", async () => {
      let args: unknown;
      try {
        args = JSON.parse(draft.argsText);
      } catch {
        throw Error("高级参数不是有效的 JSON 数组");
      }
      if (!Array.isArray(args) || args.some((item) => typeof item !== "string"))
        throw Error("高级参数必须是字符串数组");
      if(draft.mcpPublisher){const checked=mcpConnectionFields.mcpPublisher.safeParse(draft.mcpPublisher);if(!checked.success)throw Error('请输入有效的 Netlify Site ID');}
      const existing = draft.id
        ? connections.find((item) => item.id === draft.id)
        : undefined;
      const parsedOrigins=mcpConnectionFields.mcpNetworkAllowedOrigins.safeParse(draft.kind==='mcp'&&draft.transport==='http'&&!draft.mcpPreset?(draft.mcpNetworkAllowedOriginsText??'').split(/\r?\n/).map(value=>value.trim()).filter(Boolean):undefined);
      if(!parsedOrigins.success)throw Error('公司内网登录地址最多 16 个，请每行填写一个完整 HTTPS 地址，不含路径、账号或参数。');
      const origins=parsedOrigins.data;
      await call({
        type: "connection",
        connection: {
          ...existing,
          id: draft.id || crypto.randomUUID(),
          name,
          kind: draft.kind,
          provider: draft.provider || undefined,
          command: draft.mcpPublisher ? "" : draft.kind === "mcp" && draft.transport === "http" ? "" : command,
          args:draft.mcpPublisher?[]:args,
          url: !draft.mcpPublisher&&draft.kind === "mcp" && draft.transport === "http" ? url : undefined,
          ...({mcpPublisher:draft.mcpPublisher,mcpAuth:draft.kind==='mcp'&&draft.transport==='http'?draft.mcpAuth:undefined,mcpPreset:draft.kind==='mcp'&&draft.transport==='http'?draft.mcpPreset:undefined,mcpNetworkAllowedOrigins:origins?.length?origins:undefined} as McpConnectionOptions),
          enabled: draft.enabled,
          source: draft.source,
          discoveryId: draft.discoveryId,
          executableVersion: draft.executableVersion,
          capabilities: draft.capabilities,
          healthStatus: draft.healthStatus,
          lastCheckedAt: draft.lastCheckedAt,
          healthSummary: draft.healthSummary,
          capabilityHash: draft.capabilityHash,
        },
      });
      closeDraft();
      await onRefresh();
      notify("连接已保存，请再运行一次连接测试");
    });
  };
  const edit = (item: Connection) =>
    openDraft({
      id: item.id,
      name: item.name,
      kind: item.kind,
      transport: item.url ? "http" : "stdio",
      provider: item.provider || "",
      command: item.command,
      url: item.url || "",
      mcpPublisher:item.mcpPublisher,
      mcpAuth:(item as Connection&McpConnectionOptions).mcpAuth,
      mcpPreset:(item as Connection&McpConnectionOptions).mcpPreset,
      mcpNetworkAllowedOriginsText:item.mcpNetworkAllowedOrigins?.join('\n')??'',
      argsText: JSON.stringify(item.args, null, 2),
      enabled: item.enabled,
      source: item.source,
      discoveryId: item.discoveryId,
      executableVersion: item.executableVersion,
      capabilities: item.capabilities,
      healthStatus: item.healthStatus,
      lastCheckedAt: item.lastCheckedAt,
      healthSummary: item.healthSummary,
      capabilityHash: item.capabilityHash,
    });
  const toggle = (item: Connection, next: boolean) =>
    run(`toggle-${item.id}`, async () => {
      await call({
        type: "connection",
        connection: { ...item, enabled: next },
      });
      await onRefresh();
      notify(next ? "连接已启用" : "连接已停用");
    });
  const prefer = (item: ConnectionDiscovery) =>
    run(`prefer-${item.id}`, async () => {
      for (const current of connections.filter(
        (value) =>
          value.kind === "cli" &&
          value.provider === item.provider &&
          value.enabled,
      ))
        await call({
          type: "connection",
          connection: { ...current, enabled: false },
        });
      await call({
        type: "connection",
        connection: {
          id: `discovered-${item.id}`.replace(/[^\w.-]/g, "-"),
          name: item.name,
          kind: "cli",
          provider: item.provider,
          command: item.command,
          args: [],
          enabled: true,
          source: "discovered",
          discoveryId: item.id,
          executableVersion: item.version,
          capabilities: item.capabilities,
          available: item.available,
          diagnostic: item.diagnostic,
        },
      });
      await onRefresh();
      notify(`已优先使用 ${item.name}`);
    });
  return (
    <section className="connection-page">
      <div className="page-intro">
        <div>
          <p className="muted">
            在这里管理在线发布和外部工具。连接成功只表示工具可用，实际发布仍会单独确认。
          </p>
        </div>
        <div className="button-row">
          <button
            onClick={() =>
              onPrefill(
                "请帮我配置一个外部连接。先问我想连接什么服务，再检查本机与现有设置，给出最少必填项。",
              )
            }
          >
            在会话中协助配置
          </button>
          <button className="primary" onClick={() => openDraft(initialDraft)}>
            添加连接
          </button>
        </div>
      </div>
      {feedback && (
        <div
          className={`inline-feedback ${feedback.kind}`}
          role={feedback.kind === "error" ? "alert" : "status"}
        >
          {feedback.text}
          <button type="button" onClick={() => setFeedback(undefined)}><Icon name="close" size={16}/></button>
        </div>
      )}
      <div className="connection-list">
        {connections.map((item) => (
          <article
            className={`connection-line ${item.enabled ? "" : "disabled"}`}
            key={item.id}
          >
            <div className={`connection-logo ${item.kind}`}>
              <Icon name={item.kind === "cli" ? "code" : "external"} size={18}/>
            </div>
            <div className="connection-main">
              <div>
                <b>{item.name}</b>
                <span>
                  {item.kind === "cli" ? "官方 CLI" : "MCP"}
                  {item.provider ? ` · ${item.provider}` : ""}
                </span>
              </div>
              <small>
                {item.mcpPublisher?`Netlify 站点 ${item.mcpPublisher.siteId}`:item.url || item.command || "还没有配置地址"}
                {item.executableVersion ? ` · ${item.executableVersion}` : ""}
              </small>
              {!item.mcpPublisher && <span className={`connection-health ${item.healthStatus || "unknown"}`}>
                {item.healthStatus === "healthy"
                  ? "能力可用"
                  : item.healthStatus === "degraded"
                    ? "需要配置"
                    : item.healthStatus === "failed"
                      ? "检查失败"
                      : "未检查"}
              </span>}
              {!item.mcpPublisher && item.lastCheckedAt && (
                <small className="connection-checked">
                  最近检查：{new Date(item.lastCheckedAt).toLocaleString()}
                  {item.healthSummary ? ` · ${item.healthSummary}` : ""}
                </small>
              )}
              {item.diagnostic && (
                <small className="diagnostic">{item.diagnostic}</small>
              )}
              {item.mcpPublisher&&<NetlifyPublishingControls id={item.id} siteId={item.mcpPublisher.siteId} enabled={item.enabled} call={call} onNotice={notify} onError={onError}/>}
              {item.kind==='mcp'&&item.url&&item.mcpAuth==='oauth'&&<McpAuthControls id={item.id} enabled={item.enabled} call={call} onNotice={notify} onError={onError}/>}
            </div>
            <div className="connection-actions">
              {!item.mcpPublisher && <button
                disabled={busy === `test-${item.id}`}
                onClick={() =>
                  void run(`test-${item.id}`, async () => {
                    const result = await call(item.mcpPublisher?{type:'mcpPublisherVerify',id:item.id,siteId:item.mcpPublisher.siteId}:{type:'testConnection',id:item.id});
                    setResults((value) => ({
                      ...value,
                      [item.id]: JSON.stringify(result),
                    }));
                    await onRefresh();
                    notify("连接测试已完成");
                  })
                }
              >
                测试
              </button>}
              <button onClick={() => edit(item)}>编辑</button>
              <button
                className="quiet danger-text"
                onClick={() =>
                  void run(`remove-${item.id}`, async () => {
                    await call({ type: "connectionRemove", id: item.id });
                    await onRefresh();
                    notify("连接已移除");
                  })
                }
              >
                移除
              </button>
              <Switch
                checked={item.enabled}
                label={`${item.enabled ? "停用" : "启用"}${item.name}`}
                onChange={(next) => void toggle(item, next)}
              />
            </div>
            {results[item.id] && (
              <small className="connection-result">{results[item.id]}</small>
            )}
          </article>
        ))}
        {!connections.length && (
          <div className="settings-empty">
            <b>还没有外部连接</b>
            <p>可以先自动查找飞书或钉钉官方 CLI，也可以手动添加 MCP。</p>
          </div>
        )}
      </div>
      <section className="discovery-panel">
        <div className="discovery-heading">
          <div>
            <span className="eyebrow">本机发现</span>
            <h2>官方 CLI</h2>
            <p>优先使用自动发现的可执行文件，避免手动填写路径。</p>
          </div>
          <button disabled={discovering} onClick={() => void discover()}>
            {discovering ? "正在查找…" : "重新查找"}
          </button>
        </div>
        {discoveries.length > 0 ? (
          <div className="discovery-list">
            {discoveries.map((item) => (
              <div className="discovery-row" key={item.id}>
                <div className="provider-mark">
                  {item.provider.slice(0, 1).toUpperCase()}
                </div>
                <div>
                  <b>{item.name}</b>
                  <small>
                    {item.command}
                    {item.version ? ` · ${item.version}` : ""}
                  </small>
                  <span>
                    {item.available
                      ? "可以使用"
                      : item.diagnostic || "当前不可用"}
                  </span>
                </div>
                <button
                  disabled={!item.available || busy === `prefer-${item.id}`}
                  onClick={() => void prefer(item)}
                >
                  优先使用
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="empty compact">
            没有找到已安装的官方 CLI。仍可通过“添加连接”选择可执行文件。
          </p>
        )}
      </section>
      {draft && (
        <div
          className="form-modal-layer"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeDraft();
          }}
        >
          <form
            ref={formRef}
            className="connection-form-modal"
            role="dialog"
            aria-modal="true"
            aria-label={draft.id ? "编辑连接" : "添加连接"}
            noValidate
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                event.stopPropagation();
                closeDraft();
                return;
              }
              if (event.key !== "Tab") return;
              const focusable = Array.from(formRef.current?.querySelectorAll<HTMLElement>(
                'button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),summary,[tabindex]:not([tabindex="-1"])',
              ) || []).filter((item) => item.offsetParent !== null);
              if (!focusable.length) return;
              const first = focusable[0], last = focusable[focusable.length - 1];
              if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
              } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
              }
            }}
            onSubmit={(event) => {
              event.preventDefault();
              void save();
            }}
          >
            <div className="subdialog-heading">
              <div>
                <span className="eyebrow">
                  {draft.id ? "编辑连接" : "新连接"}
                </span>
                <h2>{draft.id ? "编辑连接" : "添加连接"}</h2>{draft.id && <small className="editor-name" title={draft.name}>{draft.name || "连接配置"}</small>}
              </div>
              <button
                type="button"
                className="icon-button"
                aria-label="关闭连接表单"
                onClick={closeDraft}
              ><Icon name="close" size={16}/></button>
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
            <div className="form-grid">
              <label>
                连接类型
                <select
                  autoFocus
                  value={draft.mcpPublisher?"netlify":draft.kind}
                  onChange={(event) =>
                    setDraft((value) => ({
                      ...value!,
                      kind:event.target.value==='netlify'?'mcp':event.target.value as "cli" | "mcp",
                      mcpPublisher:event.target.value==='netlify'?{provider:'netlify',siteId:''}:undefined,
                      argsText:'[]',provider:event.target.value==='netlify'?'netlify':'',
                      transport: "stdio",
                      url: "",
                      command: "",
                      mcpAuth:undefined,mcpPreset:undefined,mcpNetworkAllowedOriginsText:'',
                    }))
                  }
                >
                  <option value="mcp">MCP 服务</option><option value="netlify">Netlify 静态原型发布</option>
                  <option value="cli">官方 CLI</option>
                </select>
              </label>
              <label>
                名称
                <input
                  required
                  value={draft.name}
                  onChange={(event) =>
                    setDraft((value) => ({
                      ...value!,
                      name: event.target.value,
                    }))
                  }
                  placeholder="例如 飞书文档"
                />
              </label>
            </div>
            {draft.mcpPublisher ? (<label>Netlify Site ID<input required aria-label="Netlify Site ID" value={draft.mcpPublisher.siteId} onChange={event=>setDraft(value=>({...value!,mcpPublisher:{provider:'netlify',siteId:event.target.value.trim()}}))} placeholder="Netlify 站点设置中的 Site ID"/><small>仅发布到此站点的草稿地址。保存连接后填写 API 凭据并核对站点访问；不会登录或发布。</small></label>) : draft.kind === "cli" ? (
              <>
                <label>
                  服务商
                  <input
                    required
                    value={draft.provider}
                    onChange={(event) =>
                      setDraft((value) => ({
                        ...value!,
                        provider: event.target.value,
                      }))
                    }
                    placeholder="例如 飞书、钉钉"
                  />
                </label>
                <label>
                  程序位置
                  <div className="input-action">
                    <input
                      required
                      value={draft.command}
                      onChange={(event) =>
                        setDraft((value) => ({
                          ...value!,
                          command: event.target.value,
                        }))
                      }
                      placeholder="选择已安装的官方程序"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        void run("pick-executable", async () => {
                    const selected = (await call({
                      type: "connectionSelectExecutable",
                    })) as { command: string } | null;
                    if (selected)
                      setDraft((value) => ({ ...value!, command: selected.command }));
                        })
                      }
                    >
                      选择
                    </button>
                  </div>
                </label>
              </>
            ) : (
              <>
                <McpPresetPicker value={draft.mcpPreset} url={draft.url} onChange={value=>setDraft(current=>({...current!,...value,transport:'http',command:'',argsText:'[]',mcpNetworkAllowedOriginsText:''}))}/>
                <label>
                  连接方式
                  <select
                    value={draft.transport}
                    onChange={(event) =>
                      setDraft((value) => ({
                        ...value!,
                        transport: event.target.value as "http" | "stdio",
                        url: "",
                        command: "",
                        mcpAuth:undefined,mcpPreset:undefined,mcpNetworkAllowedOriginsText:'',
                      }))
                    }
                  >
                    <option value="http">HTTP 地址</option>
                    <option value="stdio">本机程序</option>
                  </select>
                </label>
                {draft.transport === "http" ? (
                  <><label>
                    服务地址
                    <input
                      required
                      type="url"
                      value={draft.url}
                      readOnly={!!draft.mcpPreset}
                      onChange={(event) =>
                        setDraft((value) => ({
                          ...value!,
                          url: event.target.value,
                          mcpNetworkAllowedOriginsText:'',
                        }))
                      }
                      placeholder="https://…"
                    />
                  </label><label>登录方式<select value={draft.mcpAuth??'none'} disabled={!!draft.mcpPreset} onChange={event=>setDraft(current=>({...current!,mcpAuth:event.target.value as 'none'|'oauth'}))}><option value="none">匿名（无需登录）</option><option value="oauth">浏览器 OAuth 登录</option></select><small>保存后点击“网页登录”。测试不会自动打开浏览器。</small></label></>
                ) : (
                  <label>
                    程序位置
                    <div className="input-action">
                      <input
                        required
                        value={draft.command}
                        onChange={(event) =>
                          setDraft((value) => ({
                            ...value!,
                            command: event.target.value,
                          }))
                        }
                      />
                      <button
                        type="button"
                        onClick={() =>
                          void run("pick-executable", async () => {
                        const selected = (await call({
                          type: "connectionSelectExecutable",
                        })) as { command: string } | null;
                        if (selected)
                          setDraft((value) => ({
                            ...value!,
                            command: selected.command,
                          }));
                          })
                        }
                      >
                        选择
                      </button>
                    </div>
                  </label>
                )}
              </>
            )}
            {!draft.mcpPublisher&&<details className="advanced">
              <summary>高级设置</summary>
              {draft.kind==='mcp'&&draft.transport==='http'&&!draft.mcpPreset&&<label>允许的公司内网登录地址（可选）<textarea value={draft.mcpNetworkAllowedOriginsText??''} rows={3} onChange={event=>setDraft(value=>({...value!,mcpNetworkAllowedOriginsText:event.target.value}))} placeholder="https://login.company.example"/><small>每行一个 HTTPS 地址，仅允许此连接访问这些公司内网登录服务，最多 16 个。不包含路径；不支持本机和链路本地地址。更换服务地址会清空此范围。</small></label>}
              <label>
                启动参数
                <textarea
                  className="json"
                  value={draft.argsText}
                  onChange={(event) =>
                    setDraft((value) => ({
                      ...value!,
                      argsText: event.target.value,
                    }))
                  }
                />
                <small>仅在服务文档明确要求时填写 JSON 字符串数组。</small>
              </label>
            </details>}
            <label className="check">
              <input
                type="checkbox"
                checked={draft.enabled}
                onChange={(event) =>
                  setDraft((value) => ({
                    ...value!,
                    enabled: event.target.checked,
                  }))
                }
              />
              保存后启用
            </label>
            </div>
<div className="subdialog-actions">
              <button type="button" onClick={closeDraft}>
                取消
              </button>
              <button
                className="primary"
                type="submit"
                disabled={busy === "save"}
              >
                保存连接
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}
