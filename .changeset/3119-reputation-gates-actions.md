---
'nexus-agents': minor
---

**feat(security):** contributor reputation now GATES issue-triage actions (#3119, Phase 0 of epic #3118).

`issue_triage` computed a `ReputationAssessment` per issue (#828) but passed only the trust-classifier tier to the policy gate — so the assessment surfaced in output metadata yet enforced nothing (a live dead end). It now reconciles the gate's input tier via a new `reconcileTrustTier(classifierTier, reputation)`:

- **demotion-only** — reputation can only raise the tier (more restrictive), never lower it;
- **Tier-1/allowlist wins** — an owner/allowlisted maintainer is never demoted by reputation;
- **absent reputation → classifier tier** — no fabrication, no escalation on missing data;
- **`reputationScore` stays advisory** — only `effectiveTrustTier` moves the gate.

Effect: a suspicious author (e.g. injection-flagged content) is demoted and their tier-gated proposed actions (`ProposeLabels`/`DraftReply`) are marked `policyApproved: false`. Live by default (`enableReputation` defaults true); `issue_triage` emits proposals, not auto-actions. A graduated off/audit/enforce rollout flag for higher-stakes wiring lands in Phase 4 (#3122). `reconcileTrustTier` is exported for reuse by the firewall (#3106) and the Phase 2 consolidation (#3120).
