---
'nexus-agents': patch
---

Prevent duplicate terminal circuit-breaker accounting when an integration executes a Base adapter path that already records outcomes to the exact same shared breaker. Preserve private-registry accounting, model-specific breaker domains, admission checks and exempt-error handling. Wrapper forwarding remains outside this fix.
