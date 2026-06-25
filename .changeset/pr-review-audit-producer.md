---
'nexus-agents': minor
---

pr_review now persists authentic, diff-bound governance records (#4031). When a
review is given both `prNumber` and `baseSha` and runs live (not simulated), it
writes a self-hashed Option-C record binding `{prNumber, baseSha,
reviewedDiffHash, verdict}` to the governance ledger — the record the warn-first
governor-review gate (#3831) queries. This completes the #3831 Stage-1 store,
which built the reader/gate/schema but deferred the producer, so the gate could
only ever warn against an empty ledger.

The new `persistPrReviewRecord` mirrors `persistVoteRecord` (ledger-tip read →
monotonic sequence → previousHash chaining → append; merge-safe SET semantics).
The response carries a structured `recordOutcome` so callers see whether a record
was written and, when not, why (`binding-inputs-absent` / `simulated` /
`no-live-votes` / `write-failed`). An all-errored panel (no live opinion) is
skipped with `no-live-votes` — a failed review must not seed a gate-satisfying
record (the governor-review analogue of the consensus_vote `no_quorum` void).
Persistence is best-effort and never fails the review. The reviewed-diff hash is
computed over the exact diff the voters saw using the same canonical hash the gate
recomputes with; for the gate to match a record, callers must pass the canonical
`git diff <baseSha>..<headSha>` as `prDiff` (its first 50_000 bytes must match —
the hash truncates there, and the producer warns when the diff exceeds it).
`baseSha` is
caller-asserted and not yet cross-validated against the diff — acceptable for the
warn-first gate; a future warn→enforce flip must add that provenance check.
