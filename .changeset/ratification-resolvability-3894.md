---
'nexus-agents': patch
---

fix(governance): make the promotion gate verify ratification-vote RESOLVABILITY, not non-emptiness (#3894)

The authority-ladder promotion gate (`analyzeTierTransitionEvents` in
`scripts/check-authority-tier-drift.ts`, under `governance:check`) failed a
`kind:'promotion'` tier-transition only when its `ratificationVoteRef` was
_empty_ — a bogus `ratificationVoteRef:'x'` passed. The "ratification-LINKED"
guarantee (#3842) was therefore only as strong as a non-empty string, the
cosmetic-linkage gap the #3893 ratification panel's Contrarian flagged.

The gate now RESOLVES the ref against a committed ratification-vote ledger and
fails three new ways:

- `promotion-ratification-unresolved` — the (non-empty) ref does not resolve to
  any recorded vote.
- `promotion-ratification-not-approved` — it resolves but the vote was not
  `approved`, was not a `higher_order` vote (a promotion is
  governance-of-the-governor), or its `subject` does not match the transition.
- `ratification-ledger-invalid` — the ledger itself fails schema validation
  (fail-closed: the resolver then resolves nothing, so every promotion fails).

**Resolution source.** Live `consensus_vote` results are persisted only to
per-developer home-dir stores (`~/.nexus-agents/voting/`,
`~/.nexus-agents/learning/`) that a CI gate — no live server, no developer home
dir — cannot read. There is no other committed, queryable source of truth. So
the honest mechanism is a new committed ledger `governance/ratification-votes.yaml`
(schema `RatificationVoteLedgerSchema` in `src/audit/audit-types.ts`), empty
today. **Residual gap:** the gate verifies STRUCTURAL PRESENCE of an approved,
higher_order vote in a committed (hence reviewable) record — it does not, and
cannot from CI, re-execute the vote.

The schema-level discriminated-union tightening of `TierTransitionPayload`
(#3894 item 2) was intentionally NOT done: the emitter deliberately still chains
a promotion that lacks a vote ref (so tampering cannot erase the event), with the
invariant located in the gate — a write-time required field would conflict with
that documented design, so it is not low-risk.
