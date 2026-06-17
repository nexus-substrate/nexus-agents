---
'nexus-agents': patch
---

fix(audit): hash-cover the tier-transition payload + verify the chain in the drift gate (#3921)

HIGH-severity tamper-evidence gap. The tier-transition payload the promotion gate
trusts ({subject, fromTier, toTier, evidenceRef, ratificationVoteRef}) lived in
`metadata.tierTransition`, which `computeEventHash` did NOT cover — so flipping
`toTier` or borrowing another approval's `ratificationVoteRef` in a persisted
event left the hash valid. The gate also never called `verifyChain`, doing only a
per-line schema parse. Both halves of the "tamper-evident" guarantee failed.

**Hash coverage (versioned, migration-safe).** Added an optional `hashVersion`
field to `AuditEvent`. Tier-transition events are stamped `hashVersion: 2`
(`AUDIT_HASH_VERSION_TIER_TRANSITION`); `computeEventHash` then folds a
canonicalized, key-ordered projection of the tier-transition payload into the
SHA-256 (`src/audit/tier-transition-hash.ts`). The optional `ratificationVoteRef`
is folded in as `null` when absent, so adding/stripping it changes the hash.
Verification reads `hashVersion` off each event, so **pre-existing v1
(version-less) chains keep verifying under the original head-fields-only
projection** — no migration of existing logs, no spurious `verifyChain` failures.
Non-tier-transition events are never stamped v2.

**Gate verifies the chain.** `recoverTransitions` in
`scripts/check-authority-tier-drift.ts` now runs `verifyChain` over the recovered
events and emits a fail-closed `transition-log-chain-broken` finding on any break,
so a tampered / reordered / forged transition event FAILS the gate, not just a
schema check.

**Tests.** RED-before/GREEN-after: a flipped `toTier` and a rewritten
`ratificationVoteRef` in a persisted payload are now detected by `verifyChain`
(`hash_mismatch`) and fail the gate; existing audit-chain / tier-transition /
verify_audit_chain suites stay green. The `hash-chained-audit` claim is now more
honest — the integrity-critical payload is genuinely chain-covered.
