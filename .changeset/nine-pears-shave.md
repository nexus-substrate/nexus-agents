---
'nexus-agents': patch
---

fix(cli-adapters): classify codex-mcp quota errors, and honor provider retry-after (#4373)

Two gaps found while auditing error surfaces for #4351 criterion 3.

**codex-mcp never classified a quota error.** Every other CLI adapter extends
`SubprocessCliAdapter` and inherits a pipeline that checks `isRateLimitText`.
`CodexMcpAdapter` extends `BaseCliAdapter` and classified on its own:
`determineErrorCode` matched only ENOENT / timeout / connection, and
`parseToolResult` hardcoded `EXECUTION_ERROR` for any `isError: true` result
without reading the message at all. That matters beyond naming — the voter
serving-gate (#4330) excludes a CLI whose circuit has opened, and the breaker
counts `RATE_LIMITED` where `EXECUTION_ERROR` is generic, so a quota-dead
codex-mcp never looked like a serving failure. Both paths now reuse the shared
pattern set rather than growing a second taxonomy, with the terminal readings
(missing binary, timeout) still taking precedence — a rate-limit reading would
route the caller into a retry that can never succeed.

**A provider-stated retry window was parsed and thrown away.**
`parseRetryAfterMs` has existed with regexes for "retry after Xs" / "try again in
Xs" and was called from nowhere under `cli-adapters/`; `CliError` had no field to
carry it. So when a provider named its window, the retry loop ignored it in favour
of its own exponential backoff. `CliError.retryAfterMs` now carries the value on
retryable errors, and `resolveRetryDelayMs` prefers it — still clamped to the
caller's ceiling, so a CLI claiming a multi-hour window cannot wedge the loop, and
a zero or negative hint is ignored rather than retried instantly.
