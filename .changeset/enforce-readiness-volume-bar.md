---
'nexus-agents': patch
---

Raise the auto-remediation enforce-readiness volume bar (#4158): `DEFAULT_ENFORCE_READINESS_CONFIG.minShadowSelections` 20 → 100. This gate authorizes the auto-remediation enforce flip, which makes REAL code changes; its volume bar now matches the comparably-stakes access-policy flip (clawguard-eval ≥100, #2077) rather than sitting 5× lower. Monotonically safer (a thinner corpus stays in audit longer); overridable per-caller via `readinessConfig`. Surfaced by the #4094 vote-gate.
