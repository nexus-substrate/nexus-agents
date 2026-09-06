---
'nexus-agents': patch
---

`NEXUS_SANDBOX` is validated as the non-empty flavor string every producer and reader uses (`docker-opencode`, …) instead of a boolean, so a correctly configured sandbox no longer warns "invalid value" at startup; the sandbox-factory fallback text no longer calls the variable an isolation mechanism (#5695).
