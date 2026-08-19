---
'nexus-agents': patch
---

Assess routing capacity per arm, not per display slot (#4455).

`CapacityFilterStage` collapsed candidates onto vendor display slots before probing, so `claude` and `api:anthropic` — which share a slot but hold entirely independent quotas, a CLI subscription and an API key — were treated as one route. In a stage whose action is destructive exclusion, that is the wrong quantity rather than an imprecise one.

Two observable failures, both now covered by regression tests:

- **False positive (destructive).** CLI `claude` exhausted, `api:anthropic` healthy → the shared slot was filtered and **both** arms were removed. If it was the last candidate, the task failed closed with `capacity_exhausted` naming an arm that had capacity.
- **False negative.** `api:anthropic` exhausted, CLI `claude` healthy → the api arm was never probed, so the router could select an exhausted arm — the exact #4351 case the stage exists to prevent.

`runCapacityStage` now calls a new arm-granular `CapacityFilterStage.filterArms`, bypassing the slot-collapsing `RoutingContext` that the scoring stages legitimately use. Enforcement policy and the metric counters stay inside the stage so both paths share one rule; an unmeasured arm is still never excluded, since absence of a reading is not a reading.

Not reachable under the default `plan` billing mode, where no api arm is registered — reachable under `NEXUS_BILLING_MODE=api`.

The stale `KNOWN LIMITATION` block documenting this defect is removed rather than left to contradict the code.
