---
'nexus-agents': patch
---

AI SDK adapter: responses that are not answers now return an error instead of a successful empty reply (#6618, mirroring #6607).

- A `content-filter` finish, on `completeText()`, `completeStructured()`, or a stream, returns a `MODEL_ERROR` with `context.reason: 'content_filter'`. Partial text cut off by the filter is not returned as an answer.
- An empty text reply with finish `length` (or `null`/`undefined` object in structured completion) returns a `MODEL_ERROR` with `context.reason: 'reasoning_truncated'`, representing a completion budget exhausted before output. Non-empty truncated replies continue to return normally with stopReason `max_tokens`.
- `StreamTextResult` duck-typed interface exposes optional `finishReason?: Promise<string> | string | undefined` to validate stream completion finish reasons before completing the stream generator.
- `toErrorResult` preserves `ModelError` instances thrown during completion rather than re-wrapping them as generic SDK errors.
