---
'nexus-agents': minor
---

feat(orchestration): shadow-logged learned strategy selection (#3551)

MetaOrchestrator step 3 of epic #3548. Adds a learned selector that, given the
same task signals as the rule-based selection, predicts an `ExecutionStrategy`
and logs its would-be choice alongside the executed rule-based choice — SHADOW
MODE only; the learned choice is never acted on (that is step 4 / #3552). It
reuses the existing `LinUCBBandit` (arms = strategies) rather than forking a
second learning stack, and exposes `summarizeShadowAgreement()` as the
would-select-vs-selected comparison surface (overall + per task class) for
offline policy evaluation. Shadow logging is wired default-on into the `run`
entry point via process-scoped singletons; the executed path is unchanged.
