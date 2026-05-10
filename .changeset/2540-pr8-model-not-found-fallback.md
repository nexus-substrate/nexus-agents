---
'nexus-agents': minor
---

`withModelNotFoundFallback` — runtime retire-and-retry primitive (#2540 PR 8 of 8, completes the epic).

When a vendor retires a model id (Codex moving to GPT-5.4 while older 5.x releases 404, Anthropic bumping minor versions, etc.), the next request returns 404 / `model_not_found` / "this model is deprecated." This PR closes that gap end-to-end:

- **Distinct error code**: `ErrorCode.MODEL_NOT_FOUND`. `BaseAdapter` now classifies HTTP 404 + the standard vendor messages ("model not found", "no such model", "model is deprecated", etc.) under this code, separate from transient `MODEL_UNAVAILABLE` (502/503).
- **Wrapper utility**: `withModelNotFoundFallback(adapter, { cache, registry?, adapterFactory?, onRetirement? })`. On a `MODEL_NOT_FOUND`, the wrapper refreshes the `AvailableModelsCache` (PR 6), uses `ModelRegistry` (PR 1) to find the closest same-vendor/same-family alternative from what's now routable, and:
  - With an `adapterFactory`: builds a fallback adapter and retries the call once. Returns the second error verbatim if the retry fails.
  - Without a factory: surfaces the original error enriched with the suggested fallback id, so the caller can re-route.
- **Single retry by design** — looping risks wedging when a whole family is retired. Caller escalates after one attempt.
- **Streams left as passthrough** — streaming retries need partial-result reconciliation that belongs in a follow-up.

Closes the wiring loop opened by epic #2540: PR 1 unified the registry, PR 2 migrated AgenticAdapter, PR 5 added `listModels()` across direct-API and CLI adapters, PR 6 stitched those probes into a stale-while-revalidate cache, PR 7 gated `CompositeRouter`'s candidate set on the cache, and PR 8 closes the loop at the call site — when an inflight request hits a retired id, the system observes the retirement, picks a fallback, and keeps moving.
