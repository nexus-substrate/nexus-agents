---
'nexus-agents': patch
---

**fix(adapters):** `ResilientAdapter.stream()` errors instead of silently yielding empty when no adapter is available (#3105).

`stream()` did a bare `return` when adapter detection produced nothing, emitting a clean empty stream — while the sibling `complete()` returns `err(ModelError('No model adapter available'))` for the same condition. The `streamWithFallback` consumer only falls back on a thrown error, so a silent-empty stream masked "no adapter available" as a legitimately-empty completion. `stream()` now throws `ModelError` to match `complete()`'s contract. (`countTokens()` returning `0` is left as-is: no error channel, and a 0 estimate is benign.)

Found via a proactive security/QA audit.
