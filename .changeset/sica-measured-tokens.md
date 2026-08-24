---
'nexus-agents': patch
---

fix(agents): SICA's cost metric no longer averages in unmeasured executions

`SicaVersionManager.updateMetrics` averaged `tokensUsed` across all execution
history. Since #4744 an execution whose adapter reported nothing carries a
placeholder `0`, and a FAILED execution recorded `0` unconditionally — so both
were averaged in as if the version had genuinely run for free.

This is decision-affecting, not just telemetry. `sica-agent-helpers` gates the
cost-focused improvement path on `metrics.avgTokensUsed > 2000`, so
understating the average can suppress the improvement SICA would otherwise
pursue. Two executions at 3000 and "unmeasured" averaged to 1500 and fell below
the threshold; they now average to 3000 with `unmeasuredExecutions: 1` recorded
beside it.

Failed executions record `tokensMeasured: false` rather than a bare `0` — a
failure produced no measurement, which is not the same as measuring zero.

`avgQualityScore` in the same function already filtered absent values and
returned `undefined`; the token average was the outlier. Internal types only,
confirmed by the #4749 surface gate.
