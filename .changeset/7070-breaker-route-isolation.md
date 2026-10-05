---
'nexus-agents': patch
---

Keep OpenCode's default route available when a custom provider fails, and exclude failing custom routes per model from voter dispatch and available-model listings. Gateway-served slot failures no longer open the plain CLI breaker or affect other slots. Transient rate limits do not trip slot breakers; durable quota exhaustion still counts as a failure.
