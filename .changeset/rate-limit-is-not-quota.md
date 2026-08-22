---
'nexus-agents': minor
---

Distinguish a local rate window from provider-asserted quota exhaustion ([#4456](https://github.com/nexus-substrate/nexus-agents/issues/4456)).

`CapacityStatus.exhausted` was documented as "Whether capacity is exhausted" but computed `remainingTokens === 0 || remainingRequests === 0` over a rolling **60 second** window, against per-CLI constants the source itself calls conservative estimates. So it meant "this process made 50 claude calls in the last minute", and it self-cleared within the minute.

It could not detect the incident that motivated #4351 — a weekly plan quota burned gradually, or burned by a different process — while an ordinary 7-voter panel or subagent fan-out tripped it with plenty of quota left. That is why #4373's enforcement stage shipped switched off: enforcing on this signal would empty the candidate pool for a condition that clears in under a minute.

`CapacityStatus` now carries:

- **`rateLimited`** — the existing computation, named for what it measures. A throttling hint; never grounds for exclusion.
- **`quotaExhausted`** — set only from provider-asserted evidence: a `RATE_LIMITED` error whose `retry-after` exceeds the local window, which is the provider itself saying the wait is longer than a per-minute throttle. Never inferred from local counting. `false` means "no provider has asserted exhaustion to this process" — **not** a measurement that quota remains.
- **`quotaResetAt`** — the provider's stated horizon, when it gave one. A quota assertion with no horizon is not recorded at all, because inventing one would manufacture a measurement.
- **`exhausted`** — deprecated alias of `rateLimited`, unchanged in value. The type-aware `@typescript-eslint/no-deprecated` rule blocks new readers; scheduled for removal in the next major.

`assessCapacity` now grades the two apart: `quotaExhausted` yields `exhausted` (excludable), `rateLimited` yields a new `throttled` grade that never excludes. An unobserved reading is still `unmeasured` and still excludes nothing (#4374).

Shape chosen by a 7-voter `higher_order` panel. The panel preferred an outright breaking rename (5 of 6 approvers), but a breaking change to an exported type requires unanimous under this repo's governance and 5/6 does not clear it — so this lands the same vocabulary behind a non-breaking alias.

**Note for implementors:** `rateLimited` and `quotaExhausted` are required, so anyone _implementing_ `ICliAdapter.getCapacity()` outside this repo must add them. Consumers that only _read_ a `CapacityStatus` are unaffected.
