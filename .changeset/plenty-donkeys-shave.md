---
'nexus-agents': major
---

**BREAKING:** Remove `CompositeRouter.getCapacityDashboard()` from the public API, and remove the internal `WorkBalancer` (#4378, 7/0 consensus vote).

`getCapacityDashboard()` is removed from both the publicly-exported `ICompositeRouter` interface and its implementing `CompositeRouter` class. External code that calls this method, or that implements `ICompositeRouter`, will break. There is no drop-in replacement: adapter capacity is available directly via `ICliAdapter.getCapacity()`, and #4373 reintroduces capacity as a routing _exclusion predicate_ inside the stage chain rather than as a read-only dashboard.

The method had no in-tree production consumers — its only references were two test mocks — which is why it was removed rather than kept for compatibility.

`WorkBalancer` (and its types, `createWorkBalancer`, `capacityStatusToInfo`, `BalancingError`, `IWorkBalancer`, `BalancerOptions`, `BalanceResult`) was **not** part of the public API — it was reachable only through the internal `context/` barrel, never through `exports/context.ts`. Its removal is not breaking for package consumers. It had zero production consumers and carried its own weighted capability scoring, duplicating the concern `SharedTaskAnalyzer` and `TopsisRouter` own canonically; wiring it in would have created a second scoring path inside the canonical router.
