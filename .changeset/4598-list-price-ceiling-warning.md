---
'nexus-agents': patch
---

Warn when a task-class cost ceiling admits a candidate using a list-price estimate,
with a caveat that actual contract or gateway charges may differ. Explicit
`NEXUS_GATEWAY_COST` rates remain `declared` and log at info without a caveat.
Routing choices are unchanged: over-ceiling and unpriced candidates are dropped.
