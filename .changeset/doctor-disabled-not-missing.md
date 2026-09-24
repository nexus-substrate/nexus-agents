---
'nexus-agents': patch
---

`nexus-agents doctor` no longer reports a CLI disabled by `NEXUS_DISABLED_CLIS` as "not installed". In the model advisory, a disabled CLI's models now read `<cli> CLI is disabled by NEXUS_DISABLED_CLIS`. When a healthy gateway is configured, the line also says whether the gateway serves that CLI's slot (`; the gateway serves its slot with <model>`) or has no model for its family. The `MCP Client mode` line now reads `Disabled (codex disabled by NEXUS_DISABLED_CLIS)` with the neutral circle glyph instead of `Not ready (Codex not installed)` with a failure cross. The doctor verdict and exit code do not change, because MCP client readiness and the model advisory were never verdict terms.
