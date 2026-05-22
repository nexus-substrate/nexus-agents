---
'nexus-agents': patch
---

**docs(orchestration):** clarify `WorkflowRouter` outcome-recording scope. Part of #2824 (audit P2).

Audit #2824 flagged `workflow-router.ts` `PatternOutcome` history as per-instance, suggesting it be wired through `OutcomeStore` for cross-process learning. Verified: `route()` is a deterministic rule-based classifier that never reads recorded outcomes — there is no per-instance learning to lose and nothing to aggregate across processes. `recordOutcome` / `getMetrics` are an observability surface only. Added doc comments on `createWorkflowRouter` and `IWorkflowRouter` stating this explicitly, so a future maintainer who wants cross-process pattern metrics knows to add a dedicated `OutcomeStore` consumer rather than widening the router. Closes the audit bullet via its sanctioned "document explicitly" option — no behavior change.
