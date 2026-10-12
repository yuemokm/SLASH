import { test } from "node:test";
import { strict as assert } from "node:assert";
import type { Message, Run } from "../shared/types";
import { toolMessageGroups } from "../src/tool-message-groups";
const message = (text: string, extra: Partial<Message> = {}): Message => ({ role: "tool", text, time: "2026-10-12T10:01:00Z", ...extra });
const run = (id: string, startedAt: string, status: Run["status"] = "running"): Run => ({ id, conversationId: "c", startedAt, status });

test("adjacent context actions share a neutral summary and preserve every original index/text", () => {
  const messages = ["discover_skills", "get_task_acceptance", "read_workspace_rules", "search_files", "list_skills"].map(name => message(`${name} {"query":"x"}`));
  const before = JSON.stringify(messages), groups = toolMessageGroups(messages);
  assert.deepEqual(groups.get(0)?.indices, [0, 1, 2, 3, 4]);
  assert.equal(groups.get(0)?.label, "读取与检索");
  assert.equal(groups.get(0)?.taskStatus, undefined);
  assert.equal(groups.get(4), groups.get(0));
  assert.equal(JSON.stringify(messages), before);
});
test("body, category, external receipt, and history anchors interrupt groups", () => {
  const messages = [message("read_file {}"), message("read_file {}", { role: "assistant" }), message("read_file {}"), message("run_prototype_acceptance {}"), message("external_action {\"status\":\"failed\"}"), message("read_file {}"), message("read_file {}")];
  const groups = toolMessageGroups(messages, [], new Set([6]));
  assert.equal(groups.has(1), false);
  assert.equal(groups.has(4), false);
  assert.deepEqual([...groups.values()].map(group => group.indices), [[0], [2], [3], [5], [6]]);
});
test("explicit and legacy task boundaries never merge across runs", () => {
  const runs = [run("one", "2026-10-12T10:00:00Z"), run("two", "2026-10-12T10:02:00Z")];
  const groups = toolMessageGroups([message("search_files {}"), message("search_files {}", { time: "2026-10-12T10:03:00Z" }), message("search_files {}", { runId: "different" })], runs);
  assert.deepEqual([...groups.values()].map(group => group.indices), [[0], [1], [2]]);
  assert.equal(groups.get(0)?.taskStatus, "任务执行中");
});
test("a failed bound task is disclosed without claiming every tool failed; unknown times are neutral", () => {
  const failed = { ...run("one", "2026-10-12T10:00:00Z", "failed"), finishedAt: "2026-10-12T10:02:00Z" };
  assert.equal(toolMessageGroups([message("read_file {}")], [failed]).get(0)?.taskStatus, "关联任务失败");
  assert.equal(toolMessageGroups([message("read_file {}", { time: "2026-10-12T10:03:00Z" })], [failed]).get(0)?.taskStatus, undefined);
  const groups = toolMessageGroups([message("read_file {}", { time: "invalid" }), message("read_file {}", { time: "invalid" })]);
  assert.deepEqual([...groups.values()].map(group => group.indices), [[0], [1]]);
});
