---
'nexus-agents': patch
---

Export `UnifiedAdapterRegistry` (+ `createUnifiedRegistry`, `getGlobalRegistry`, `resetGlobalRegistry`, and the `UnifiedRegistryConfig`/`TaskRoutingEntry`/`RegistrySnapshot` types) from the public package barrel (#3184, #3268). CLAUDE.md's Canonical Paths names `UnifiedAdapterRegistry` (via `getGlobalRegistry()`) as the canonical way to access adapters, but it was only exported from the internal `adapters/index.ts` — not reachable by package consumers. It's now part of the public API, so operators can build custom routing on the documented primitive without reaching into internals.
