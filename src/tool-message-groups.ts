import type { Message, Run } from "../shared/types";

const readingTools = new Set(["discover_skills", "list_skills", "load_skill", "get_task_acceptance", "read_workspace_rules", "search_files", "read_file", "list_files", "get_project_catalog", "get_workflow_catalog", "locate_spreadsheet", "search_evidence", "read_draft"]);
const checkingTools = new Set(["check_task_acceptance", "get_prototype_acceptance", "run_prototype_acceptance", "verify_spreadsheet_field", "review_content"]);
export type ToolMessageGroup = { start: number; indices: number[]; label: string; taskStatus?: string };

function category(message: Message) {
  const name = /^([a-z][a-z0-9_]*)\s/.exec(message.text)?.[1];
  // External receipts and unfamiliar records retain their own visible row.
  if (name && readingTools.has(name)) return "读取与检索";
  if (name && checkingTools.has(name)) return "检查与核对";
  return undefined;
}

/** A rendering projection only: every member retains its original message index. */
export function toolMessageGroups(messages: readonly Message[], runs: readonly Run[] = [], barriers: ReadonlySet<number> = new Set()): Map<number, ToolMessageGroup> {
  const result = new Map<number, ToolMessageGroup>();
  const chronological = runs.filter(run => Number.isFinite(Date.parse(run.startedAt))).sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt));
  const runFor = (message: Message) => {
    if (message.runId) return runs.find(run => run.id === message.runId);
    const time = Date.parse(message.time);
    if (!Number.isFinite(time)) return undefined;
    const latest = chronological.find(run => Date.parse(run.startedAt) <= time);
    if (!latest) return undefined;
    // A timestamp alone outside a known task interval is not a status binding.
    if (latest.finishedAt && time > Date.parse(latest.finishedAt)) return undefined;
    if (!latest.finishedAt && !["queued", "running", "validating", "waiting_user", "cancelling"].includes(latest.status)) return undefined;
    return latest;
  };
  let previous: { group: ToolMessageGroup; runKey: string | undefined; category: string } | undefined;
  messages.forEach((message, index) => {
    const label = message.role === "tool" ? category(message) : undefined;
    if (!label) { previous = undefined; return; }
    const run = runFor(message);
    // Even without a status binding, known task starts remain grouping barriers.
    const time = Date.parse(message.time);
    const runKey = message.runId || (Number.isFinite(time) ? chronological.find(item => Date.parse(item.startedAt) <= time)?.id : `undated:${index}`);
    if (previous && !barriers.has(index) && previous.category === label && previous.runKey === runKey) {
      previous.group.indices.push(index);
      result.set(index, previous.group);
      return;
    }
    const taskStatus = run && ({ running: "任务执行中", queued: "任务排队中", validating: "任务检查中", waiting_user: "任务待确认", cancelling: "任务取消中", failed: "关联任务失败", interrupted: "关联任务已中断", cancelled: "关联任务已取消" } as Record<string, string>)[run.status];
    const group = { start: index, indices: [index], label, taskStatus };
    result.set(index, group);
    previous = { group, runKey, category: label };
  });
  return result;
}
