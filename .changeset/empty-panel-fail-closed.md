---
'nexus-agents': patch
---

Fail closed when a consensus vote completes with no votes. The development pipeline returns `no_quorum`, and MCP `consensus_vote` returns an error, or a failed job in async mode. An empty panel no longer produces a decision-cost row or a default rejection. Today this case cannot happen, because production panels always have 3 or 7 seats; the guard is defence in depth.

Any pipeline vote that fails closed now also records one failed `planning` outcome with `cli: 'unknown'`, so the failure is visible in outcome and failure analysis instead of leaving no trace. `'unknown'` is excluded from CLI quality signals, strategy distillation and bandit warm-start, so routing is unaffected.
