---
'nexus-agents': patch
---

feat(capability-loop): off-by-default auto-remediation enforce orchestrator (#3618)

The capstone of the #3540 auto-invoke gate (design re-vote ratified 7/7). Ships
`runAutoRemediation` — pure, fully-tested control flow over injected
`AutoRemediationDeps`, OFF-BY-DEFAULT and fail-closed at every gate:

- exact-match `NEXUS_AUTO_REMEDIATE` ∈ {off (default) | audit | enforce}; `audit`
  runs admission + RESEARCH + plan and STOPS before IMPLEMENT (provably write-free
  — no lease, no PR); `enforce` runs the full path;
- enforce gates: single pre-loop `evaluateEnforceReadiness` (#3612), then an
  atomic lease (#3618 condition 1 — `acquireLease` returns null if held);
- per-signal fail-closed admission: `isSecuritySignal` human-gate (#3615) +
  `RemediationGuard` (#3617), ≤5/run rate cap;
- #3613 phase machine: RESEARCH → strict `parseRemediationPlan` → IMPLEMENT via
  the dev-pipeline (researchOverride + untrustedInputGuard, #3643), PR-only,
  never auto-merge, per-step audit; `assessRemediationOutcome` feedback (#3616).

Real side-effecting adapters + entry point are the wiring increment #3648.
Enforce stays owner-gated; this module never enables itself.
