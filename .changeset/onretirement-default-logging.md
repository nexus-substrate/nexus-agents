---
'nexus-agents': patch
---

fix(adapters): default a logging onRetirement callback when missing-model fallback is enabled (#3144 P0)

The model-not-found fallback's `onRetirement` callback was declared but never wired in production, so model retirements were silent. `UnifiedAdapterRegistry` now defaults `onRetirement` to a `logger.warn` when `enableMissingModelFallback` is on (callers can still override it), making retirements observable. Extracted as the exported, testable `withDefaultOnRetirement` helper.
