---
'nexus-agents': minor
---

feat(cli-adapters): record whether a budget debit was measured or estimated

`executeWithBudget` debits `usage?.totalTokens ?? estimatedTokens` and
`costUsd ?? estimatedCostUsd`. Each figure holds **either** a measurement
**or** the router's own estimate, and nothing downstream recorded which — so
`SessionBudget` accumulated a mixture, and a reader of `utilizationPercent`
could not tell whether it rested on reported token counts or on a guess. The
log line called the whole thing `actualTokens` either way.

This became live rather than theoretical when #5241 gave `CliResponse.costUsd`
its first producer: before that, the cost branch could never take its left side,
so every cost debit was an estimate. Now the two populations genuinely mix.

`SessionBudget` gains a `coverage` object counting measured and estimated
debits **per dimension** — the dimensions diverge in practice, since every
vendor except Claude reports token usage and no cost, so one debit is measured
on tokens and estimated on cost. All four counts are zero on a fresh or reset
budget: nothing measured is not the same as fully measured.

`actualTokens` / `actualCostUsd` are renamed `debitedTokens` /
`debitedCostUsd`. Neither `actual` nor `estimated` is right for a field holding
both; the basis travels in `coverage` instead, and the log line now carries
`tokensMeasured` / `costMeasured` flags.

**Semver note:** `coverage` is a required field on `SessionBudget`, which is
additive for consumers — they read a budget, they do not construct one. The
implementor contract `IBudgetRouter` is not in `api-surface.txt`, and the only
published surface is the concrete `BudgetRouter` class, so no external
implementor is obliged to produce a `SessionBudget`. Hence minor rather than
major.
