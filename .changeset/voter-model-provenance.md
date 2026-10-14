---
'nexus-agents': patch
---

Persist distinct resolved and assigned voter model identities beside the configured/requested `model` and raw adapter-reported `servedModel`. Qualified reports and primary assignments now survive in the authentic vote ledger without truncation; absent reports retain an explicit request fallback rather than claiming a transport measurement. Malformed optional identities are warned and omitted without losing the vote. Historical hashes, commitment versions, and the governor's configured-family credit ceiling remain unchanged.
