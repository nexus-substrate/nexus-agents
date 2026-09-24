---
'nexus-agents': patch
---

Cancelling a job (`cancel_job`) no longer counts against the CLI's circuit breaker. A CLI call aborted by its caller used to come back as a `TIMEOUT` error and be recorded as a timeout failure, so enough cancels could open the circuit on a healthy CLI and drop it from routing and voter panels. A cancelled call now returns a non-retryable `EXECUTION_ERROR` carrying an `AbortError` cause. The subprocess retry loop, `CliCircuitBreakerIntegration` and `ResilientAdapter` skip it: they do not record it and do not retry it. Real timeouts still count: the adapter's own timeout watchdog, and a caller abort whose reason is a `TimeoutError` such as `AbortSignal.timeout()`.
