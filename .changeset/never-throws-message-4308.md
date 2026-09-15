---
'nexus-agents': patch
---

`getErrorMessage` no longer throws when the value's `message` getter throws — it returns the fallback (`'Unknown error'` by default) instead. `RetryExhaustedError`'s constructor and `isRetryableError` now read the message through it, so `withRetry` resolves to `err(RetryExhaustedError)` for such an error instead of rejecting from outside its own try/catch (#4308). One visible side effect: `RetryExhaustedError.context.lastErrorMessage` for a non-Error object is now its JSON (`{"status":404}`) rather than `[object Object]`.
