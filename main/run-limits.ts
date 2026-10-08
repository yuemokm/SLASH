// Host bounds for a single task attempt. Pi keeps its own network idle,
// retry and context limits; these do not change those policies.
export const DEFAULT_RUN_LIMITS=Object.freeze({durationMs:30*60*1000,maxToolCalls:120});
