import type { ModelTaskType, PmWorkflowKind } from "../shared/types";

export function resolveComposerIntent(input: { draft: string; workflowKind?: PmWorkflowKind; view: string }): { command: string; kind?: PmWorkflowKind; taskType: ModelTaskType } {
  const command = input.draft.trim().split(/\s+/)[0] || "";
  // Real skills replace quick-action context; Plan keeps its source binding.
  // Former PM prompt shortcuts are ordinary text, without hidden routing.
  const kind = (command === "/help" || command.startsWith("/skill:")) ? undefined : input.workflowKind;
  const taskType: ModelTaskType = kind === "prototype" ? "coding"
    : kind === "research" ? "research"
    : kind === "prd" || kind === "meeting" || kind === "prototype_to_prd" || kind === "change_summary" || kind === "test_cases" ? "writing"
    : input.view === "资源" ? "research"
    : input.view === "成果" ? "writing"
    : "general";
  return { command, kind, taskType };
}

export function appendComposerPreset(draft: string, preset: string): string {
  if (!preset.trim() || draft.includes(preset)) return draft;
  return draft.trim() ? `${draft.trimEnd()}\n\n${preset}` : preset;
}
