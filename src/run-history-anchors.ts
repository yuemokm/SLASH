import type { Message, Run } from "../shared/types";

/** Slots are message indices; messages.length is after the persisted history. */
export function runHistoryAnchors(
  messages: readonly Message[],
  runs: readonly Run[],
  { activeRunId, currentRunId }: { activeRunId?: string; currentRunId?: string },
): Map<number, Run[]> {
  const associated = new Set(messages.filter(message => message.role === "assistant").map(message => message.runId));
  const anchors = new Map<number, Run[]>();
  const candidates = runs.filter(run => run.id !== activeRunId && !associated.has(run.id)
    && (run.id === currentRunId || run.proposal?.status === "pending" || run.resumable || run.error));
  // Do not use updatedAt: restart/resume changes it without moving the original task.
  candidates.sort((a, b) => {
    const first = Date.parse(a.startedAt), second = Date.parse(b.startedAt);
    if (!Number.isFinite(first)) return Number.isFinite(second) ? 1 : 0;
    return Number.isFinite(second) ? first - second : -1;
  });
  for (const run of candidates) {
    const startedAt = Date.parse(run.startedAt);
    const originIndex = messages.findIndex(message => message.role === "user" && message.time === run.startedAt);
    let beforeIndex = messages.length;
    if (originIndex >= 0) beforeIndex = originIndex + 1;
    else if (Number.isFinite(startedAt)) {
      // Legacy messages may have no exact origin. Place by time, without sorting messages.
      const laterIndex = messages.findIndex(message => Date.parse(message.time) > startedAt);
      if (laterIndex >= 0) beforeIndex = laterIndex;
    }
    const slot = anchors.get(beforeIndex) || [];
    slot.push(run);
    anchors.set(beforeIndex, slot);
  }
  return anchors;
}
