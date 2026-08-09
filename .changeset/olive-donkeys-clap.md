---
'nexus-agents': patch
---

fix(mcp): make `runAsJob` fail closed on failure-shaped results (#4363)

Increment 2 of the unanimous Option C decision on #4351. `writeJobComplete` fired
on **any** resolved value, so a `run` callback that resolved a failure-shaped
payload recorded `status: 'complete'` — a caller polling `get_job_result` read it
as a success and never looked inside. Increment 1 (#4362) normalized the two known
offenders; this makes the chokepoint itself refuse the shape, so the next caller
cannot reintroduce the bug by omission.

The check inspects the payload's **root** keys only — `isError === true`,
`ok === false`, `success === false` — and never deep-scans. A vote whose _decision_
is `reject`, and a pipeline summary listing a stage it recovered from, both carry a
nested falsy `success` and are successful jobs; misreading them would trade
fail-open for fail-wrong. The job record names which key tripped and carries the
payload's own message, so it is debuggable rather than a bare `failed`.

Callers that legitimately resolve a failure-shaped payload set
`allowFailureShapedResult` with a stated reason, which is logged whenever it
actually suppresses a detection — an opted-out caller is a visible policy decision,
not a silent kwarg.

The accompanying caller audit found one site still bypassing the guard:
`run_pipeline` wrapped its result in `toolSuccessStructured`, which nests the
payload under `structuredContent` and left the `ToolResult` root clean, so a
`success: false` pipeline was recorded `complete` on both the sync and async paths.
It now hoists the verdict to the root the way `run_graph_workflow` does.
