---
'nexus-agents': minor
---

feat: flip ClawGuard and structured-task-state to default-on (user-visible)

Two previously opt-in features now default to on — approved for a v2.x
minor release.

## ClawGuard: `off` → `audit` by default

`NEXUS_ACCESS_POLICY_MODE` default flipped from `off` to `audit`. Every
orchestrate / execute_expert call now derives an access policy and
logs `access-policy: audit violation` when tool calls fall outside the
derived allowlist. Nothing is blocked — enforcement still requires
explicit `NEXUS_ACCESS_POLICY_MODE=enforce`.

- Operators wanting the pre-v2.50 behavior: set
  `NEXUS_ACCESS_POLICY_MODE=off`
- Operators wanting blocking: set `NEXUS_ACCESS_POLICY_MODE=enforce`

## Structured task state: disabled → enabled by default

`NEXUS_TASK_STATE_ENABLED` default flipped from "unset disables" to
"unset enables". Orchestrations now write a JSONL log per task under
`~/.nexus-agents/tasks/state-{taskId}.jsonl` capturing stage
transitions, decisions, and blockers. The log is read back via the
`query_task_state` MCP tool.

- Operators wanting the pre-v2.50 behavior: set
  `NEXUS_TASK_STATE_ENABLED=0` (or `false`)

## Why now

- ClawGuard has shipped for multiple releases with 53+ tests and zero
  known regressions. Audit mode gives telemetry without risk.
- Structured task state has been available since #2045. Default-on
  closes the "why did my orchestration fail?" feedback loop — the log
  file survives session restarts.

Updated 16 test cases to match the new defaults; all pass.
