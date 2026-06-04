---
'nexus-agents': patch
---

Add opt-in per-run token-budget enforcement to the dev-pipeline (#3395, the first half of #3150 P4). A new `BudgetGuard` wraps the existing, tested `BudgetCircuitBreaker` and meters every expert call in `agent-executor`: it records the real `tokensUsed` (now available via #3396) and, once cumulative usage crosses the configured ceiling, short-circuits further expert calls to a failure result — stopping token spend without aborting the pipeline mid-flight (hard-stop, not silent model downgrade; graceful fallback was deferred to #3394 by the consensus_vote). Strictly opt-in: absent `AgentExecutorConfig.budget` → a no-op guard → behavior is byte-for-byte unchanged. This is the per-task safety mechanism for unattended multi-day operation that #3150's cost-enforcement stage called for.
