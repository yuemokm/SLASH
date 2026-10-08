import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AgentMode, FileRef, Request } from "../shared/types";
import type { PrototypeAcceptanceCase, PrototypeAcceptanceRunReceipt, PrototypeAcceptanceScreenshotView, PrototypeAcceptanceStep, PrototypeAcceptanceView, PrototypeAssertionStatus } from "../shared/prototype-acceptance";
import "./PrototypeAcceptance.css";

const labels: Record<PrototypeAssertionStatus, string> = { not_run: "未执行", passed: "通过", failed: "失败", unknown: "未知" };
const reasonLabels: Record<string, string> = {
  PROTOTYPE_ASSERTION_MISMATCH: "实际结果不符合预期",
  PROTOTYPE_SELECTOR_NOT_UNIQUE: "找不到唯一目标，暂无法核对",
  PROTOTYPE_SELECTOR_INVALID: "目标定位无效，需要调整用例",
  PROTOTYPE_RESOURCE_BLOCKED: "离线预览所需资源受阻",
  PROTOTYPE_NAVIGATION_BLOCKED: "页面跳转受阻，暂无法完整核对",
  PROTOTYPE_CANCELLED: "执行已取消",
  PROTOTYPE_STEP_TIMEOUT: "等待当前步骤超时",
  PROTOTYPE_TOTAL_TIMEOUT: "验收执行超时",
  PROTOTYPE_AUTHORIZATION_CHANGED: "目录授权已变化，执行停止",
  PROTOTYPE_RUNTIME_EXCEPTION: "页面运行出错，暂无法完整核对",
  PROTOTYPE_RENDERER_EXITED: "预览意外退出，执行未完成",
  PROTOTYPE_EXECUTION_UNAVAILABLE: "执行环境暂不可用",
  PROTOTYPE_VIEWPORT_UNAVAILABLE: "无法确认用例指定的视口尺寸",
  PROTOTYPE_CONTROL_UNSUPPORTED: "该控件暂不支持自动核对",
  PROTOTYPE_FOCUS_UNAVAILABLE: "无法操作当前控件",
  PROTOTYPE_SELECT_NATIVE_UNAVAILABLE: "无法确认选择结果",
  PROTOTYPE_PREVIOUS_STEP_STOPPED: "前一步未完成，本步未执行",
};
function readableReason(reason: string): string { return reasonLabels[reason] || (/[\u3400-\u9fff]/.test(reason) ? reason : "执行信息待核对"); }
const assertionLabels = { visible: "可见", readonly: "只读", checked: "已选中", enabled: "可操作", text: "文字", value: "字段值", count: "匹配数量", url: "页面地址" };
function describeStep(step: PrototypeAcceptanceStep): string {
  if (step.action === "click") return `点击 ${step.selector}`;
  if (step.action === "fill") return `填写 ${step.selector}：${step.value}`;
  if (step.action === "select") return `选择 ${step.selector}：${step.value}`;
  if (step.action === "press") return `在 ${step.selector} 按 ${step.key}`;
  if (step.assertion === "no-horizontal-overflow") return `核对 ${step.selector || "整个页面"} 无横向溢出（允许 1px 舍入差）`;
  if (step.assertion === "min-target-size") return `核对 ${step.selector} 可见且宽、高至少 ${step.minPixels}px`;
  const locator = "selector" in step ? `${step.selector} · ` : "";
  return `核对 ${locator}${assertionLabels[step.assertion]}${"match" in step && step.match === "contains" ? "包含" : "为"} ${String(step.expected)}`;
}
const readableTime = (value: string) => Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString() : value;
const measurementsText = (measurements: import("../shared/prototype-acceptance").PrototypeStepResult["measurements"]) => !measurements ? "" : measurements.width !== undefined ? ` · 目标 ${measurements.width.toFixed(1)} × ${measurements.height!.toFixed(1)}px，要求 ≥ ${measurements.minPixels}px` : ` · 内容宽 ${measurements.scrollWidth}px / 可用宽 ${measurements.availableWidth}px`;

