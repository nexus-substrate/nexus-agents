---
'nexus-agents': patch
---

Register 6 former debt environment variables in `NexusEnvSchema` and burn down `docs/ops/env-schema-coverage-baseline.json` debt list to zero (#6457). Adds Zod validation and known registration for `NEXUS_BUDGET_TOLERANCE`, `NEXUS_CONSOLE`, `NEXUS_CONTEXT_WARN_THRESHOLD`, `NEXUS_CUSTOM_API_ALLOW_PRIVATE`, `NEXUS_PORTABLE_MODE`, and `NEXUS_TASK_STATE_ENABLED`.
