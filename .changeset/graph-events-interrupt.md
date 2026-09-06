---
'nexus-agents': minor
---

A graph run that paused for human input is no longer published as a completed
one. `emitNodeResults` branched on `failed` vs everything-else while
`NodeResult.status` is four-way, so an `interrupted` node — which produced
nothing — reached the hash-chained audit trail as "completed in 0ms", and a
`skipped` result's `error` string was dropped because the completion event has
no slot for it. A `node_not_completed` event now names the reason. Separately,
`execution_complete` was emitted before the halt check, because
`runSuperStepLoop` returns `undefined` on the interrupt path exactly as it does
when the graph runs out of nodes; it now carries `halted`, which the `onEvent`
consumers render as "HALTED awaiting input — NOT complete".
