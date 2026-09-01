---
'nexus-agents': patch
---

fix(mcp): give each delegate_to_model alternative its own score (#5269)

`mapCompositeDecisionToOutput` filled every alternative with
`decision.topsisScore ?? 0.7` — the **winner's** score — and a hardcoded
`tradeoff: 'alternative option'`. A caller reading three alternatives that all
scored alike concluded they were equivalent to each other and to the selection,
which the router had never said.

The scores existed the whole time. `applyTopsisRanking` computes a closeness
score per candidate to produce the ranking, then discarded all but `topScore`.
That map is now carried through the stage, the decision builder and the
decision, and the tool reports each alternative's own value.

What made this sharper than an ordinary placeholder: the **non-router path**
(`delegate-to-model-helpers.ts`) always filled these fields correctly, so two
code paths emitted the identical output shape with genuinely different
epistemic status, and the caller could not tell which had produced it. Both
paths now use the same pure `getTradeoff` capability comparison.

Where no ranking ran there is no per-alternative score to report. The output
schema requires a `number`, so the field still carries the selected model's
score — but the `tradeoff` string now says exactly that, rather than letting
the number pass as the alternative's own. Absence is disclosed where it can be,
since `z.number()` cannot represent it. Making the field optional would be a
breaking change to an MCP output contract for a case that only arises when
TOPSIS ranking is disabled.

`alternativeScores` and `topsisScoresByArm` are both **additive optional**
fields, so `api-surface.txt` moves by two lines at the minor level; nothing is
removed or widened.

Three existing tests pinned the defect — two asserting the winner's score on an
alternative, one asserting the placeholder string — and are corrected. Mutation
testing found the producer end untested: removing the score map from
`applyTopsisRanking` left every test green while the consumer silently fell back
to the unranked path. That test exists now.

The other half of #5269 — `memory_stats` hardcoded task/error counts — was
already fixed by #5274 and needed no change.
