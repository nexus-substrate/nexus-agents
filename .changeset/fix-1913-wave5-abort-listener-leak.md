---
'nexus-agents': patch
---

fix(workflows): remove abort listener on cleanup to avoid leaks on long-lived signals (#1913 wave 5)

`parallel-executor.ts` registered an `abort` listener on the caller-provided `context.signal` but never removed it. When the same long-lived parent signal drives many parallel executions (e.g., a root-request signal handed through a pipeline), listeners accumulate — one per execution. On hot paths this slowly degrades memory and crosses the AbortSignal warning threshold.

`cleanupExecution` now also calls `signal.removeEventListener('abort', handler)`. The stored signal+handler pair lives in `ParallelState.abortCleanup` so the removal happens idempotently whether the execution completed, errored, or timed out.
