---
'nexus-agents': patch
---

**fix(pipeline):** type the policy snapshot, delete 4 inert rules. Closes #2932 (P1 security partial — see follow-up note).

The policy engine's `BUILT_IN_RULES` declared 5 gates: `trust-tier`, `security-review`, `bounded-iteration`, `cost-budget`, `high-risk-approval`. Each of the latter 4 read a `pipelineState` key — `securityReviewRequired`, `stageAttempts`, `costAccumulator`, `highRisk` — that **no producer ever wrote**. With the snapshot typed as `Record<string, unknown>`, every comparison evaluated against `undefined` and every rule silently allowed. They were aspirational scaffolding, not real gates.

This change:

- Replaces `PolicyContext.pipelineState: Readonly<Record<string, unknown>>` with a typed `PipelineStateSnapshot` interface listing only fields with a real producer chain. Adding a new rule now requires a corresponding producer wire-up at compile time.
- Deletes the 4 inert rules. Re-add them when a producer subsystem exists.
- Adds `toPipelineStateSnapshot()` in `v2-delegate.ts` as the single narrowing chokepoint between the untyped `task.metadata` producer surface and the typed snapshot.
- The kept `trust-tier` rule's wiring (caller-trust → `task.metadata.trustTier`) is owner-scoped follow-up — the chain runs through MCP middleware `RequestContext` and isn't trivially threaded; tracked in a focused follow-up issue.

49 tests pass across `policy-engine`, `policy-evaluator`, `v2-delegate`.
