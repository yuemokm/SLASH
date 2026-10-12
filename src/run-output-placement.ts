import type { Message } from "../shared/types";

/** One output group per Run, after its last reply; live output owns active Runs. */
export function runOutputMessageIndices(messages: readonly Message[], activeRunId?: string): Map<string, number> {
  const indices = new Map<string, number>();
  messages.forEach((message, index) => {
    if (message.role === "assistant" && message.runId && message.runId !== activeRunId) indices.set(message.runId, index);
  });
  return indices;
}
