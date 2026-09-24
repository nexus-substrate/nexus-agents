---
'nexus-agents': patch
---

A CLI failure reached through the resilient adapter (every adapter from `getGlobalRegistry()`) is now recorded once on the CLI's circuit breaker instead of twice. The CLI adapter's retry loop already recorded it with a category from the CLI error code, and the resilient adapter recorded it again on the same breaker, usually as `unknown`. A CLI's breaker therefore opened after about half the configured `failureThreshold` of consecutive failures; it now opens at the threshold. Direct-API adapters, which have no inner recorder, are still recorded by the resilient adapter as before.
