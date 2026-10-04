---
'nexus-agents': patch
---

`nexus-agents routing-audit` and `nexus-agents learning-metrics` now show a bandit reconstructed with the router's own warm start, not a cold one. It replays the last 30 days of recorded outcomes (excluding `e2e-eval`), seeds the same specialization priors and applies the same cold-start fallback. The output is labelled with the reconstruction time, the number of outcomes replayed and how many of those are real (empirical) rather than synthetic. It also says the state is a reconstruction, not the running router's in-memory state. An empty outcome store is reported as "no empirical outcomes replayed".

Both commands stay read-only: the fallback's synthetic warm-up outcomes are replayed in memory and never written to the outcome store. `learning-metrics` reports its learning status as `unmeasured` for a reconstructed bandit, because replayed outcomes are not routing decisions and their spread says nothing about exploration. Router behaviour is unchanged.
