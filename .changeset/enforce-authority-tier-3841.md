---
'nexus-agents': minor
---

feat(orchestration): machine-enforce the manifest authority tier (#3841)

The authority-ladder's `authorityTier` field (ADR-0017, Epic D) had no machine
consumer — "documentation dressed as architecture" per the ratification panel's
Contrarian. This adds the enforcement layer: declarations, a router refusal, and
a CI declaration gate.

**Tier declarations.** All eight strategy manifests now declare `authorityTier`
in lockstep across `governance/strategy-manifests.yaml` and the embedded
`STRATEGY_MANIFEST_REGISTRY` (the #3837 drift-gate keeps them honest). The
work-producing strategies are `suggest` (output is inert until a human/governor
acts — routed through the dev gate / review, never auto-applied); `consensus` is
`advisory` (casts non-blocking votes, the ADR pr_review example). None are
`enforce` — that requires earned evidence + ratification, never a default flip.

**Router refusal (runtime).** `src/orchestration/authority-tier-guard.ts` makes
the tier→permitted-action mapping explicit and pure (`permitsAction`): a strategy
may take an action at or below its declared tier; an action above it is REFUSED
fail-closed with a typed `AuthorityRefusalError`. An undeclared tier fail-closes
to the `observe` floor. The MetaOrchestrator router consumes it via the new
optional `requiredAuthority` input and refuses BEFORE recording or returning the
decision.

**CI gate (declaration-time).** `scripts/check-authority-tier-drift.ts` (pure
`analyzeTierDeclarations` core) joins `governance:check` as a sibling to the
#3837 manifest drift-gate. It fails when a registered manifest has no declared
tier, or when a manifest is declared `enforce` without a floor-meeting
promotion-evidence record (ADR-0017 advisory→enforce floor: evalN ≥ 100,
soak ≥ P30D, precision ≥ 0.90, recall ≥ 0.80, ratification vote present) in the
new `governance/authority-tier-evidence.yaml` ledger. The evidence-threshold
schema is pinned in `strategy-manifest.ts` (`PromotionEvidenceSchema`).

Deferred to #3842: tier-transition audit events + the gate that fails a promotion
audit event lacking a linked ratification vote over the hash-chained log.
