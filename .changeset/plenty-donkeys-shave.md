---
'nexus-agents': minor
---

Remove `WorkBalancer` and `CompositeRouter.getCapacityDashboard()` (#4378, 7/0 consensus vote).

`WorkBalancer` had zero production consumers and was never wired into the routing chain. Beyond being unused, it carried its own weighted capability scoring alongside its task queue, duplicating the concern `SharedTaskAnalyzer` and `TopsisRouter` own canonically — so wiring it in would have introduced a second scoring-and-dispatch path into `CompositeRouter` rather than avoiding duplication.

`getCapacityDashboard()` and its helper `fetchCapacityData` are removed with it: a read-only surface whose only references were two test mocks.

Not a breaking change for package consumers — neither symbol was reachable from the public entrypoint (`dist/index.d.ts` contained no reference to either), only from the internal `context/` barrel.

Capacity-aware routing is not lost. #4373 reimplements capacity exclusion as a predicate inside the existing stage chain, which is the shape the router actually needs; the deleted component's capacity-semantics tests are preserved there as its seed specification. Adapter capacity remains available via `ICliAdapter.getCapacity()`.
