---
'nexus-agents': patch
---

**Closes #2821.** fix(adapters/opencode): error events surface as failure, not success

OpenCode NDJSON `{"type":"error",...}` events (e.g. `ProviderModelNotFoundError`) were folded into the response's `content` string as `[OpenCode error: <msg>]` and returned via `ok()` from the subprocess-adapter. Consensus voters and the routing learner consumed the error marker as the model's reasoning text — polluting votes and adaptive-routing memory.

The parser now captures error-event messages in a new `errorMessage` field on `OpenCodeCliResponse` (separate from `content`). When a stream produces no text but does carry an error event, `content` stays empty so `extractResponse()` returns null and the subprocess-adapter classifies the call as `EXECUTION_ERROR` — same handling as any other failed CLI call. The error message is preserved in `errorMessage` and the existing `logger.warn('OpenCode returned error event')` log for observability.

Mixed streams (text arrives, then an error) keep the text in `content` and surface the error in `errorMessage` so callers see both.

Six new regression tests cover error-only streams, error-after-text streams, the explicit `extractResponse → null` contract, and the previously-passing-but-wrong test cases that codified the bug.
