import React from "react";

export type IconName = "chat" | "plus" | "folder" | "file" | "search" | "chevronDown" | "chevronRight" | "chevronLeft" | "more" | "close" | "send" | "stop" | "panel" | "settings" | "book" | "share" | "model" | "shield" | "check" | "clock" | "archive" | "external" | "refresh" | "image" | "code" | "flow" | "link" | "warning" | "attach" | "slash" | "edit" | "pin" | "copy" | "trash";
const paths: Record<IconName, React.ReactNode> = {
  chat: <><path d="M5 4.5h14v11H9l-4 4v-15Z"/><path d="M8.5 8.5h7M8.5 11.5h4"/></>,
  plus: <path d="M12 5v14M5 12h14"/>,
  folder: <path d="M3 7V5.5A1.5 1.5 0 0 1 4.5 4h5l2 3h8A1.5 1.5 0 0 1 21 8.5v10A1.5 1.5 0 0 1 19.5 20h-15A1.5 1.5 0 0 1 3 18.5V7Z"/>,
  file: <><path d="M6 3h8l4 4v14H6V3Z"/><path d="M14 3v5h4M9 12h6M9 16h6"/></>,
  search: <><circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 4.5 4.5"/></>,
  chevronDown: <path d="m6 9 6 6 6-6"/>, chevronRight: <path d="m9 6 6 6-6 6"/>, chevronLeft: <path d="m15 6-6 6 6 6"/>,
  more: <><circle cx="5" cy="12" r=".8"/><circle cx="12" cy="12" r=".8"/><circle cx="19" cy="12" r=".8"/></>,
  close: <path d="m6 6 12 12M18 6 6 18"/>, send: <><path d="M12 19V5M6.5 10.5 12 5l5.5 5.5"/></>, stop: <rect x="7" y="7" width="10" height="10" rx="1"/>,
  panel: <><rect x="3.5" y="5" width="17" height="14" rx="2"/><path d="M15 5v14"/></>,
  settings: <><path d="m9.4 3-.6 2.4-2 .9L4.6 5.6 2.2 9.8 4 11.5v2L2.2 15l2.4 4.2 2.2-.7 2 .9.6 2.4h5.2l.6-2.4 2-.9 2.2.7 2.4-4.2-1.8-1.5v-2l1.8-1.7-2.4-4.2-2.2.7-2-.9L14.6 3H9.4Z"/><circle cx="12" cy="12.4" r="3"/></>,
  book: <><path d="M12 6.5C9.5 5 7 4.5 3.5 5v14c3.5-.5 6 0 8.5 1.5M12 6.5c2.5-1.5 5-2 8.5-1.5v14c-3.5-.5-6 0-8.5 1.5V6.5Z"/></>,
  share: <><circle cx="6" cy="12" r="3"/><circle cx="18" cy="5" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 10.5 6.8-4M8.6 13.5l6.8 4"/></>,
  model: <><rect x="5" y="5" width="14" height="14" rx="3"/><path d="M9 9h6v6H9zM9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3"/></>,
  shield: <><path d="m12 3 8 3v6c0 4-4 7.5-8 9-4-1.5-8-5-8-9V6l8-3Z"/><path d="m8.5 12 2.5 2.5 4.5-5"/></>, check: <path d="m5 12 4 4L19 6"/>,
  clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>, archive: <><path d="M4 9h16v12H4zM3 3h18v6H3zM9 13h6"/></>,
  external: <><path d="M14 3h7v7M21 3 11 13M11 4H5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h13a2 2 0 0 0 2-2v-6"/></>,
  refresh: <><path d="M20 8a8 8 0 0 0-14-3L3 8M3 3v5h5M4 16a8 8 0 0 0 14 3l3-3M16 16h5v5"/></>,
  image: <><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8" cy="9" r="1.5"/><path d="m3 17 5-5 4 4 4-6 5 7"/></>,
  code: <><path d="m8 7-5 5 5 5M16 7l5 5-5 5M14 4l-4 16"/></>, flow: <><rect x="9" y="2" width="6" height="5" rx="1"/><rect x="2" y="17" width="6" height="5" rx="1"/><rect x="16" y="17" width="6" height="5" rx="1"/><path d="M12 7v5M5 17v-5h14v5"/></>,
  link: <><path d="m10 14 4-4M8 15l-1 1a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0M16 9l1-1a4 4 0 0 1 6 6l-4 4a4 4 0 0 1-6 0" transform="translate(1 -1)"/></>,
  warning: <><path d="m12 3 10 18H2L12 3Z"/><path d="M12 9v5M12 17v.5"/></>,
  attach: <path d="m9 13 7-7a3 3 0 0 1 4 4L10 20a5 5 0 0 1-7-7L13 3a2 2 0 0 1 3 3L6 16"/>, slash: <path d="m15.5 3-7 18"/>,
  edit: <><path d="m15 4 5 5M4 20l5-1L20 8a3.5 3.5 0 0 0-5-5L4 14l-1 7 6-2"/></>,
  pin: <><path d="m8 3 8 0-1 7 4 4H5l4-4-1-7ZM12 14v7"/></>,
  copy: <><rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V3H3v13h5"/></>,
  trash: <><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7"/></>,
};

/** Shared desktop icon language: 24px geometry, consistent optical stroke. */
export function Icon({ name, size = 18, className = "" }: { name: IconName; size?: number; className?: string }) {
  return <svg className={`icon ${className}`} viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{paths[name]}</svg>;
}
export function FileIcon({ path, size = 20 }: { path: string; size?: number }) {
  const name: IconName = /\.(html?|css|jsx?|tsx?|json)$/i.test(path) ? "code" : /\.drawio$/i.test(path) ? "flow" : /\.(png|jpe?g|gif|webp|svg)$/i.test(path) ? "image" : "file";
  return <Icon name={name} size={size}/>;
}
