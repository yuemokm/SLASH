import { strict as assert } from "node:assert";
import { test } from "node:test";
import type { Message, Run } from "../shared/types";
import { runHistoryAnchors } from "../src/run-history-anchors";

const day = "2026-10-05T12:04:00.000Z", today = "2026-10-06T09:56:00.000Z";
const message = (role: Message["role"], time: string, runId?: string): Message => ({ role, text: "content", time, runId });
const run = (id: string, startedAt: string, extra: Partial<Run> = {}): Run => ({ id, conversationId: "conversation", status: "interrupted", startedAt, error: "应用退出", resumable: true, ...extra });

test("yesterday's orphan remains after its input and before today's live reply", () => {
  const messages = [message("user", day), message("tool", "2026-10-05T12:05:00Z"), message("user", today)];
  const historical = run("old", day, { updatedAt: today });
  const live = run("live", today, { status: "running", error: undefined, resumable: false });
  const anchors = runHistoryAnchors(messages, [live, historical], { activeRunId: live.id, currentRunId: live.id });
  assert.deepEqual([...anchors], [[1, [historical]]]);
  assert.equal(anchors.get(messages.length), undefined);
  assert.equal(anchors.get(1)?.[0].resumable, true);
});

test("the latest failure remains at the end and a linked reply is not duplicated", () => {
  const messages = [message("user", day), message("assistant", "2026-10-05T12:06:00Z", "old"), message("user", today)];
  const latest = run("latest", today, { status: "failed", resumable: false });
  assert.deepEqual([...runHistoryAnchors(messages, [latest, run("old", day)], { currentRunId: "latest" })], [[3, [latest]]]);
});

test("legacy missing input uses its original time, preserving message order and pending plans", () => {
  const messages = [message("user", "2026-10-05T12:00:00Z"), message("assistant", "2026-10-05T12:01:00Z"), message("user", today)];
  const historical = run("legacy", day);
  const plan = run("plan", "2026-10-05T12:03:00Z", { error: undefined, resumable: false, status: "awaiting_plan", proposal: { status: "pending", summary: "plan", options: [], selectedOptionIds: [], customText: "", createdAt: day } });
  const original = [...messages];
  assert.deepEqual([...runHistoryAnchors(messages, [historical, plan], {})], [[2, [plan, historical]]]);
  assert.deepEqual(messages, original);
});

test("empty and undated histories retain actionable records instead of hiding them", () => {
  const unknown = run("unknown", "invalid");
  assert.deepEqual([...runHistoryAnchors([], [unknown], {})], [[0, [unknown]]]);
  const messages = [message("user", "invalid")];
  assert.deepEqual([...runHistoryAnchors(messages, [unknown], {})], [[1, [unknown]]]);
  const completed = run("completed", today, { error: undefined, resumable: false, status: "succeeded" });
  assert.equal(runHistoryAnchors(messages, [completed], {}).size, 0);
  assert.deepEqual([...runHistoryAnchors(messages, [completed], { currentRunId: completed.id })], [[1, [completed]]]);
});
