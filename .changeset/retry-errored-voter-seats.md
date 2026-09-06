---
'nexus-agents': minor
---

A voter that errors is now retried once, alone, before the tally. The panel launched once and dropped an errored voter, so under `reduce_denominator` — the default for every strategy but `unanimous` — its seat silently left the denominator, and under `absolute_quorum` the whole vote voided and the caller replayed all N voters for one failure. Only the errored roles are re-launched, after a short backoff, and a recovered vote carries `retried: true`. A panel with no errored voter issues no retry.
