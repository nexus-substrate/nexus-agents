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
(`AUDIT_HASH_VERSION_TIER_TRANSITION`) for observability; `computeEventHash` then
folds a canonicalized, key-ordered projection of the tier-transition payload into
the SHA-256 (`src/audit/tier-transition-hash.ts`). The optional
`ratificationVoteRef` is folded in as `null` when absent, so adding/stripping it
changes the hash. **Pre-existing v1 (version-less) chains keep verifying** under
the original head-fields-only projection — no migration of existing logs, no
spurious `verifyChain` failures. Non-tier-transition events are never covered v2.

**Downgrade-resistant version selection.** `computeEventHash` DERIVES the v2
projection from the event's COVERED head fields — `isTierTransitionEvent`: a
`governance` event whose `action` is `tier.*` — and never from the mutable stored
`hashVersion`. Keying off the stored field would let an attacker editing the
plaintext log strip/alter `hashVersion`, recompute the v1 head-only hash, and
silently flip `toTier`. Because `category` and `action` are themselves in the
hashed projection, an attacker cannot escape the payload-covering v2 projection
without breaking the chain.

**Gate verifies the chain.** `recoverTransitions` in
`scripts/check-authority-tier-drift.ts` now runs `verifyChain` over the recovered
events and emits a fail-closed `transition-log-chain-broken` finding on any break,
so a tampered / reordered / forged transition event FAILS the gate, not just a
schema check.

**Tests.** RED-before/GREEN-after: a flipped `toTier`, a rewritten
`ratificationVoteRef`, and each of `subject`/`fromTier`/`evidenceRef` in a
persisted payload are now detected by `verifyChain` (`hash_mismatch`) and fail the
gate; a version-downgrade forgery (flip `toTier` + strip-or-force `hashVersion` +
recompute the v1 hash) is also caught; existing audit-chain / tier-transition /
verify_audit_chain suites stay green. The `hash-chained-audit` claim is now more
honest — the integrity-critical payload is genuinely chain-covered.
