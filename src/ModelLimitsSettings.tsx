import { useEffect, useRef, useState } from "react";
import type { ModelEntry, ModelLimitsCapability, ModelThinkingCapability, Request } from "../shared/types";

type LimitFields = { contextWindow: string; maxTokens: string };
type LimitModel = LimitFields & Pick<ModelEntry, "provider" | "baseUrl" | "modelId" | "protocol"> & { id?: string; key: string };
const sourceLabel = (source: string) => source === "user-override" ? "手动设置" : source === "provider-model-metadata" ? "上游模型信息" : source.startsWith("pi-catalog:") ? "自动 · Pi 模型目录" : source === "unverified-compatibility" ? "兼容值 · 未验证" : "来源未确认";
const formatTokens = (value: number) => `${value.toLocaleString("zh-CN")} tokens`;
const identity = (model: Pick<ModelEntry, "provider" | "baseUrl" | "modelId" | "protocol">) => JSON.stringify([model.provider.trim(), model.baseUrl.trim(), model.modelId.trim(), model.protocol]);

export function ModelLimitsSettings({ call, model, savedModel, onChange }: {
  call: (request: Request) => Promise<unknown>;
  model: LimitModel;
  savedModel?: ModelEntry;
  onChange: (patch: Partial<LimitFields>) => void;
}) {
  const [limits, setLimits] = useState<ModelLimitsCapability>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const requestId = useRef(0);
  const connectionSaved = Boolean(savedModel && model.id && identity(model) === identity(savedModel) && !model.key);
  const scope = `${model.id || ""}:${identity(model)}:${connectionSaved}`;
  const currentScope = useRef(scope);
  currentScope.current = scope;

  const detect = async (refresh = false) => {
    if (!connectionSaved || !model.id) return;
    const requestedScope = scope, currentRequest = ++requestId.current;
    setLoading(true);
    setError("");
    try {
      const capability = await call({ type: "modelThinkingCapability", modelEntryId: model.id, refresh }) as ModelThinkingCapability;
      if (requestedScope !== currentScope.current || currentRequest !== requestId.current) return;
      setLimits(capability.limits);
    } catch (reason) {
      if (requestedScope === currentScope.current && currentRequest === requestId.current) setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      if (requestedScope === currentScope.current && currentRequest === requestId.current) setLoading(false);
    }
  };

  useEffect(() => {
    requestId.current += 1;
    setLimits(undefined);
    setError("");
    setLoading(false);
    void detect();
    return () => { requestId.current += 1; };
  }, [scope]);

  const fieldStatus = (field: keyof LimitFields) => {
    const manual = model[field].trim(), saved = savedModel?.[field];
    if (manual) {
      const value = Number(manual);
      if (!Number.isSafeInteger(value) || value <= 0) return <small className="model-limit-value invalid">请填写大于 0 的整数</small>;
      return <small className="model-limit-value" data-source="user-override" data-value={value}>{formatTokens(value)} · 手动设置{value !== saved && " · 待保存"}</small>;
    }
    if (saved !== undefined) return <small className="model-limit-value">自动 · 保存后重新确认</small>;
    if (!connectionSaved) return <small className="model-limit-value">自动 · 保存连接后确认</small>;
    if (loading) return <small className="model-limit-value">正在读取模型信息…</small>;
    if (!limits) return <small className="model-limit-value">自动值尚未确认</small>;
    const source = field === "contextWindow" ? limits.contextWindowSource : limits.maxTokensSource;
    return <small className="model-limit-value" data-source={source} data-value={limits[field]}>{formatTokens(limits[field])} · {sourceLabel(source)}</small>;
  };

  return <details className="model-limits-settings">
    <summary>高级：模型容量</summary>
    <div className="model-limits-body">
      <p>上下文窗口是模型一次可容纳的对话和资料总量；最大输出是一次回复的长度上限。tokens 是模型计算文本长度的单位。</p>
      <div className="model-limits-grid">
        <label>
          <span>上下文窗口（tokens）</span>
          <input aria-label="上下文窗口（tokens）" type="text" inputMode="numeric" autoComplete="off" placeholder="留空使用自动值" value={model.contextWindow} onChange={event => onChange({ contextWindow: event.target.value })}/>
          {fieldStatus("contextWindow")}
        </label>
        <label>
          <span>最大输出（tokens）</span>
          <input aria-label="最大输出（tokens）" type="text" inputMode="numeric" autoComplete="off" placeholder="留空使用自动值" value={model.maxTokens} onChange={event => onChange({ maxTokens: event.target.value })}/>
          {fieldStatus("maxTokens")}
        </label>
      </div>
      <div className="model-limits-actions">
        <button type="button" disabled={!model.contextWindow && !model.maxTokens} onClick={() => onChange({ contextWindow: "", maxTokens: "" })}>恢复自动值</button>
        <button type="button" disabled={!connectionSaved || loading} onClick={() => void detect(true)}>{loading ? "正在检测…" : "重新检测模型能力"}</button>
      </div>
      <p className="model-limits-note">手动值以供应商说明为准。留空或恢复自动值后，点击“保存模型”生效。</p>
      {!connectionSaved && <p className="model-limits-note">{model.id ? "连接信息已修改，请先保存，再检测当前模型能力。" : "新模型保存后可查看自动值及其来源。"}</p>}
      {connectionSaved && limits?.status === "unverified" && <p className="model-limits-note" role="status">上游未提供完整容量信息；兼容值未验证，可按供应商说明手动填写。</p>}
      {connectionSaved && limits?.stale && <p className="model-limits-note">已保存的能力信息可更新，重新检测可获取上游最新信息。</p>}
      {connectionSaved && limits?.reason && <details className="model-limits-explanation"><summary>当前配置的能力说明</summary><p>{limits.reason}</p></details>}
      {error && <p className="model-limits-error" role="alert">检测失败：{error}</p>}
    </div>
  </details>;
}
