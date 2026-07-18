---
'nexus-agents': patch
---

harden(resilience): make `classifyExpertFailure` fail closed on a throwing error
getter. `RecoverableExpert.execute()` classifies failures inside `withRetry`'s
`isRetryable` predicate and in `annotateExhausted`; neither call site is
try-guarded by `withRetry` (its `try` wraps only the operation), so an Error-like
object with a throwing `.message`/`.cause` getter made the classifier throw and
REJECT the `Promise<Result<…>>`, breaking the never-throws contract
`execute_expert` relies on. The classifier now wraps its body in a single
try/catch and returns `permanent` on any classifier fault, and the per-retry
guidance-injection (also outside `withRetry`'s guarded region) is guarded too so
`execute()` always resolves to a `Result` (#4303).
