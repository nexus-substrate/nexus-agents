---
'nexus-agents': patch
---

perf(routing): cache the per-CLI quality-reward scan (#3261)

`computeQualityReward` ran an O(N) `OutcomeStore.query({cli})` scan on every
`executeTask`; with persistence default-on the store grows, so this was a
per-task hot-path cost. The per-CLI success rate is now cached with a short TTL
(15s) — a smoothed historical signal tolerates that staleness. Adds
`resetQualityRewardCache()` for tests. (Verify-first note: persistence itself was
already enabled by default — `NEXUS_PERSIST_LEARNING` — so #3261's "no
persistence" premise was stale; the real cost was the uncached scan.)
