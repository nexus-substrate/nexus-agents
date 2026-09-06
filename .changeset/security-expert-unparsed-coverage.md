---
'nexus-agents': patch
---

A security review whose model output could not be parsed is no longer recorded
as a clean, complete review. `parseSecurityResult`'s catch branch hard-coded
`findingsCoverage: 'complete'`, and `calculateSecurityScore([])` returns 100, so
an adapter answering "I could not complete this review." produced
`securityScore: 100, findingsCoverage: 'complete'` — and `parseExpertReview`,
which maps `unmeasured` to verdict `errored`, never saw it. The branch now
routes through the same `scoreFor` the structured path uses: `unmeasured` with a
fail-closed zero when the prose heuristic found nothing, `partial` scored on
what it found when it did.
