---
'nexus-agents': patch
---

The weekly parameter-drift gate reports how many registry models joined the provider catalog (`PARAM_DRIFT_JOINED`), lists the ones it could not reconcile, and emits `skipped` instead of `clean` when nothing joined (#5677).
