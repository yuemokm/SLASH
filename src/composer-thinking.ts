import type { ThinkingLevel } from "../shared/types";

// An untouched Plan keeps its original runtime choice. A deliberate default
// selection must be distinguishable from an omitted choice at the IPC boundary.
export function planThinkingOverride(level: ThinkingLevel | undefined, dirty: boolean): ThinkingLevel | null | undefined {
  return dirty ? level ?? null : undefined;
}
