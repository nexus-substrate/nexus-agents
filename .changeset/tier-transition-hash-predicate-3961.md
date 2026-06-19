---
'nexus-agents': patch
---

fix(audit): close tier-transition hash-coverage escape — unify transition predicate (#3961)

The tier-transition hash projection folded the integrity-critical
`metadata.tierTransition` payload into the chain hash only when
`isTierTransitionEvent` returned true, which required `action.startsWith('tier.')`.
But `extractTierTransition` (consumed by the ratification/drift gate) recovers a
transition from ANY `governance` event carrying a valid payload, regardless of
action. A `governance.audit` (non-`tier.`) event with a valid `tierTransition`
payload was therefore hashed WITHOUT covering the payload, yet consumed by the
gate as a promotion — a single-event undetectable forge.

Both decisions now derive from one shared predicate, `hasTierTransitionPayload`
(governance category + payload parses against `TierTransitionPayloadSchema`), so
hash-coverage ⊇ gate-consumption by construction and the two can never diverge
again. The chain remains tamper-EVIDENT (unkeyed SHA-256), not tamper-proof.
