---
'nexus-agents': minor
---

feat(governance): convert the authentic vote-record ledger from a linear hash
chain to a tamper-evident record SET + monotonic sequence (#3927 PR-1).

The `governance/vote-records.jsonl` ledger is a multi-branch committable
artifact, so the chain model (each record's hash folding in the prior record's
hash) could not survive a concurrent-branch git merge. The revised model
(design vote 7-0, Option B) treats the ledger as an unordered SET of self-hashed
records plus a monotonic `sequence`:

- New required `sequence` field (integer ≥ 0); record `version` bumped `1.0` →
  `1.1`. `previousHash` is now advisory/optional and NOT verified.
- The self-hash covers `sequence` but EXCLUDES `previousHash`, so hashes are
  position-independent and stable across merges and file reorders.
- `verifyVoteRecordChain` → `verifyVoteRecordSet`. New verification reasons:
  `sequence_gap` (omission) added; `previous_hash_mismatch` removed. Duplicate
  sequences are a benign concurrent-fork signal (surfaced as `forks`), not a
  failure.
- `.gitattributes`: `governance/vote-records.jsonl merge=union` for conflict-free
  append merges.

The separate audit-event/tier-transition chain is unchanged (single-writer
runtime — still a real chain). Fail-closed enforcement is deferred to PR-2; this
seam remains warn-only/unenforced.
