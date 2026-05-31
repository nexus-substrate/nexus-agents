---
'nexus-agents': minor
---

feat(security): gate pr_review posting on author reputation (#3123, epic #3118 Phase 5)

`pr-reviewer` now assesses author reputation and feeds the reputation-reconciled tier into its policy gate, closing the PR-path equivalent of the #828/#3106 dead-end (the author was trust-classified but reputation was never gated). Reuses the global `NEXUS_REPUTATION_GATING` rollout flag (`off`/`audit`/`enforce`, default `audit`) and the `gateWithReputation` primitive from Phase 4, so behavior matches `issue_triage`. The review result now surfaces `trustAssessment` (`enforcedTrustTier`, `reputationReconciledTier`, `gatingMode`, `reputationScore`, `isSuspicious`) for observability, controlled by a new `enableReputation` config (default on). Account-age fetch for the PR path is deferred to a follow-up (PR signals used: author association + injection flags; absent signals are omitted, never fabricated). The maintainer allowlist (Tier 1) remains the escape hatch in every mode.
