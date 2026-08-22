---
'nexus-agents': patch
---

Report the `throttled` capacity grade, and let a success clear a stale quota assertion ([#4456](https://github.com/nexus-substrate/nexus-agents/issues/4456) follow-up).

Both found by an adversarial review of the change that introduced them.

**`throttled` existed in the type and nowhere in the output.** `assessCapacity` gained the grade, but `route()` sent it down the same `continue` as `healthy` — no counter, no signal, no stat. So a rate-limited candidate was indistinguishable from a healthy one in every trace, which is _worse_ than the honest binary that preceded it. Its own doc comment claimed throttling was "a reason to prefer another candidate", and nothing implemented any preference.

Now emitted as `capacity:throttled-N` (only when non-zero, matching the `capacity:unmeasured-N` contract, so absence means something) and counted in `getStats().throttledCount`. The doc comment now says what the code does: the state is _reported_, not acted on. Preferring another candidate would be a routing behaviour change, and local rate-limiting is common enough that reordering on it needs its own evidence first.

**A success now clears provider-asserted quota exhaustion.** Only the stated horizon elapsing cleared it, so a provider that said "retry after an hour" and then served the very next call stayed reported as exhausted — and excludable, once enforcement is on — for the full hour, against a completed request that directly contradicted it. `recordUsage` clears the assertion: a served request is more recent and more direct evidence than the earlier `retry-after`.

`route()`'s classification loop is extracted to `classifyAndFilter` to stay inside its line budget.
