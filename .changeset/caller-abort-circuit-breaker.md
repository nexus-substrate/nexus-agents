---
'nexus-agents': patch
---

Differentiate caller abort from timeout before recording on CLI circuit breaker (#6691).

- Add `CANCELLED` error code to `CliErrorCode` for caller-cancelled CLI operations.
- Update `withWatchdog` to abort its controller with a typed `TimeoutError` on timeout and forward `outerSignal.reason`.
- Update `SubprocessCliAdapter` to classify signal aborts with `createAbortCliError`, distinguishing timeouts (`TIMEOUT`) from caller cancellations (`CANCELLED`).
- Exempt `CANCELLED` errors and caller-input errors from circuit-breaker failure counts in `executeCliRetryLoop` and `CliCircuitBreakerIntegration`, releasing the half-open probe if in half-open state.
- Preserve `AbortError` name on `ModelError` across the `CliToModelAdapter` bridge and skip circuit breaker failure recording in `ResilientAdapter`.
