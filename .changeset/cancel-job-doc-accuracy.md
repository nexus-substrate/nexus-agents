---
'nexus-agents': patch
---

Correct the `cancel_job` doc to stop overstating what cancellation does (#4017).
The tool's docstring claimed an "in-process AbortController is the source of truth
for ACTUALLY stopping in-flight work" — but the shared `runAsJob` dispatch path
(`run`, `run_pipeline`, `run_dev_pipeline`, …) has no AbortController/signal wiring,
so a cancel marks the durable record but the background work keeps running to
completion. (`consensus_vote` is the exception — it has its own AbortSignal
plumbing and is genuinely interrupted.)

The docstring now states this accurately: cancel writes the `cancelled` record,
the terminal-writer guards (#4022) preserve it (no silent revert), and in-flight
`runAsJob` work continues. Wiring a real per-job AbortController so cancel actually
stops the work is tracked as #4086. No behavior change — this is a doc-vs-reality
correction.
