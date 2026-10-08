import React, { useEffect, useState } from "react";
import { Icon } from "./Icon";
import type { Message, Run } from "../shared/types";
import { messageReceipt } from "./message-receipt";
import "./project-browser.css";

export function MessageFooter({ message, run, streaming = false, actions }: { message: Message; run?: Run; streaming?: boolean; actions?: React.ReactNode }) {
 const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");
 useEffect(() => setCopyState("idle"), [message.text]);
 const receipt = messageReceipt(message, run, streaming);
 const copy = async () => {
  try { await navigator.clipboard.writeText(message.text);setCopyState("copied"); }
  catch { setCopyState("error"); }
 };
 return <footer className="message-footer" aria-label="回复操作与时间">
  <button type="button" aria-label="复制完整回复" disabled={!message.text} onClick={() => void copy()} title="复制完整 Markdown"><Icon name={copyState === "copied" ? "check" : "copy"} size={15}/><span>{copyState === "copied" ? "已复制" : "复制"}</span></button>
  {actions}
  <span className="message-receipt" aria-live="polite">{receipt.status}{receipt.time && <> · <time dateTime={receipt.time} title={new Date(receipt.time).toLocaleString()}>{new Date(receipt.time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</time></>}{receipt.duration && <> · 耗时 {receipt.duration}</>}{copyState === "error" && " · 复制失败，请重试"}</span>
 </footer>;
}
