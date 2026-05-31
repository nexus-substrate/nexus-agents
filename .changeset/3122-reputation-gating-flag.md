---
'nexus-agents': minor
---

feat(security): NEXUS_REPUTATION_GATING rollout flag for reputation tier gating (#3122, epic #3118 Phase 4)

Reputation-based trust-tier demotion in `issue_triage` now follows the same `off`/`audit`/`enforce` rollout convention as `NEXUS_ACCESS_POLICY_MODE`, defaulting to **`audit`** (compute + log + surface the would-be demotion, but enforce the classifier tier). Operators graduate to `enforce` after the demotion rate is known. `gateWithReputation()` + `resolveReputationGatingMode()` are exported from `reputation-model`; the triage result surfaces `trustAssessment.enforcedTrustTier` (the tier actually gated on), `reputationReconciledTier` (the would-be demotion), and `gatingMode` for telemetry, and a suppressed demotion is logged. The maintainer allowlist (Tier 1) remains the false-positive escape hatch in every mode.
