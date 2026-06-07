---
'nexus-agents': patch
---

fix(mcp): correct ci_health_check annotation — not read-only/idempotent

`ci_health_check` appends a CI-health telemetry event on every call (`appendCiHealthEvent`), so its MCP annotation claiming `readOnlyHint: true` + `idempotentHint: true` was inaccurate (#3530). Sets both to false and documents the per-call telemetry append in `sideEffects`. Because the tool is now non-read-only, the `check:tool-prerequisites` gate requires it to be classified — added to `NO_PREREQUISITE` (it has no world-state precondition). No behavior change; the annotation now matches reality.
