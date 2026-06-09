---
'nexus-agents': minor
---

feat(capability-loop): default NEXUS_AUTO_REMEDIATE to audit (zero-write soak, #3769)

Flip the auto-remediation default from `off` to `audit` (#3769 Step 1, owner-approved).
Unset → `audit`: a bare `nexus-agents auto-remediate` now runs research → consensus
vote → durable soak with ZERO writes, so periodic local runs accumulate the
readiness-gate evidence. Explicit `off` disables; `enforce` stays opt-in and gated
by the readiness verdict. Adds an explicit `off` match (so the mode can still be
fully disabled) + updates the env-var docs. Note: durable soak accumulates only
where NEXUS_DATA_DIR persists (local runs), not ephemeral CI.
