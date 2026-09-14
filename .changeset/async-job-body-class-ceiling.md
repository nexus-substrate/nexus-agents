---
'nexus-agents': patch
---

The `async-job-body` runaway-guard is now bounded by the class override ceiling (7200000ms, 2h) instead of the MCP request ceiling (3600000ms). A backgrounded job has no MCP request, so the request ceiling made the documented override range unreachable: `NEXUS_TIMEOUT_CLASS_ASYNC_JOB_BODY_MS=7200000` resolved to 3600000 and every `NEXUS_TIMEOUT_MULTIPLIER` at or above 1 was a no-op for that class. The default guard is unchanged at 1h; the extra hour is opt-in, and a wedged job holds its concurrency slot for the whole guard, so a longer guard widens the pool-starvation window. Values past the 2h ceiling are still clamped and reported at startup, now against the correct ceiling and naming that cost. Every other class keeps the MCP request ceiling. The near-timeout WARN still fires at 0.5 of whatever guard a job runs under, and `runAsJob` logs the effective guard once at job start so real job durations can be judged against it.
