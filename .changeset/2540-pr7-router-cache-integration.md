---
'nexus-agents': minor
---

`CompositeRouter` consumes `AvailableModelsCache` (#2540 PR 7 of 8).

`CompositeRouterConfigWithPreference` gains an optional `availableModelsCache` field. When set, the router gates its candidate-CLI list on the cache before running the routing pipeline:

- A CLI is excluded only when the cache has been queried at least once and reports zero models for it.
- An empty cache union (cold start, all sources failing) falls back to all registered CLIs — the gate never wedges routing on a transient cache miss.
- Cache errors do not block routing — they are logged and the router falls through to all registered CLIs.

`getAvailableModelsCache()` exposes the wired cache (or undefined) for downstream consumers (the runtime model-not-found fallback in PR 8 will use this).

OutcomeStore wiring deferred to follow-on (#2540 makes the registry available for OutcomeStore key normalization, but the actual wiring touches more than this PR's scope).
