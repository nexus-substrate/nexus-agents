---
'nexus-agents': minor
---

arm the resilient adapter's circuit breaker at construction

`ResilientAdapter.recordBreakerFailure` returned early unless a
`CircuitBreakerRegistry` had been attached, and **no production caller attached
one** — both construction sites in `UnifiedAdapterRegistry` built the adapter
and stopped. So the failover listener could never fire and a CLI whose circuit
had opened kept being handed out.

The reason it was never wired is worth recording: `attachCircuitBreakerRegistry`
existed on the class but not on `IResilientAdapter`, which is what
`createResilientAdapter` returns — so neither site could reach it without a cast.

The registry is now supplied through `ResilientAdapterConfig` and armed during
construction, so arming is part of building the adapter rather than a step
someone must remember. Both sites pass the SHARED registry that already gates
voter-panel availability (#4330), so one adapter cannot keep routing to a CLI
another has seen fail. `IResilientAdapter` gains a read-only
`getCircuitBreakerRegistry()` so a caller can verify the adapter is armed;
`attach` is deliberately not exposed there.

Fixes #4659.
