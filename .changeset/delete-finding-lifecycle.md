---
'nexus-agents': patch
---

chore(security): delete the unwired finding-lifecycle tracker (#5239)

`security/finding-lifecycle.ts` described itself as a bridge from security
findings to the outcome store. **Nothing ever reached the outcome store.** Its
`PersistFn` was the module's only route there, and its sole production caller
passed `(e) => lifecycleEntries.push(e)` — a scan-local array discarded on
return. The header had never described real behaviour.

#5242 removed that last caller, leaving zero production consumers. Not on the
public API surface, so this is internal cleanup: no surface diff, and the
deletion loses no data and no behaviour because there was never any.

A seven-voter panel chose deletion over wiring it (6/6 of approvers; the lone
dissenter also argued for removal). Wiring `PersistFn` to the outcome store
would have produced writes with no reader — a producer feeding a sink no loop
evaluates — which fails capability-bias's requirement of a named consumer.

The capability is tracked at #5249 with its unblock trigger recorded, along
with the two conditions the panel attached: build the sink before the producer,
and extend `OutcomeStore` rather than forking it.
