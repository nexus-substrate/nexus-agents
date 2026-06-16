---
'nexus-agents': minor
---

feat(audit): tier-transition audit events + ratification-linked promotion gate (#3842)

Completes the authority-ladder enforcement (Epic D / ADR-0017) by giving
promotions and demotions an auditable, ratification-linked trail. The #3841 vote
flagged that refusals/promotions currently leave no audit record; this closes
that gap.

A new typed, hash-chained audit event records every authority-tier transition:
`{ kind: 'promotion' | 'demotion', subject, fromTier, toTier, evidenceRef,
ratificationVoteRef? }`. It is emitted via `AuditLogger.logTierTransition(...)`
as a `governance`-category event whose `metadata.tierTransition` carries the
structured payload, so the existing hash chain (and `verifyChain`) is unchanged
and the transition is recovered by `extractTierTransition`.

The authority-tier CI gate (`scripts/check-authority-tier-drift.ts`, already
joined into `governance:check`) is extended with the ratification invariant
ADR-0017 requires: it reads the hash-chained tier-transition log
(`governance/authority-tier-transitions.jsonl`, optional) and FAILS any
`promotion` event lacking a linked `ratificationVoteRef`. Demotions are automatic
and need no vote. No parallel governance mechanism was introduced.

Tests prove (a) a tier-transition event hash-chains correctly and `verifyChain`
still validates over the new event type, (b) the gate FAILS on a promotion event
without a `ratificationVoteRef`, and (c) PASSES on a promotion WITH a vote ref and
on a demotion without one — both with hand-built payloads and with events emitted
through the real hash-chained logger.
