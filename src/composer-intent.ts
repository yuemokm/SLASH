import type { ModelTaskType, PmWorkflowKind } from "../shared/types";

const commandWorkflows = new Map<string, PmWorkflowKind>([
  ["/prototype", "prototype"],
  ["/prd", "prd"],
  ["/research", "research"],
]);

export function resolveComposerIntent(input: { draft: string; workflowKind?: PmWorkflowKind; view: string }): { command: string; kind?: PmWorkflowKind; taskType: ModelTaskType } {
  const command = input.draft.trim().split(/\s+/)[0] || "";
  // A deliberate slash command can replace a quick-action context. Plan
  // keeps that context so its sources and later execution remain traceable.
  const kind = commandWorkflows.get(command) || (["/review", "/help"].includes(command) ? undefined : input.workflowKind);
  const taskType: ModelTaskType = command === "/review" ? "review"
    : kind === "prototype" ? "coding"
    : kind === "research" ? "research"
    : kind === "prd" || kind === "meeting" || kind === "prototype_to_prd" || kind === "change_summary" ? "writing"
    : input.view === "资源" ? "research"
    : input.view === "成果" ? "writing"
    : "general";
  return { command, kind, taskType };
}

export function appendComposerPreset(draft: string, preset: string): string {
  if (!preset.trim() || draft.includes(preset)) return draft;
  return draft.trim() ? `${draft.trimEnd()}\n\n${preset}` : preset;
}
