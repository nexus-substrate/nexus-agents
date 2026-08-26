---
'nexus-agents': minor
---

feat(agents): say whether a collaboration's empty conflict list is a finding or a non-check

`buildAggregatedResult` returns `conflicts: []` and `conflictCount: 0` for every
collaboration session, because it compares nothing — `TaskResult` carries neither
the `confidence` nor the `expertId` that conflict resolution needs. That output is
byte-identical to what a genuinely unanimous session produces, so two experts
returning opposite answers read as consensus.

`AggregationMetadata` gains an optional `conflictsDetected`. The session builder
sets it `false`; `ResultAggregator`, which does compare fields pairwise, sets it
`true`. Absent still means the producer predates the distinction. Same shape as
`confidenceMeasured` (#4831) and `tokensMeasured` (#4734).

This discloses the gap rather than closing it — wiring real detection into the
session path needs the `TaskResult`/`ExpertResult` reconciliation tracked in
#4854, which stays open for that work.

Refs #4854.
