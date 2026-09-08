---
'nexus-agents': patch
---

Test-only: a documented default for a `NEXUS_*` boolean must now be the default
the code actually applies (#5955). The two existing gates checked that every
documented name is registered; neither read what the row *said*, so a row could
state the opposite of the `parseBoolEnv` fallback and stay green. No runtime
change.
