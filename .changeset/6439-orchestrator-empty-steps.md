---
'nexus-agents': patch
---

Fix vacuous `tokensMeasured: true` on zero-step orchestrator execution (#6439). `createResult` now aggregates `tokensMeasured` across steps with `allOf(steps, (s) => s.tokensMeasured === true, false)`, correctly naming the empty case as unmeasured per `.rules/development-disciplines.md` instead of allowing `[].every()` to default to `true`.
