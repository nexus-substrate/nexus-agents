---
'nexus-agents': patch
---

fix(research): say how many improvement opportunities synthesis found, not just the ten it lists

`buildAlignmentSummary` capped `topOpportunities` at ten with no count beside it,
so a caller could not tell a repo with exactly ten improvable techniques from one
with fifty. The alignment map holds twelve `partial` techniques carrying a hint,
so the cap bites in practice. `AlignmentSummary` now carries `totalOpportunities`,
capped and counted in one place so the two cannot drift — the same shape
`ClusterSynthesis.totalInsights` took in #5048.

Also adds the first tests for `AttributedInsightSchema`. `.rules/research.md`
credits it with structurally enforcing that every synthesized insight names a
source, but its only call site builds the id list non-empty by construction, so
`.min(1)` had never had the opportunity to reject anything and no test imported
it. The schema is correct; nothing had checked that it was.

Refs #5001.
