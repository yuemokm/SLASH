import type { Message, Run } from "../shared/types";

function validTime(value?: string) { return value && Number.isFinite(Date.parse(value)) ? value : undefined; }
export function formatGenerationDuration(value?: number) {
 if (value === undefined || !Number.isFinite(value) || value < 0) return undefined;
 if (value < 1000) return `${Math.round(value)} 毫秒`;
 if (value < 60000) return `${(value / 1000).toFixed(1)} 秒`;
 const seconds = Math.round(value / 1000);
 return `${Math.floor(seconds / 60)} 分 ${seconds % 60} 秒`;
}

export function messageReceipt(message: Message, run?: Run, streaming = false) {
 if (streaming) return { status: "正在生成", time: undefined, duration: undefined };
 const partial = run?.status === "cancelled" ? "已取消 · 部分回复" : run?.status === "failed" ? "生成失败 · 部分回复" : run?.status === "interrupted" ? run.interruptionReason === "model_output_limit" ? "达到输出上限 · 部分回复" : run.interruptionReason === "context_budget" || run.interruptionReason === "context_compaction_failed" ? "上下文需整理 · 部分回复" : "已中断 · 部分回复" : undefined;
 const completedAt = validTime(message.completedAt);
 return {
  status: partial || (completedAt ? "生成完成" : "记录时间"),
  time: completedAt || validTime(message.time),
  duration: formatGenerationDuration(message.generationDurationMs),
 };
}
