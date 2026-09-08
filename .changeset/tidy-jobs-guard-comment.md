---
'nexus-agents': patch
---

Correct the `async-job-body` runaway-guard comment, which claimed a knob the class cannot honour (#5785)

`run-as-job.ts` documented the `async-job-body` operation class as "3600s,
honoring NEXUS_TIMEOUT_MULTIPLIER + the per-class override". It does not, and
cannot: the class is declared at exactly `MCP_TIMEOUTS.maxMs` (3_600_000), and
`describeClassGuard` re-clamps the resolved value to that same ceiling. For this
one class both knobs can therefore only lower the guard —
`NEXUS_TIMEOUT_CLASS_ASYNC_JOB_BODY_MS=7200000` resolves to 3600000, and every
multiplier at or above 1.0 is a no-op.

Behaviour is unchanged. The clamp is already disclosed at startup by
`findIneffectiveVars`, which names the variable, its requested and effective
values, and the reason; this comment was the last place still asserting the
opposite. Whether an MCP _request_ ceiling should bound a job body that by
construction has no MCP request is recorded as the open half of #5785.
