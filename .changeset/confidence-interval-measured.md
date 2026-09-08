---
'nexus-agents': patch
---

`ConfidenceInterval` gains a required `measured` flag (#5760 item 3).
`meanConfidenceInterval([])` returned a ZERO-WIDTH interval — the strongest
possible precision claim, over no data. The proportion sibling's `[0, 1]` was
honest only by luck (a bounded domain), and `calculateDifferenceCI` divided by
`(total1 || 1)` and produced a finite spread from nothing. All three now say so.
Infinity and NaN bounds were considered and rejected: both serialise to `null`,
turning a loud in-process signal into a silent persisted one.
