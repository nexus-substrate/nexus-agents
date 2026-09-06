---
'nexus-agents': patch
---

`RoutingContextStore.getPreferenceStats()` reports `estimatedCostSavingsRate: 0` for an empty store instead of `1.0`, matching the preference-router store's empty case (#5700).
