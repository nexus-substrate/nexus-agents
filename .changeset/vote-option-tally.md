---
'nexus-agents': minor
---

Vote records can now represent a multi-option split (#4452, increment 1).

`consensus_vote` tallies approve/reject/abstain only. On a proposal offering named options, every engaged voter returns `approve` — so a real 6-1 or 5-2 split persists as `approve: 7, approvalPercentage: 100` and reads as unanimous. Three live votes did exactly that, one of them inside a vote whose own proposal warned about the bug.

Adds an optional `optionTally` to `VoteRecord` (schema 1.3), derived automatically from a new `AgentVoteResult.selectedOption`. When no voter declares an option — an ordinary yes/no vote — the field is absent and the record stays on schema 1.2.

**Back-compat is the load-bearing property.** `VoteRecord` is self-hashed and `verifyVoteRecordSet` rebuilds every field in schema order, so naively adding a field would flip every historical record to `hash_mismatch` — breaking the audit chain while fixing its fidelity. `optionTally` is therefore folded into the hash **only when present, appended after the stable base**, exactly as `ratifies` was for schema 1.2. A record without it re-hashes byte-identical to the pre-1.3 projection, pinned by a literal-hash regression test.

The tally is emitted in descending count with ties broken by label, so two vote sets differing only in voter arrival order produce the same hash — the array is hash-covered, so nondeterministic ordering would be a spurious `hash_mismatch`.

Not yet included, tracked as increment 2: the `options` input on `consensus_vote`, the voter prompt requesting a selection, and threshold evaluation over the option tally (so `unanimous` stops being trivially clearable on a multi-option proposal).
