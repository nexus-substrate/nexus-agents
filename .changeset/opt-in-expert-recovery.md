---
'nexus-agents': minor
---

feat(resilience): opt-in expert execution recovery policy (#4286)

Wire the `FailureDetector`/`RecoveryManager` resilience module into the expert
factory as an opt-in, transient-vs-permanent execution recovery policy.

- New `ExpertRecoveryPolicy` on `CreateExpertOptions`. When present, `createExpert`
  returns a `RecoverableExpert` whose `execute()` wraps the base run in the shared
  `withRetry`/`isRetryableError` primitives (no new retry loop) with a
  classification predicate: caller-abort → permanent, transport 429/408/5xx/network
  → transient, behavioral archetype (arxiv:2512.07497) → per-strategy action,
  otherwise fail closed. Archetype retries inject recovery guidance into the next
  attempt's prompt.
- Default (no policy) is bit-for-bit the previous behavior — a plain `Expert`.
- Experts created via `create_expert` (and executed via `execute_expert`) now get a
  conservative `{ maxRetries: 1 }` inner recovery layer; the existing rate-limit CLI
  fallback (#1532) remains the outer layer.
- New exports: `RecoverableExpert`, `classifyExpertFailure`, `ExpertRecoveryPolicy`,
  `FailureClassification`.
