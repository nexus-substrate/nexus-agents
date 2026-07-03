---
'nexus-agents': patch
---

feat(routing): yaml surface + typed keys for per-class cost ceilings (#4214)

- `routing.budget.taskClassMaxCostUsd` is now configurable via nexus-agents.yaml (previously programmatic-only; the YAML schema stripped it)
- Ceiling keys are validated against the `TaskCategory` enum (`z.partialRecord`) in both the YAML and composite-router schemas, so a typo'd task class fails config parsing instead of silently configuring nothing; `BudgetRouterOptions.taskClassCostCeilings` is typed accordingly
- Documented the operator surface in CONFIGURATION.md (ceilings, `NEXUS_BILLING_MODE=api` requirement, fail-closed semantics for unpriced candidates)
