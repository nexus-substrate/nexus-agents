---
'nexus-agents': patch
---

**fix(cli-adapters):** collapse nested retry layers for subprocess CLIs. Part of #2824 (audit P1).

Subprocess CLI adapters had two independent retry layers on the same call path: the inner `retryTransient` in `SubprocessCliAdapter` (1 initial + 2 transient retries) and the shared outer `executeCliRetryLoop` (`maxRetries: 1` → 2 attempts). On a persistent transient error (TIMEOUT / RATE_LIMITED / CONNECTION_ERROR) they multiplied — outer × inner = up to **6 subprocess spawns**, and because the inner layer extends the timeout by 1.5× on every TIMEOUT retry, a stuck call could hang ~9–10 minutes before finally failing.

New `BaseCliAdapter.shouldOuterRetry()` hook decides whether the outer loop may retry. `SubprocessCliAdapter` overrides it to return `false` whenever its own `transientRetry` layer is enabled (the default), making the inner layer the single retry authority. The outer loop still runs once, so circuit-breaker failure recording is unchanged. Applies to the claude/codex/opencode adapters (via `BaseCliAdapter`) and the gemini adapter (via its circuit-breaker-coupled `executeWithRetryTracking`). Non-subprocess adapters are unaffected.
