---
'nexus-agents': patch
---

fix(adapters): retry transient MODEL_UNAVAILABLE + drop empty stream deltas (#3317 #7/#8)

Two small api-mode parity findings from the #3317 audit:

- **#7** `isRetryableError` now treats `MODEL_UNAVAILABLE` (transient 503/overloaded)
  as retryable, matching HTTP 503. `MODEL_NOT_FOUND` stays non-retryable (retry
  won't help).
- **#8** the SDK streaming adapter skips empty-string (`''`) `text_delta` chunks —
  the AI SDK can emit zero-length keepalive/boundary chunks that are noise for
  downstream re-assemblers.
