---
'nexus-agents': patch
---

security-expert: the no-adapter review no longer reports full coverage and a perfect score (#5879)

`SecurityExpert.executeHeuristic` — the branch taken when **no model adapter is configured** — hard-coded `findingsCoverage: 'complete'`, and `calculateSecurityScore([])` returns `100`. So a run in which nothing examined the code was recorded as a fully covered, perfectly clean security review. The regex it does run scans `task.description`, not the change.

It counted as an approval. `parseExpertReview` keys its two fail-closed guards on exactly this field (`'unmeasured'` → `errored`, `'partial'` → `findings`); `'complete'` missed both, fell through to a shape sniff that sees the empty `vulnerabilities` array, and `determineApproval` returned `true` — defeating the `allOf(reviews, …, false)` guard #5012/#4581 added so an unreviewed PR could not read as unanimous approval.

The sibling parse-failure branch was fixed for this exact hazard in #5791 and this one was left behind. Both now share one `heuristicSecurityOutcome`, so they cannot drift apart again: a regex hit over prose is `partial` with a real score, no hit is `unmeasured` with a fail-closed `0`, and neither is ever `complete`.

Given #5875 — `orchestrate` cannot obtain a CLI adapter on the CI runner — the no-adapter path is not hypothetical.
