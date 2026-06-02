---
'nexus-agents': minor
---

feat(observability): scheduled improvement_review producer (#3229)

Adds an opt-in server-side scheduler that periodically runs `improvement_review`
so its `signal.fitness_declined` fires automatically, closing the
observability→action gap (a human previously had to invoke the tool by hand).
Mirrors the swarm-health-signals lifecycle (idempotent start + paired shutdown,
unref'd timer, errors swallowed, concurrency-guarded). **Disabled by default**
(`NEXUS_IMPROVEMENT_REVIEW_INTERVAL_MS=0`); a conservative 6h is suggested when
opting in. Auto-filing GitHub issues stays a SEPARATE opt-in
(`NEXUS_IMPROVEMENT_REVIEW_FILE_ISSUES`, default false) so the timer never spams
issues. Analysis-only by default.
