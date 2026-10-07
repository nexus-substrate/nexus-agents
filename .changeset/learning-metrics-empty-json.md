---
'nexus-agents': patch
---

Fix `learning-metrics` reporting missing routing data as measured zeroes. The text trend now says `unmeasured` without routing outcomes. JSON reports absent summary and per-model measurements as `null`, and an absent trend as `direction: "unmeasured"` with `sampleCount: 0`. Measured values, including real zeroes, are preserved.
