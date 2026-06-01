---
'nexus-agents': patch
---

refactor(pipeline): adopt shared CircularBuffer in the pipeline EventBus (#3288)

The pipeline EventBus stored history in a plain array with O(n) `Array.shift()`
eviction, reinventing the O(1) `CircularBuffer` that already existed (and whose
own doc cited "EventBus history" as its purpose). Relocates `CircularBuffer` from
`agents/collaboration/` to `core/` (its natural shared home; the collaboration
barrel keeps a back-compat re-export) and adopts it in the pipeline EventBus.
Behavior-preserving: same oldest-first eviction and query order.
