---
'nexus-agents': minor
---

stop reporting a perfect confidence for a session that never measured one

`buildAggregatedResult` returned `averageConfidence: 1.0` — the best possible
score — for every collaboration session, and `conflictCount: 0` as a literal.
Its sibling `ResultAggregator.buildResult` computes both from the same
`AggregatedResult` shape.

The two are not symmetric, though, and the asymmetry is the point: **no input
reaching the session builder carries a confidence signal at all.** Neither
`TaskResult`, `ResultMetadata`, `VoteMessage` nor `ExpertParticipation` has the
field; the aggregator path computes it from `ExpertResult.confidence`. So there
was nothing to compute, and the value was a placeholder presented as a score.

Following the precedent already in this interface (`unmeasuredResults`, #4743,
and `ResultMetadata.tokensMeasured`, #4734), `AggregationMetadata` gains an
optional `confidenceMeasured`. The session builder reports `0` with
`confidenceMeasured: false`; the aggregator reports its computed value with
`confidenceMeasured: true`. The placeholder now fails in the safe direction — a
consumer thresholding on confidence previously passed unconditionally.

`AggregationMetadata` gaining an optional field is an additive public-API
change, so this is a minor rather than a patch.

`conflictCount` is now derived from the `conflicts` list so the two cannot
drift. That path still performs no conflict detection, which is #4854.

Fixes #4831.
