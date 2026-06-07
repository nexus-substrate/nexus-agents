---
'nexus-agents': patch
---

orchestration: make graph-start context retrieval observable (#3180)

When `getContextForTask` fails during graph-start context population, the
executor no longer swallows it at debug. It now logs a `warn`, emits an
aggregatable `context_unavailable` graph event (sanitized message only — no
stack/paths/secrets), and continues with empty context (best-effort contract
preserved). `executionId` is threaded into `getContextForTask` for correlation,
and the inferred task category is surfaced. Scope is the graph boundary only;
the other `getContextForTask` call sites are tracked in #3699.
