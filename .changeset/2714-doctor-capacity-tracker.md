---
'nexus-agents': patch
---

Fix doctor's fictional "Capacity: 100% remaining" + 4-warning-per-run spam ([#2714](https://github.com/williamzujkowski/nexus-agents/issues/2714)).

`BaseCliAdapter.getCapacity()` warned and returned a hardcoded 100k-token fallback when `capacityTracker` was null. `doctor.ts:337` calls `adapter.getCapacity()` without first running `adapter.initialize()` (which is what assigns the tracker), so every `doctor` invocation logged 4 `Capacity tracker uninitialized` WARNs (one per CLI) AND surfaced a fictional `Capacity: 100% remaining` line in human-readable output — making the gauge look like real data when it was a constant.

`getCapacity()` now lazy-inits the tracker on first read. The pre-existing test that pinned `remainingRequests: 100_000` was checking the fallback value, not anything real — updated to assert the canonical claude defaults from `capacity-tracker.ts` (`100_000` tokens, `50` requests per minute).
