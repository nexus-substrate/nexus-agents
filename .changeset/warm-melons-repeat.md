---
'nexus-agents': patch
---

fix(cli-adapters): give the voter serving-gate a failure signal to read (#4330)

The circuit-breaker serving-gate shipped in 2.173.6 (#4325) could never exclude a
quota-dead CLI, because nothing on the voter path fed the registry it reads.

`isCliServingForVoters` excludes a CLI only when
`getCliCircuitBreakerSnapshot(cli)?.state === 'open'`, reading
`defaultCliCircuitBreakerRegistry`. But `BaseCliAdapter.executeWithRetry` passed no
`circuitBreaker` into `executeCliRetryLoop`, making its `recordFailure` call
unreachable for every subprocess CLI (claude, codex, opencode). The snapshot stayed
`undefined` forever and the gate took its fail-open branch on every panel — the
observed symptom being opencode failing `Key limit exceeded` on all 64 panels of a
v6 eval run while remaining in the roster.

`BaseCliAdapter` now resolves its breaker from the shared registry and records both
failures (via the retry loop) and successes. Recording successes is what keeps the
threshold meaning "consecutive failures" — without it a long-lived process would
accumulate scattered blips and eventually evict a healthy CLI. Every circuit state
change is now logged, so a CLI dropping out of a panel roster leaves a trail.

No new gate logic was needed: `resolveDiverseAdapters` already re-resolves
availability once per panel, so with the signal present a CLI that trips during
panel N is excluded from panel N+1 in the same process.