/** Only host-returned reports and controlled screenshot IDs provide execution evidence. */
export function PrototypeAcceptance({ file, artifactId, version, mode, call, onContinue }: {
  file: FileRef; artifactId?: string; version: string; mode: AgentMode;
  call: (request: Request) => Promise<unknown>; onContinue: (text: string) => void;
}) {
  const target = useMemo(() => ({ mountId: file.mountId, path: file.path, ...(artifactId ? { artifactId } : {}) }), [file.mountId, file.path, artifactId]);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<PrototypeAcceptanceView>();
  const [loading, setLoading] = useState(false);
  const [action, setAction] = useState<"run" | "cancel" | "required">();
  const [error, setError] = useState("");
  const [images, setImages] = useState<Record<string, string>>({});
  const [imageBusy, setImageBusy] = useState<string>();
  const alive = useRef(true);
  const readSequence = useRef(0);
  const readPending = useRef(false);
  const imageSequence = useRef(0);
  const imageContext = useRef("");
  const observedVersion = useRef(version);
  useEffect(() => { alive.current = true; return () => { alive.current = false; readSequence.current++; }; }, []);
  const load = useCallback(async () => {
    if (readPending.current) return;
    readPending.current = true;
    const sequence = ++readSequence.current;
    setLoading(true);
    try {
      const next = await call({ type: "prototypeAcceptanceGet", ...target, limit: 10 }) as PrototypeAcceptanceView;
      if (alive.current && sequence === readSequence.current) {
        const context = `${next.spec?.specHash || ""}:${next.latestReport?.reportId || ""}:${next.latestReport?.versionState || ""}`;
        if (context !== imageContext.current) { imageContext.current = context; imageSequence.current++; setImages({}); setImageBusy(undefined); }
        setView(next); setError("");
      }
    } catch (reason) {
      if (alive.current && sequence === readSequence.current) { imageSequence.current++; setError(reason instanceof Error ? reason.message : String(reason)); setView(undefined); setImages({}); setImageBusy(undefined); }
    } finally { if (sequence === readSequence.current) { readPending.current = false; if (alive.current) setLoading(false); } }
  }, [call, target]);
  useEffect(() => {
    if (observedVersion.current === version) return;
    observedVersion.current = version;
    readSequence.current++; readPending.current = false; imageSequence.current++;
    setImages({}); setImageBusy(undefined); setLoading(false);
    setView(current => current?.latestReport ? { ...current, latestReport: { ...current.latestReport, versionState: "stale", versionReasons: ["预览版本已变化，请刷新执行记录"] } } : current);
    if (open) void load();
  }, [version, open, load]);
  const running = Boolean(view?.activeRun && ["running", "cancelling"].includes(view.activeRun.status));
  useEffect(() => {
    if (!open || !running) return;
    const timer = window.setTimeout(() => void load(), 1000);
    return () => window.clearTimeout(timer);
  }, [open, running, view, load]);
  const spec = view?.spec;
  const report = view?.latestReport;
  const scopeChanged = Boolean(spec && report && spec.specHash !== report.evidence.specHash);
  const entryChanged = Boolean(report?.evidence.entryHash && version && report.evidence.entryHash !== version);
  const versionChanged = Boolean(report && (report.versionState === "stale" || entryChanged));
  const currentResults = Boolean(report && spec && !scopeChanged && !versionChanged && report.versionState === "current");
  const totals = { passed: 0, failed: 0, unknown: 0, not_run: 0 };
  for (const item of spec?.cases || []) {
    const status = currentResults ? report?.evidence.cases.find(result => result.caseId === item.id)?.status || "not_run" : "not_run";
    totals[status]++;
  }
  const reference = `原型：${file.path}\nmountId：${file.mountId}${artifactId ? `\nartifactId：${artifactId}` : ""}\n读取时版本：${version}`;
  const prepare = () => onContinue(`请为当前原型准备或修改具体界面验收用例。${reference}\n先读取真实需求和来源资料，独立导出预期结果并保留来源与适用范围；再读取实际 HTML 与本地依赖，仅用真实 DOM 定位执行步骤。不要从当前页面行为反推验收预期或删除未实现的需求。没有需求依据的纯页面观察标为探索性建议。明确成功、重复及失败等适用场景。用例默认为建议，不替我设置交付要求。不要以静态检查或模型自评作为执行通过。`);
  const fix = (item: PrototypeAcceptanceCase) => {
    const result = report?.evidence.cases.find(value => value.caseId === item.id);
    const screenshots = report?.evidence.screenshots.filter(value => value.caseId === item.id) || [];
    onContinue(`请处理当前原型的验收问题，先核对实际文件与版本，再修改并重新执行相关用例。\n${reference}\n用例：${item.id}「${item.title}」\n预期：${item.expectedDescription || item.steps.filter(step => step.action === "assert").map(describeStep).join("；")}\n步骤：${item.steps.map(describeStep).join(" → ")}\n报告：${report?.reportId || "暂无报告"}；被验版本：${report?.evidence.entryHash || "未知"}；状态：${result ? labels[result.status] : "未执行"}\n实际：${result?.reason || ""}${result?.steps.map(step => `\n步骤 ${step.stepIndex + 1}：${labels[step.status]}；观察=${String(step.observed ?? "未记录")}；${step.reason || ""}`).join("") || ""}\n截图证据 ID：${screenshots.map(value => value.id).join("、") || "未记录"}${versionChanged || scopeChanged ? "\n验收范围或版本已变化，旧报告仅作历史依据，不能算当前通过。" : ""}\n保留模拟与真实服务的区别；缺失失败入口时补齐可操作模拟，不伪称真实服务已经验证。`);
  };
  const run = async () => {
    if (!spec || mode !== "build" || running || action) return;
    setAction("run"); setError("");
    try {
      const receipt = await call({ type: "prototypeAcceptanceRun", ...target, mode, expectedRevision: spec.revision }) as PrototypeAcceptanceRunReceipt;
      if (alive.current) {
        setView(current => current ? { ...current, activeRun: { ...receipt, startedAt: new Date().toISOString(), specHash: spec.specHash } } : current);
        await load();
      }
    } catch (reason) { if (alive.current) setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { if (alive.current) setAction(undefined); }
  };
  const cancel = async () => {
    if (!view?.activeRun || action) return;
    setAction("cancel"); setError("");
    try { await call({ type: "prototypeAcceptanceCancel", executionId: view.activeRun.executionId }); if (alive.current) await load(); }
    catch (reason) { if (alive.current) setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { if (alive.current) setAction(undefined); }
  };
  const required = async (value: boolean) => {
    if (!spec || mode !== "build" || action) return;
    setAction("required"); setError("");
    try {
      const next = await call({ type: "prototypeAcceptanceRequired", ...target, required: value, expectedRevision: spec.revision, expectedSpecHash: spec.specHash, mode }) as PrototypeAcceptanceView;
      if (alive.current) setView(next);
    } catch (reason) { if (alive.current) setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { if (alive.current) setAction(undefined); }
  };
  const showScreenshot = async (screenshotId: string) => {
    if (!report || imageBusy) return;
    const key = `${report.reportId}:${screenshotId}`;
    if (images[key]) { setImages(current => { const next = { ...current }; delete next[key]; return next; }); return; }
    setImageBusy(key); setError("");
    const sequence = imageSequence.current;
    try {
      const value = await call({ type: "prototypeAcceptanceScreenshot", reportId: report.reportId, screenshotId }) as PrototypeAcceptanceScreenshotView;
      if (value.mimeType !== "image/png" || !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(value.dataUrl)) throw Error("截图响应不是受控 PNG 证据");
      if (alive.current && sequence === imageSequence.current) setImages(current => ({ ...current, [key]: value.dataUrl }));
    } catch (reason) { if (alive.current && sequence === imageSequence.current) setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { if (alive.current && sequence === imageSequence.current) setImageBusy(undefined); }
  };
  return <details className="prototype-acceptance" open={open} onToggle={event => { const next = event.currentTarget.open; setOpen(next); if (next) void load(); }} aria-label="原型验收">
    <summary><strong>原型验收</strong><small>{running ? view?.activeRun?.status === "cancelling" ? "正在取消…" : "正在执行…" : !view ? "查看用例与执行记录" : !spec ? "尚未准备用例" : view?.needsConfirmation ? "验收范围已变 · 需确认" : versionChanged ? "版本已变 · 当前版未执行" : scopeChanged ? "验收范围已变 · 当前范围未执行" : report?.versionState === "unavailable" ? "当前版本不可核对" : `通过 ${totals.passed} · 失败 ${totals.failed} · 未知 ${totals.unknown} · 未执行 ${totals.not_run}`}</small></summary>
    <div className="prototype-acceptance-body">
      {error && <p className="prototype-acceptance-error" role="alert">{error}</p>}
      {loading && !view ? <p className="prototype-acceptance-note">正在读取验收记录…</p> : !spec ? <><p className="prototype-acceptance-note">让会话根据当前原型准备具体步骤与预期，再执行并保留证据。</p><div className="prototype-acceptance-actions"><button onClick={prepare}>在会话中准备验收</button><button disabled={loading} onClick={() => void load()}>刷新记录</button></div></> : <>
        <div className="prototype-acceptance-actions">
          <label className="prototype-acceptance-required"><input type="checkbox" checked={spec.required} disabled={mode !== "build" || Boolean(action) || running} onChange={event => void required(event.currentTarget.checked)} />作为交付要求</label>
          <button disabled={mode !== "build" || running || Boolean(action) || loading} onClick={() => void run()}>{action === "run" ? "启动中…" : "运行验收"}</button>
          {running && <button disabled={Boolean(action) || view?.activeRun?.status === "cancelling"} onClick={() => void cancel()}>{action === "cancel" || view?.activeRun?.status === "cancelling" ? "正在取消…" : "取消执行"}</button>}
          <button disabled={loading || Boolean(action)} onClick={() => void load()}>{loading ? "读取中…" : "刷新记录"}</button>
          <button onClick={prepare}>在会话中修改用例</button>
        </div>
        {mode === "plan" && <p className="prototype-acceptance-note">Plan 模式仅查看记录；运行或修改交付要求，请通过现有模式入口切换到 Build。</p>}
        {view?.needsConfirmation && <div className="prototype-acceptance-actions"><span className="prototype-acceptance-state" data-status="stale">验收范围已变，需确认</span><button disabled={mode !== "build" || Boolean(action) || running} onClick={() => void required(true)}>确认当前验收范围</button></div>}
        <p className="prototype-acceptance-note">通过仅表示这些界面断言满足；模拟不代表后台能力或业务规则已确认。{spec.required ? view?.needsConfirmation ? " 当前验收范围尚需确认，未满足已确认的交付要求。" : " 已作为交付要求。" : " 当前为建议性验收。"}</p>
        {spec.required && <p className="prototype-acceptance-note">交付要求覆盖 HTML/ZIP 导出及绑定文件的文档交付；通用 MCP 发布尚无文件绑定，需另行核对。</p>}
        {report && <p className="prototype-acceptance-note">执行于 {readableTime(report.evidence.finishedAt)} · 版本 {report.evidence.entryHash?.slice(0, 12) || "未记录"}{versionChanged ? " · 版本已变，旧结果不计当前通过" : scopeChanged ? " · 用例范围已变，旧结果不计当前通过" : ""}{report.versionState === "unavailable" ? " · 当前不可核对" : ""}{report.versionReasons.length ? ` · ${report.versionReasons.map(readableReason).join("；")}` : ""}{report.evidence.reason ? ` · ${readableReason(report.evidence.reason)}` : ""}</p>}
        {spec.cases.map(item => {
          const result = !scopeChanged ? report?.evidence.cases.find(value => value.caseId === item.id) : undefined;
          const status = currentResults ? result?.status || "not_run" : "not_run";
          return <details className="prototype-acceptance-case" key={item.id} data-case-id={item.id}>
            <summary><b>{item.title}</b><span className="prototype-acceptance-state" data-status={status}>{labels[status]}</span></summary>
            {item.expectedDescription && <p><span className="prototype-acceptance-case-label">预期：</span>{item.expectedDescription}</p>}
            {(result?.viewport || item.viewport) && <p className="prototype-acceptance-note">{result?.viewport ? "实际视口" : "指定视口"}：{(result?.viewport || item.viewport)!.width} × {(result?.viewport || item.viewport)!.height} CSS px</p>}
            <ol>{item.steps.map((step, index) => <li key={index}>{describeStep(step)}</li>)}</ol>
            {result && <><p className="prototype-acceptance-case-label">{currentResults ? "实际断言" : "旧版执行记录"}：{result.reason ? readableReason(result.reason) : labels[result.status]}</p><ul className="prototype-acceptance-assertions">{result.steps.map(step => <li key={step.stepIndex}>步骤 {step.stepIndex + 1} · {labels[step.status]}{step.observed !== undefined ? ` · 实际：${String(step.observed)}` : ""}{measurementsText(step.measurements)}{step.reason ? ` · ${readableReason(step.reason)}` : ""}</li>)}</ul></>}
            <div className="prototype-acceptance-actions">{(result?.status === "failed" || result?.status === "unknown") && <button onClick={() => fix(item)}>带证据回会话修正</button>}{!scopeChanged && report?.evidence.screenshots.filter(value => value.caseId === item.id).map(screenshot => <button key={screenshot.id} disabled={Boolean(imageBusy)} onClick={() => void showScreenshot(screenshot.id)}>{images[`${report.reportId}:${screenshot.id}`] ? "收起截图" : imageBusy === `${report.reportId}:${screenshot.id}` ? "读取截图…" : "查看截图"}</button>)}</div>
            {!scopeChanged && report?.evidence.screenshots.filter(value => value.caseId === item.id).map(screenshot => images[`${report.reportId}:${screenshot.id}`] && <figure className="prototype-acceptance-screenshot" key={screenshot.id}><img src={images[`${report.reportId}:${screenshot.id}`]} alt={`${item.title}实际执行截图`} /><figcaption>{item.title} · {screenshot.stepIndex === undefined ? "用例执行后" : `步骤 ${screenshot.stepIndex + 1}`} · {readableTime(report.evidence.finishedAt)}</figcaption></figure>)}
          </details>;
        })}
        {Boolean(view?.reports.length) && <details className="prototype-acceptance-case"><summary><b>执行历史</b><small>{view?.reports.length} 条</small></summary>{view?.reports.map(value => <p key={value.reportId}>{readableTime(value.createdAt)} · {labels[value.status]} · {value.versionState === "current" ? "登记版本一致" : value.versionState === "stale" ? "版本已变" : "当前不可核对"} · 范围 {value.specHash.slice(0, 10)}</p>)}</details>}
      </>}
    </div>
  </details>;
}
