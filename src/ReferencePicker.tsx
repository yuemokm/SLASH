import { Icon } from "./Icon";
import React, { useEffect, useMemo, useRef, useState } from "react";
import type { FileRef } from "../shared/types";

type MountSummary = { id: string; name: string };
type ProjectEntrySummary = {
  id: string;
  label: string;
  path?: string;
  kind?: "resource" | "artifact";
};

export type ReferencePickerProps = {
  open: boolean;
  files: FileRef[];
  mounts: MountSummary[];
  projectEntries?: ProjectEntrySummary[];
  selected: FileRef[];
  template?: FileRef;
  onClose: () => void;
  onConfirm: (files: FileRef[], template?: FileRef) => void;
};

type PickerItem = FileRef & {
  key: string;
  label: string;
  mountName: string;
  kind?: "resource" | "artifact";
};

const keyOf = (file: Pick<FileRef, "mountId" | "path">) => `${file.mountId}::${file.path}`;

/** A local, multi-select reference picker that keeps the user in the composer. */
export function ReferencePicker({
  open,
  files,
  mounts,
  projectEntries = [],
  selected,
  template,
  onClose,
  onConfirm,
}: ReferencePickerProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState<Set<string>>(() => new Set(selected.map(keyOf)));
  const [templateDraft, setTemplateDraft] = useState<FileRef | undefined>(template);

  const items = useMemo<PickerItem[]>(() => {
    const mountNames = new Map(mounts.map((mount) => [mount.id, mount.name]));
    const projectByPath = new Map(projectEntries.filter((entry) => entry.path).map((entry) => [entry.path as string, entry]));
    const seen = new Set<string>();
    return files
      .filter((file) => {
        const key = keyOf(file);
        if (seen.has(key)) return false;
        seen.add(key);
        return Boolean(file.path);
      })
      .map((file) => {
        const entry = projectByPath.get(file.path);
        return {
          ...file,
          key: keyOf(file),
          label: entry?.label || file.path.split(/[\\/]/).pop() || file.path,
          mountName: mountNames.get(file.mountId) || file.mountId,
          kind: entry?.kind,
        };
      })
      .sort((left, right) => left.label.localeCompare(right.label, "zh-CN"));
  }, [files, mounts, projectEntries]);

  const filteredItems = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return items;
    return items.filter((item) =>
      `${item.label} ${item.path} ${item.mountName}`.toLowerCase().includes(normalized),
    );
  }, [items, query]);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setDraft(new Set(selected.map(keyOf)));
    setTemplateDraft(template);
  }, [open, selected, template]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && !panelRef.current?.contains(target)) onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [onClose, open]);

  if (!open) return null;

  const toggle = (item: PickerItem) => {
    if (templateDraft && keyOf(templateDraft) === item.key) setTemplateDraft(undefined);
    setDraft((current) => {
      const next = new Set(current);
      if (next.has(item.key)) next.delete(item.key);
      else next.add(item.key);
      return next;
    });
  };

  const confirm = () => {
    const chosen = items.filter((item) => draft.has(item.key));
    onConfirm(chosen.map(({ mountId, path, size }) => ({ mountId, path, size })), templateDraft);
  };

  return (
    <section
      ref={panelRef}
      className="reference-picker"
      role="dialog"
      aria-label="选择引用资料"
      aria-modal="false"
    >
      <div className="reference-picker-head">
        <div>
          <b>选择引用资料</b>
          <small>可多选参考资料；Word / Markdown 可单独用作 PRD 模板</small>
        </div>
        <button type="button" className="reference-picker-close" aria-label="关闭引用资料选择器" onClick={onClose}><Icon name="close" size={16}/></button>
      </div>
      <div className="reference-picker-search"><Icon name="search" size={16}/>
        <input
          autoFocus
          aria-label="搜索引用资料"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="搜索文件名、路径或目录"
        />
      </div>
      <div className="reference-picker-list" role="list" aria-label="可引用的已授权文件">
        {filteredItems.length ? filteredItems.map((item) => {
          const checked = draft.has(item.key);
          const isTemplate = Boolean(templateDraft && keyOf(templateDraft) === item.key);
          return (
            <div key={item.key} role="listitem" className="reference-picker-row">
            <label className={`reference-picker-item ${checked ? "selected" : ""}`}>
              <input type="checkbox" checked={checked} aria-label={`引用资料 ${item.label}`} onChange={() => toggle(item)}/>
              <span className="reference-picker-item-copy">
                <b>{item.label}</b>
                <small>{item.mountName} · {item.path}{item.kind ? ` · ${item.kind === "artifact" ? "成果" : "资源"}` : ""}</small>
              </span>
            </label>
            {/\.(?:docx|md|markdown)$/i.test(item.path) && <button
              type="button"
              className={`reference-template-action ${isTemplate ? "selected" : ""}`}
              aria-label={`${isTemplate ? "取消 PRD 模板" : "用作 PRD 模板"} ${item.label}`}
              aria-pressed={isTemplate}
              onClick={() => {
                setTemplateDraft(isTemplate ? undefined : { mountId: item.mountId, path: item.path, size: item.size });
                if (!isTemplate) setDraft(current => { const next = new Set(current); next.delete(item.key); return next; });
              }}
            >{isTemplate ? "已选模板" : "用作 PRD 模板"}</button>}
            </div>
          );
        }) : (
          <p className="reference-picker-empty">没有找到可引用的文件</p>
        )}
      </div>
      <div className="reference-picker-foot">
        <span>{draft.size ? `已选 ${draft.size} 份参考` : "未选择参考"}{templateDraft ? " · 1 份 PRD 模板" : ""}</span>
        <div>
          <button type="button" onClick={onClose}>取消</button>
          <button type="button" className="primary" onClick={confirm}>确认引用</button>
        </div>
      </div>
    </section>
  );
}

