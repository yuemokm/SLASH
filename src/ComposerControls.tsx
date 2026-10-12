import React, { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon, type IconName } from "./Icon";
import type { ModelEntry, ModelThinkingCapability, ThinkingLevel as SharedThinkingLevel } from "../shared/types";

export type ThinkingLevel = SharedThinkingLevel;
export type ThinkingCapability = ModelThinkingCapability;
const thinkingLabels: Record<ThinkingLevel, string> = { off: "关闭", minimal: "最少", low: "较少", medium: "适中", high: "深入", xhigh: "更深入", max: "最高" };

export function ComposerModeMenu({ value, onChange }: { value: "build" | "plan"; onChange: (value: "build" | "plan") => void }) {
 return <ComposerPopover label="模式" text={value === "plan" ? "Plan" : "Build"} icon={value === "plan" ? "book" : "code"}>{close => <><div className="composer-popover-heading">模式</div><div role="radiogroup" aria-label="模式">{([
  { value: "build", label: "Build", description: "直接完成任务，生成或修改成果" },
  { value: "plan", label: "Plan", description: "先研究资料并提出方案，确认后执行" },
 ] as const).map(option => <button type="button" role="radio" aria-checked={value === option.value} className="composer-choice" key={option.value} onClick={() => { onChange(option.value);close(); }}><span><b>{option.label}</b><small>{option.description}</small></span>{value === option.value && <Icon name="check" size={15}/>}</button>)}</div></>}</ComposerPopover>;
}

export function ComposerPermissionMenu({ value, onChange, busy = false }: { value: "standard" | "accept_edits" | "full_access"; onChange: (value: "standard" | "accept_edits" | "full_access") => void;busy?:boolean }) {
 const options = [
  { value: "standard", label: "标准权限", description: "遇到需要授权的能力时逐项询问" },
  { value: "accept_edits", label: "自动接受", description: "成果编辑自动通过，其他能力仍按设置处理" },
  { value: "full_access", label: "完全访问", description: "可访问电脑文件，不限项目目录；明确禁止仍优先" },
 ] as const;
 return <ComposerPopover label="权限" text={options.find(option => option.value === value)?.label} icon="shield">{close => <><div className="composer-popover-heading">权限</div><div role="radiogroup" aria-label="权限">{options.map(option => <button type="button" role="radio" aria-checked={value === option.value} className="composer-choice" key={option.value} disabled={busy} onClick={() => { onChange(option.value);close(); }}><span><b>{option.label}</b><small>{option.description}</small></span>{value === option.value && <Icon name="check" size={15}/>}</button>)}</div><p className="composer-permission-note">可访问电脑文件，不限项目目录；不会提升 Windows 身份。明确禁止始终优先。</p></>}</ComposerPopover>;
}

export function ComposerPopover({ label, text, icon, className = "", children }: { label: string; text?: string; icon: IconName; className?: string; children: (close: () => void) => React.ReactNode }) {
 const [open, setOpen] = useState(false);
 const [position, setPosition] = useState({ top: 0, left: 12, width: 340, maxHeight: 320 });
 const root = useRef<HTMLSpanElement>(null), trigger = useRef<HTMLButtonElement>(null), popup = useRef<HTMLDivElement>(null), id = useId();
 const close = () => { setOpen(false); requestAnimationFrame(() => trigger.current?.focus()); };
 useLayoutEffect(() => {
  if (!open) return;
  const place = () => {
   if (!trigger.current) return;
   const rect = trigger.current.getBoundingClientRect(), width = Math.min(340, window.innerWidth - 24), above = rect.top - 20, below = window.innerHeight - rect.bottom - 20;
   const useAbove = above >= below, maxHeight = Math.max(80, Math.min(440, useAbove ? above : below));
   const height = Math.min(maxHeight, popup.current?.scrollHeight || 320);
   setPosition({ width, maxHeight, left: Math.max(12, Math.min(rect.left, window.innerWidth - width - 12)), top: useAbove ? Math.max(12, rect.top - height - 8) : rect.bottom + 8 });
  };
  place();const observer = new ResizeObserver(place);if (popup.current) observer.observe(popup.current);
  window.addEventListener("resize", place);window.addEventListener("scroll", place, true);
  return () => { observer.disconnect();window.removeEventListener("resize", place);window.removeEventListener("scroll", place, true); };
 }, [open]);
 useEffect(() => {
  if (!open) return;
  requestAnimationFrame(() => popup.current?.querySelector<HTMLElement>('button[aria-selected="true"],button,input,[tabindex="0"]')?.focus());
  const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node) && !popup.current?.contains(event.target as Node)) setOpen(false); };
  document.addEventListener("pointerdown", outside);return () => document.removeEventListener("pointerdown", outside);
 }, [open]);
 return <span className={`composer-popover-root ${className}`} ref={root} onKeyDown={event => { if (open && event.key === "Escape") { event.preventDefault();event.stopPropagation();close(); } }}>
  <button ref={trigger} className={`composer-light-trigger ${open ? "open" : ""}`} type="button" aria-label={label} title={label} aria-expanded={open} aria-haspopup="dialog" aria-controls={id} onClick={() => setOpen(value => !value)}><Icon name={icon} size={16}/>{text && <span>{text}</span>}{text && <Icon name="chevronDown" size={12}/>}</button>
  {open && createPortal(<div ref={popup} id={id} role="dialog" aria-label={label} className="composer-control-popover" style={position} onKeyDown={event => {
   if (event.key === "Escape") { event.preventDefault();event.stopPropagation();close(); }
   if ((event.key === "ArrowDown" || event.key === "ArrowUp") && (event.target as HTMLElement).tagName !== "INPUT") {
    const buttons = Array.from(popup.current?.querySelectorAll<HTMLButtonElement>('button:not([disabled])') || []), index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (buttons.length) { event.preventDefault();buttons[(index + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length]?.focus(); }
   }
  }} onBlur={event => { if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget as Node) && !root.current?.contains(event.relatedTarget as Node)) setOpen(false); }}>{children(close)}</div>, root.current?.closest(".app") || document.body)}
 </span>;
}

