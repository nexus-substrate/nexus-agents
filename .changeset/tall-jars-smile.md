---
'nexus-agents': patch
---

context: the last two undisclosed prompt sections now state their cut, and the ranked prefix marks what its budget dropped (#5850, #5851)

`summarizeContextForPrompt` renders six sections. Four disclosed how much they cut; `### Similar prior work` and `### Observed patterns` rendered a bare heading over a hard `.slice(0, 3)`. Because the siblings disclose, a heading without counts read as "nothing was dropped" — and both lists are fetched with the default `limit = 5`, so two items went missing on the ordinary path. The cut happens during rendering, before the 2500-token clamp, so the trailing clip notice never covered it. Every legacy section now goes through one `renderDisclosedSection`, which is what keeps them from drifting apart again.

Under `NEXUS_CONTEXT_RANKED=1`, the ranked block is pre-truncated to a 400-token budget — well under the outer clamp, so `clipped` is never true and the documented "backpressure" notice could not fire. `topRankedWithinBudget` now returns `{ kept, omitted }` and the block renders a `_(+N lower-ranked items omitted …)_` line, the same disclosure shape `renderRepoMap` already uses.
