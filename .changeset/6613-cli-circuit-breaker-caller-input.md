---
'nexus-agents': patch
---

CLI circuit breaker: exclude caller-input CLI errors and prevent double-counting (#6613).

- `CliCircuitBreakerIntegration.executeWithBreaker` checks `canExecute()` directly instead of throwing and double-counting failures.
- Standard CLI failures now increment `failureCount` exactly once per failure.
- Caller-input errors (`isCallerInputCliError`) are excluded from breaker success and failure counts, keeping the breaker closed when bad inputs or unsupported model preferences occur.
- Caller-input errors during half-open recovery release the half-open probe request budget via `releaseHalfOpenProbe()`.
