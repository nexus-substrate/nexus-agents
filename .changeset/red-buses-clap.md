---
'nexus-agents': patch
---

A voter that reported no tokens is no longer certified as measured (#4430)

`isMeasured` keyed on `costUsd` alone. Because the breakdown coerces absent counts (`inputTokens ?? 0`), any voter whose adapter reported no usage still produced a `0 / 0` line flagged `unmeasured: false` — the rollup certified a non-measurement as measured.

Observed live across three 7-voter panels: every `gpt-5.5` voter returned full reasoning that counted toward the verdict while reporting `0` input and `0` output, all flagged measured. That also defeats the natural mitigation — a consumer told to discard zero-token voters would have dropped 3 of 7 in one of those votes, enough to move a supermajority.

Now requires a computable cost **and** at least one reported token counter. An explicit `0` is still a measurement (a genuinely free model stays measured, #4165); absent is not. Either counter suffices, since some adapters report only completion tokens and demanding both would newly discard voters that were previously counted.

The separate "cached input tokens are parsed then discarded" half of #4430 is tracked in #4435 — folding them into `inputTokens` would overstate cost, since cache reads bill at roughly a tenth of the uncached rate.
