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
  onClose: () => void;
  onConfirm: (files: FileRef[]) => void;
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
  onClose,
  onConfirm,
}: ReferencePickerProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState<Set<string>>(new Set());

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
  }, [open, selected]);

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
    setDraft((current) => {
      const next = new Set(current);
      if (next.has(item.key)) next.delete(item.key);
      else next.add(item.key);
      return next;
    });
  };

  const confirm = () => {
    const chosen = items.filter((item) => draft.has(item.key));
    onConfirm(chosen.map(({ mountId, path, size }) => ({ mountId, path, size })));
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
          <small>仅显示当前已授权目录中的文件</small>
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
      <div className="reference-picker-list" role="listbox" aria-multiselectable="true">
        {filteredItems.length ? filteredItems.map((item) => {
          const checked = draft.has(item.key);
          return (
            <button
              key={item.key}
              type="button"
              role="option"
              aria-selected={checked}
              className={`reference-picker-item ${checked ? "selected" : ""}`}
              onClick={() => toggle(item)}
            >
              <span className="reference-picker-check" aria-hidden="true">{checked ? <Icon name="check" size={13}/> : null}</span>
              <span className="reference-picker-item-copy">
                <b>{item.label}</b>
                <small>{item.mountName} · {item.path}{item.kind ? ` · ${item.kind === "artifact" ? "成果" : "资源"}` : ""}</small>
              </span>
            </button>
          );
        }) : (
          <p className="reference-picker-empty">没有找到可引用的文件</p>
        )}
      </div>
      <div className="reference-picker-foot">
        <span>{draft.size ? `已选 ${draft.size} 项` : "未选择资料"}</span>
        <div>
          <button type="button" onClick={onClose}>取消</button>
          <button type="button" className="primary" onClick={confirm}>确认引用</button>
        </div>
      </div>
    </section>
  );
}

