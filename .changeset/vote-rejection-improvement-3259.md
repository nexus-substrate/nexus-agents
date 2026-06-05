---
'nexus-agents': minor
---

feat(improvement-review): route recurring vote rejections into improvement signals (#3259)

`consensus_vote` buffers a `signal.vote_rejected` event (carrying the ADR-0016
`rejectionRules`) on the pipeline bus for every rejected plan, but no consumer
read it — rejection reasons stayed local to each proposal. `improvement_review`
now reads the buffered rejections (window-filtered, fail-soft) and surfaces a new
`consensus`-category signal when a single rule (`DRY_VIOLATION`,
`OVER_ENGINEERING`, …) recurs across ≥3 rejected plans, closing the feedback loop
the 2026-05-31 system review flagged as missing. Recurring rejection for the same
reason is a systemic planning gap, surfaced once instead of plan-by-plan. The
recalled rule is re-validated against the canonical ADR-0016 allowlist
(defense-in-depth) before it can reach an issue title/body.
