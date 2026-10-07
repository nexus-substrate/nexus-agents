---
'nexus-agents': patch
---

`run` outcome telemetry now credits the strategy, not the gate. Under `NEXUS_CONSENSUS_ENFORCE=enforce`, a consensus panel that returns a `rejected` verdict still makes `run` return a business error, but the dispatch outcome now records `success: true` with a new optional `gateRefusal` field, and the MetaOrchestrator shadow-train observer (`NEXUS_META_SHADOW_TRAIN`) learns from that positive label. Before this change the run was recorded as a strategy failure, which taught the selector that `consensus` fails whenever the gate does its job. A panel that produces no verdict (`no_quorum`, all voters failed, or an approval that is not outage-invariant) is still recorded as a failure. `audit` and `off` telemetry is unchanged. `MetaOutcomeRecord` and the `MetaResultClassifier` return type gain the optional `gateRefusal` field.
