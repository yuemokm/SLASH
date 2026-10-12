import type { ModelThinkingCapability, ThinkingLevel } from "../shared/types";

export function adjustableThinking(capability: ModelThinkingCapability | undefined, loading: boolean) {
  return !loading && capability?.status === "supported" && capability.levels.length > 1;
}

export function availableThinkingLevel(capability: ModelThinkingCapability | undefined, loading: boolean, level: ThinkingLevel | undefined) {
  return adjustableThinking(capability, loading) && level && capability?.levels.includes(level) ? level : undefined;
}

// An untouched Plan keeps its original runtime choice. A deliberate default
// selection must be distinguishable from an omitted choice at the IPC boundary.
export function planThinkingOverride(level: ThinkingLevel | undefined, dirty: boolean): ThinkingLevel | null | undefined {
  return dirty ? level ?? null : undefined;
}
