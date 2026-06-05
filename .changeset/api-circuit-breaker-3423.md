---
'nexus-agents': minor
---

fix(resilience): record API ModelError failures to the circuit breaker (#3423, epic #3317)

Direct-API adapters (`ResilientAdapter`) previously recorded only rate-limit
events — an API `ModelError` never opened a circuit breaker or triggered
failover, so a degrading API endpoint had no degradation/failover learning (the
CLI subprocess path already did). `ResilientAdapter.complete()` now maps a
`ModelError` to a `FailureCategory` (`mapModelErrorToCategory`) and records it to
the current adapter's breaker, reusing the existing open→failover wiring.

Rate limits are skipped here (checked via BOTH the mapped category and
`isRateLimitLikeError`, whose pattern lists differ) so they aren't double-counted
against the telemetry branch. The recorded payload is a `FailureCategory` enum
and the log carries only `{provider, category}` — no credentials, message, or
request ever reach the breaker, logs, or events.
