---
'nexus-agents': patch
---

fix(routing): log INFO when the model-availability cache falls back to all CLIs (#3188)

`CompositeRouter`'s availability gate had two silent fallback-to-all paths (empty
cache union; fully-filtered-out set) — so an operator relying on
`AvailableModelsCache` couldn't tell when the gate had degraded to a no-op (only
the cache-error path logged). Both now log at INFO with the candidate count.
Behavior-preserving (routing still never wedges); the events are just observable.
