import { strict as assert } from "node:assert";
import { test } from "node:test";
import { formatGenerationDuration, messageReceipt } from "../src/message-receipt";
import type { Message, Run } from "../shared/types";

test("streaming and historical receipts do not invent a completion or duration", () => {
 const message: Message = { role: "assistant", text: "**完整回复**", time: "2026-10-04T10:00:00Z" };
 assert.deepEqual(messageReceipt(message), { status: "记录时间", time: message.time, duration: undefined });
 assert.deepEqual(messageReceipt({ ...message, completedAt: message.time, generationDurationMs: 2500 }, undefined, true), { status: "正在生成", time: undefined, duration: undefined });
 assert.equal(messageReceipt({ ...message, time: "invalid" }).time, undefined);
});
test("real completion and interrupted partial replies retain their actual timing", () => {
 const message: Message = { role: "assistant", text: "partial", time: "2026-10-04T10:00:00Z", completedAt: "2026-10-04T10:00:03Z", generationDurationMs: 2500 };
 assert.deepEqual(messageReceipt(message), { status: "生成完成", time: message.completedAt, duration: "2.5 秒" });
 assert.equal(messageReceipt(message, { status: "cancelled" } as Run).status, "已取消 · 部分回复");
 assert.equal(messageReceipt(message, { status: "failed" } as Run).status, "生成失败 · 部分回复");
 assert.equal(messageReceipt(message, { status: "interrupted" } as Run).status, "已中断 · 部分回复");
 assert.equal(messageReceipt(message, { status: "interrupted", interruptionReason: "model_output_limit" } as Run).status, "达到输出上限 · 部分回复");
 assert.equal(messageReceipt(message, { status: "interrupted", interruptionReason: "context_budget" } as Run).status, "上下文需整理 · 部分回复");
 assert.equal(messageReceipt(message, { status: "interrupted", interruptionReason: "context_compaction_failed" } as Run).status, "上下文需整理 · 部分回复");
 assert.equal(messageReceipt({ ...message, generationDurationMs: -1 }).duration, undefined);
 assert.equal(formatGenerationDuration(119999), "2 分 0 秒");
});
