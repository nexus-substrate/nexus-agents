---
'nexus-agents': patch
---

fix(consensus): tell the contrarian when it is seeing part of the proposal

`runContrarianCheck` cut the proposal to 2000 characters with no marker. A
`pr_review` proposal carries up to `MAX_DIFF_LENGTH = 50_000` bytes of diff, so
the contrarian could be deciding whether to escalate having seen ~4% of it —
the header region, where a diff is least informative — and returned the same
`{ shouldEscalate: false }` it returns after reading the whole thing. In
`quickMode` the 3-voter result then stands unescalated on that basis.

The budget is unchanged, so escalation behaviour on ordinary proposals is
identical. What changed is that exceeding it is disclosed: the prompt carries a
visible partial-view note, and the truncation is logged.

Adds `utils/bounded-artifact.ts`, the character-oriented sibling of
`pr-review-diff-budget.ts` (#4140) — within budget the output is
byte-identical; over budget a note rides on the prompt and a machine-readable
bound rides on the result.