export function ComposerModelMenu({ value, models, onChange, capability, thinkingLevel, onThinkingChange, loading, onRefreshCapability }: { value: string; models: ModelEntry[]; onChange: (id: string) => void; capability?: ThinkingCapability; thinkingLevel?: ThinkingLevel; onThinkingChange: (level?: ThinkingLevel) => void; loading: boolean; onRefreshCapability: () => void }) {
 const selected = models.find(model => model.id === value), resolved = models.find(model => model.id === capability?.modelEntryId);
 const supported = !loading && capability?.status === "supported" && capability.levels.length > 1;
 const levels = supported ? capability.levels : [], effective = thinkingLevel || capability?.defaultLevel || levels[0], index = Math.max(0, levels.indexOf(effective));
 return <ComposerPopover label="选择模型" text={`${selected?.name || "自动"}${thinkingLevel && !loading ? ` · ${thinkingLabels[thinkingLevel]}` : ""}`} icon="model" className="composer-model-select">{() => <>
  <div className="composer-popover-heading">模型</div>
  <div role="listbox" aria-label="选择模型" className="composer-model-list">
   <button type="button" role="option" aria-selected={!value} onClick={() => onChange("")}><span><b>自动 · 按设置选择</b><small>{resolved ? `当前：${resolved.provider} · ${resolved.name}` : "使用模型分工设置或默认模型"}</small></span>{!value && <Icon name="check" size={15}/>}</button>
   {Array.from(new Set(models.map(model => model.provider))).map(provider => <React.Fragment key={provider}><div className="composer-select-group" role="presentation">{provider}</div>{models.filter(model => model.provider === provider).map(model => <button type="button" key={model.id} role="option" aria-selected={value === model.id} onClick={() => onChange(model.id)}><span><b>{model.name}</b><small>{model.modelId}</small></span>{value === model.id && <Icon name="check" size={15}/>}</button>)}</React.Fragment>)}
  </div>
  <section className="composer-thinking" aria-label="模型思考强度">
   <div className="composer-thinking-heading"><b>思考强度</b>{supported && <span aria-live="polite">{thinkingLevel ? thinkingLabels[effective] : capability?.defaultLevel ? `默认 · ${thinkingLabels[capability.defaultLevel]}` : "模型默认"}</span>}</div>
   {loading ? <p role="status">正在读取模型支持的档位…</p> : supported ? <>
    <div className="thinking-slider-wrap"><div className="thinking-slider-track"><i style={{ transform: `scaleX(${levels.length > 1 ? index / (levels.length - 1) : 0})` }}/>{levels.map((level, stop) => <span key={level} style={{ left: `${stop / (levels.length - 1) * 100}%` }}/>)}</div><input type="range" aria-label="思考强度" aria-valuetext={thinkingLabels[levels[index]]} min={0} max={levels.length - 1} step={1} value={index} onChange={event => onThinkingChange(levels[Number(event.target.value)])}/></div>
    <div className="thinking-slider-labels"><span>{thinkingLabels[levels[0]]}</span><span>{thinkingLabels[levels[levels.length - 1]]}</span></div>
    <p>更深入的思考可能需要更长时间。<button type="button" aria-pressed={!thinkingLevel} onClick={() => onThinkingChange(undefined)}>默认</button></p>
   </> : <p>{capability?.status === "supported" && capability.levels.length === 1 ? `固定档位：${thinkingLabels[capability.levels[0]]}（不可调整）` : capability?.status === "unsupported" ? "这个模型不提供可调整的思考档位。" : "上游未提供可识别的思考档位"}</p>}
   <p className="thinking-capability-source">{capability?.source === "provider-model-metadata" ? "供应商信息" : capability?.source.startsWith("pi-catalog") ? "内置能力信息" : "待确认"}{capability?.stale && " · 信息可更新"}<button type="button" disabled={loading} onClick={onRefreshCapability}>重新检测</button></p>
   {!loading && capability?.reason && <details className="thinking-capability-detail"><summary>能力说明</summary><p>{capability.reason}</p></details>}
  </section>
 </>}</ComposerPopover>;
}
