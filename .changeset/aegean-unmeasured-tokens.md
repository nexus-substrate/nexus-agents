---
'nexus-agents': patch
---

stop the Aegean protocol reporting a partly-blind token total as a measurement

`aegean-protocol.ts` read `metadata.tokensUsed` from every proposal and vote and
never consulted `metadata.tokensMeasured`, which `ResultMetadata` has carried
since #4734. A contributor whose adapter reported no usage therefore added `0`
to the round total, and the total could not say how many of its contributors
were silent — an under-count, which for anything cap-shaped is the dangerous
direction.

The placeholder now stays out of the sum and is counted instead, so
`tokensUsed` is a total of measurements and `unmeasuredTokenContributions`
says how far short of complete it is. Downstream, `buildSessionTaskResult`
turns a non-zero count into `tokensMeasured: false` on the `TaskResult` it
submits — the disclosure the rest of the tree already reads, rather than a new
field only this module understands.

A vote that timed out or whose agent was missing still contributes zero by a
different route — nothing executed — and is deliberately not counted as
unmeasured.
