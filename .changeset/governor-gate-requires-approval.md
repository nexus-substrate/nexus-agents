---
'nexus-agents': patch
---

require an approving verdict at the governor review gate

`matchedRecordOutcome` returned `pass` whenever a diff-bound `pr_review` record
existed for the PR, without ever reading `match.verdict` — and interpolated the
verdict into the pass reason, so the gate could emit
`pass ... verdict=request_changes`. A reviewer who explicitly refused a
governor-path change satisfied the gate that exists to require review.

- `request_changes` now **fails**, closed regardless of warn-first: warn-first
  covers a review that has not happened yet, not one that happened and said no.
- `abstain` **warns** — nothing affirmed, nothing refused, so it sits with
  absence pending the enforce flip (#4058).
- `approve` passes, unchanged.

Verdicts are also aggregated across every matching record, with
`request_changes` winning. The gate took `records.find(...)` — the first match
in an append-only ledger — so the _earliest_ review for a diff decided the
outcome and an early approve shadowed a later refusal on the identical diff.

A refusal does not block indefinitely: records are bound to
`reviewedDiffHash`, so pushing a fix changes the hash and the gate falls back
to warn-on-absence until a new review lands.
