---
'nexus-agents': patch
---

Fix auto-route under-routing of consensus/wave goals (#3989). Plain goal strings
like "we need consensus on adopting GraphQL" or "run a multi-agent wave over these
modules" used to fall through to the generic fallback (single-shot / graph),
because the workflow router's consensus/wave rules key on the `requiresConsensus` /
`dependencyStructure` structural signals that a goal string never sets.

The router now gap-fills those signals from the goal text (`deriveStructuralSignals`)
before rule matching, but ONLY for phrases that NAME the orchestration process —
"consensus vote/decision/review/panel" or "multi-perspective review" →
`requiresConsensus`; "multi-agent wave", "wave of agents", "fan out to
agents/subtasks", "independent subtasks" → `dependencyStructure: 'independent'`.

Because a false positive sends a cheap task to an expensive N-voter panel, the
detection is deliberately HIGH-PRECISION: it excludes verb+"consensus" ("reach
consensus on the leader election" — distributed-systems code), bare "vote on"
(voting features), "should we use/adopt" (trivial local decisions), and bare
"in parallel"/"fan out"/"parallelize" (impl/perf). A goal that only IMPLIES a group
decision ("should we adopt GraphQL?") intentionally does NOT auto-route — the
caller uses the `requiresConsensus` hint / `forceStrategy`; false negatives are safe
(today's behavior), a false positive is not. Caller-provided signals stay
authoritative (a field already set — including `false` — is never overridden). A
labeled goal→expected-pattern routing-accuracy eval covers the positive routes AND
the realistic false-positive guards. Greenfield stays force-only by design.
