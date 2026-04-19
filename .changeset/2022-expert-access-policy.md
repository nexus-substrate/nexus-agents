---
'nexus-agents': minor
---

feat(security): extend ClawGuard opt-in to execute_expert (#2022 follow-up)

Mirrors the orchestrate-tool activation from #2024 for the
`execute_expert` MCP tool. Every expert invocation now derives an
access policy from the task description and wraps `expert.execute(task)`
in `withAccessPolicy(policy, ...)` so the mounted middleware (#2021)
can enforce it.

Behavior matrix is identical to orchestrate:

- `NEXUS_ACCESS_POLICY_MODE` unset / `off` → bypass policy →
  middleware short-circuit → zero observable change.
- `audit` → regex-fallback policy (ExecuteExpertDeps has no
  `modelAdapter`, so LLM derivation path isn't available); violations
  logged, execution proceeds.
- `enforce` → violations deny with `isError` ToolResult.

Derivation failures never throw — fall through to permissive bypass.
