---
'nexus-agents': patch
---

pipeline: a warn-mode policy verdict is no longer recorded identically to a clean pass (#5862)

`PolicyEvalResult.allowed` is `true` on every path the evaluator **returns**: `off` short-circuits, `warn` is `mode === 'warn' || violations.length === 0`, and block-plus-denial *throws* rather than returning. Two consumers read only that boolean, so a gate that found violations was indistinguishable from one that found none.

- `plan-compiler.ts` — the `warned` status its own doc block promised was unreachable, and `verdict.violations` was discarded before anything was recorded. The status is now derived from `violations.length`, the violations travel with it, and every gate entry carries `policyEvaluated` / `policyMode` so a gate that ran no rule is distinguishable from one that ran them all and passed.
- `v2-orchestrate.ts` — the branch that mapped violations onto `PipelineMetrics` was unreachable under `warn`, and `PipelineMetrics` is the whole observable output of that path. `policyViolations` and a new `policyMode` are now populated whenever violations exist; `policyBlocked` still means only "policy stopped the run".

Neither path had a truthful field beside the misreport: the gate record was `{ gateId, status }` and the evaluator's event bus is optional, so with none wired the record was the only trace.
