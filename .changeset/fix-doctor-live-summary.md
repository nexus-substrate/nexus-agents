---
'nexus-agents': patch
---

Fix `doctor --live` summaries to use the live probe results: served completions verify adapters, failed probes name their error class, and runs with no adapters explicitly report that nothing was probed. The summary appears after the live results and agrees with the exit status; plain `doctor` behavior is unchanged.
