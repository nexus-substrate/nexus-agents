---
'nexus-agents': patch
---

`nexus-agents verify`: the Configuration check now reports a failure (warn severity, with a fix hint) when the config loader throws, instead of passing silently — config breakage surfaces in the diagnostic. Warn severity keeps the exit code at 0 (diagnostic-only, not a gate). Also pins previously shape-only test assertions: DEFAULT_RUBRICS criterion configs/weights and the readiness-criterion detail wording (#4181).
