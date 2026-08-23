---
'nexus-agents': patch
---

fix(routing): let the API/SDK arms report a provider-asserted quota signal

`ModelToCliAdapter` — the bridge every direct-API and SDK arm is wrapped by —
answered `getCapacity()` from hardcoded literals, including
`quotaExhausted: false`. `assessCapacity` reaches `'exhausted'` only through
`quotaExhausted`, so no API arm could ever be excluded for quota no matter
what the provider said. A check that cannot fail is not a check.

The two literals were not equally wrong. `observed: false` was honest —
nothing had been observed. `quotaExhausted: false` asserted a measurement
that never happened.

`toCliError` supplied the other half of the defect: it classified
`RATE_LIMITED` but never called `parseRetryAfterMs`, unlike the subprocess
path's `createError`. The provider's stated horizon is the only input
`CapacityTracker.recordProviderQuotaExhaustion` accepts, so it was discarded
before anything could record it.

The receiving machinery already worked; the API arms simply never fed it.
This wires them onto it rather than building a second capacity system:

- `toCliError` parses `retryAfterMs` off a retryable error, mirroring
  `base-adapter.ts`. Not parsed on a non-retryable one — a wait hint inside a
  500 body is not a rate-limit assertion.
- The bridge holds a per-instance canonical `CapacityTracker`, records usage
  on success and a quota signal on `RATE_LIMITED`, and reports `getCapacity()`
  from it. One arm's exhaustion never speaks for another's.
- `CapacityTracker.recordProviderQuotaExhaustion` now marks the tracker
  observed when it records. Without that, `assessCapacity` short-circuits to
  `unmeasured` and the strongest evidence available about an arm — the
  provider stating its quota is gone — would be stored and then ignored on any
  adapter whose first call rate-limits. A rejected assertion observed nothing
  and still does not set the flag.

The empty case stays named: an arm that has neither served a call nor been
given a horizon reports `observed: false` and grades `unmeasured`, never
`healthy`.

Nothing starts being excluded. `CapacityStageConfig.enforceHardLimits` still
defaults `false`, and a test pins both halves — an exhausted arm still routes
under the shipped defaults, and is excluded only once a caller opts in.

Partial by construction, and worth stating: `parseRetryAfterMs` matches the
message text OpenAI-family 429s usually carry ("try again in 20s"), but not
Anthropic's, whose body has no wait hint, nor Gemini's `"retryDelay":"33s"`.
Neither adapter reads the HTTP `retry-after` header — it is discarded at
`transformError`. Those arms therefore record no horizon and correctly report
no quota exhaustion rather than a fabricated one. Capturing the header is
sequenced separately (#4532).
