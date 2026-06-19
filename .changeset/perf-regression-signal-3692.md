---
'nexus-agents': minor
---

feat(observability): deterministic perf-regression improvement signal (#3692, #3246)

Extend the existing `improvement_review` `SignalCategory` enum with a new
`perf-regression` value (no new parallel feedback pathway). A new deterministic
detector maps a benchmark measurement (p95 latency / throughput) against a
STATIC, pinned baseline + a fixed tolerance (default 0.2 = 20% worse than
baseline) to an optional `perf-regression` `ImprovementSignal`. The baseline is
configured/injected, never auto-derived from a rolling window — keeping this out
of the deferred #3230 adaptive-control scope. A missing baseline emits nothing
(conservative). The signal is SURFACED-ONLY: it is appended to the review's
signal list exactly like the existing tech-debt / tool-fitness signals and never
auto-applies a fitness/governance penalty or mutates any score/state.
