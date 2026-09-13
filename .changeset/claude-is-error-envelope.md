---
'nexus-agents': patch
---

The claude adapter now treats a `claude -p --output-format json` envelope with `is_error: true` as an error carrying the CLI's own `result` text and `stop_reason`. Previously the envelope's `api_error_status: 429` matched the whole-output rate-limit scan first, so the error message was the first 500 characters of the JSON envelope, the message that named the cause never surfaced, and the failure was retried twice in place as a transient throttle.

"You're out of usage credits" is now classified as a durable capacity cap for the requested model: it is not retried in place and is `retryable: false`. Inside the claude adapter an out-of-credits envelope triggers one retry with the next claude alias the model registry lists (in-tree order: fable → opus → sonnet → haiku); a substituted answer carries `fallbackFrom: <requested alias>` and `model: <alias used>` on `CliResponse`, and only a second capacity error reaches the per-CLI circuit breaker, as one failure. A non-capacity `is_error` (for example a login error) is returned as before, with no alias retry. Callers that need one specific model can pass `options: { inFamilyFallback: false }` on the task.

`nexus-agents doctor` now probes the pinned claude voter model (the adapter's default alias) with one short request when the CLI is installed and prints `Claude model <alias>: available | out of credits | error`, or `not probed` when the CLI is absent. `runDoctor` accepts an optional `probeClaudeModel` seam, and `DoctorResult` gains a `claudeModel` field.
