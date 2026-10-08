import { Icon } from "./Icon";
import React, { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export type ComposerSelectOption = {
  value: string;
  label: string;
  description?: string;
  group?: string;
  disabled?: boolean;
};

type ComposerSelectProps = {
  value: string;
  options: ComposerSelectOption[];
  onChange: (value: string) => void;
  ariaLabel: string;
  className?: string;
  placeholder?: string;
};

function nextEnabled(options: ComposerSelectOption[], start: number, direction: 1 | -1) {
  if (!options.length) return -1;
  let index = start;
  for (let count = 0; count < options.length; count += 1) {
    index = (index + direction + options.length) % options.length;
    if (!options[index].disabled) return index;
  }
  return -1;
}

export function ComposerSelect({
  value,
  options,
  onChange,
  ariaLabel,
  className = "",
  placeholder = "选择",
}: ComposerSelectProps) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0, width: 220 });
  const rootRef = useRef<HTMLSpanElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const selectedIndex = options.findIndex((item) => item.value === value);
  const selected = selectedIndex >= 0 ? options[selectedIndex] : undefined;

  const positionMenu = () => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const width = Math.min(Math.max(rect.width, 240), 360, Math.max(0, window.innerWidth - 24));
    const left = Math.max(12, Math.min(rect.left, window.innerWidth - width - 12));
    const menuHeight = Math.min(320, menuRef.current?.getBoundingClientRect().height || options.length * 58 + 22);
    const roomAbove = rect.top - 8;
    const roomBelow = window.innerHeight - rect.bottom - 8;
    const top = roomAbove >= menuHeight
      ? rect.top - menuHeight - 8
      : roomBelow >= menuHeight
        ? rect.bottom + 8
        : Math.max(12, Math.min(rect.bottom + 8, window.innerHeight - menuHeight - 12));
    setMenuPosition({ top, left, width });
  };

  useEffect(() => {
    if (!open) return;
    positionMenu();
    const onViewportChange = () => positionMenu();
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!rootRef.current?.contains(target) && !menuRef.current?.contains(target)) setOpen(false);
    };
    window.addEventListener("resize", onViewportChange);
    window.addEventListener("scroll", onViewportChange, true);
    document.addEventListener("mousedown", onPointerDown);
    return () => {
      window.removeEventListener("resize", onViewportChange);
      window.removeEventListener("scroll", onViewportChange, true);
      document.removeEventListener("mousedown", onPointerDown);
    };
  }, [open, options.length]);

  useLayoutEffect(() => {
    if (open) positionMenu();
  }, [open, options.length, selectedIndex]);

  useEffect(() => {
    if (!open) return;
    const index = selectedIndex >= 0 ? selectedIndex : nextEnabled(options, -1, 1);
    setActiveIndex(index);
    requestAnimationFrame(() => menuRef.current?.focus());
  }, [open, selectedIndex]);

  useEffect(() => {
    if (open && activeIndex >= 0) menuRef.current?.querySelector(`[data-option-index="${activeIndex}"]`)?.scrollIntoView({ block: "nearest" });
  }, [open, activeIndex]);

  const close = () => {
    setOpen(false);
    requestAnimationFrame(() => triggerRef.current?.focus());
  };
  const choose = (option: ComposerSelectOption) => {
    if (option.disabled) return;
    onChange(option.value);
    close();
  };
  const onTriggerKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp" || event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setOpen(true);
      setActiveIndex(selectedIndex >= 0 ? selectedIndex : nextEnabled(options, -1, 1));
    }
  };
  const onMenuKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
      return;
    }
    if (event.key === "Tab") {
      triggerRef.current?.focus();
      setOpen(false);
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => nextEnabled(options, index, event.key === "ArrowDown" ? 1 : -1));
      return;
    }
    if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      const direction = event.key === "Home" ? 1 : -1;
      setActiveIndex(nextEnabled(options, direction === 1 ? -1 : options.length, direction));
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      const option = options[activeIndex];
      if (option) choose(option);
    }
  };
  const groupedOptions = options.reduce<Array<{ group?: string; items: Array<{ option: ComposerSelectOption; index: number }> }>>((groups, option, index) => {
    const group = groups.find((item) => item.group === option.group);
    if (group) group.items.push({ option, index });
    else groups.push({ group: option.group, items: [{ option, index }] });
    return groups;
  }, []);

  return (
    <span ref={rootRef} className={`composer-select-root ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        className={`composer-select-trigger ${open ? "open" : ""}`}
        role="combobox"
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-controls={listId}
        aria-haspopup="listbox"
        title={selected ? `${selected.label}${selected.description ? ` · ${selected.description}` : ""}` : placeholder}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={onTriggerKeyDown}
      >
        <span className="composer-select-trigger-text">{selected?.label || placeholder}</span>
        <span className="composer-select-chevron"><Icon name="chevronDown" size={13}/></span>
      </button>
      {open && createPortal(
        <div
          ref={menuRef}
          id={listId}
          className="composer-select-menu"
          role="listbox"
          aria-label={ariaLabel}
          tabIndex={-1}
          style={{ top: menuPosition.top, left: menuPosition.left, width: menuPosition.width }}
          onKeyDown={onMenuKeyDown}
          onMouseDown={(event) => event.preventDefault()}
        >
          {groupedOptions.map(({ group, items }) => (
            <React.Fragment key={group || "ungrouped"}>
              {group && <div className="composer-select-group" role="presentation">{group}</div>}
              {items.map(({ option, index }) => (
                <button
                  key={option.value || "empty"}
                  type="button"
                  role="option"
                  aria-selected={option.value === value}
                  aria-disabled={option.disabled || undefined}
                  data-option-index={index}
                  className={`composer-select-option ${option.value === value ? "selected" : ""} ${activeIndex === index ? "active" : ""}`}
                  disabled={option.disabled}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => choose(option)}
                >
                  <span className="composer-select-option-copy">
                    <b>{option.label}</b>
                    {option.description && <small>{option.description}</small>}
                  </span>
                  {option.value === value && <span className="composer-select-check"><Icon name="check" size={15}/></span>}
                </button>
              ))}
            </React.Fragment>
          ))}
        </div>,
        rootRef.current?.closest(".app") || document.body,
      )}
    </span>
  );
}
