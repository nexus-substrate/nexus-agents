---
'nexus-agents': minor
---

feat(security): orchestrator opt-in for ClawGuard policy derivation (#2022)

Completes the last step of the ClawGuard activation chain: the
`orchestrate` MCP tool now derives an access policy at task start
and wraps `orchestrator.execute(...)` in `withAccessPolicy(...)` so
the middleware chain enforcer (#2021) can see it.

Runtime behavior:

- `NEXUS_ACCESS_POLICY_MODE` unset or `off` (default): derives a
  bypass/off policy; the middleware short-circuits to pass-through.
  Zero observable change.
- `NEXUS_ACCESS_POLICY_MODE=audit`: derives a real policy (LLM when
  `deps.modelAdapter` is available, regex fallback otherwise);
  violations are logged but NOT blocked. This is the recommended
  bake mode for telemetry before flipping to enforce.
- `NEXUS_ACCESS_POLICY_MODE=enforce`: same derivation; violations
  deny the tool call with an `isError` result.

Derivation failures (adapter error, timeout, etc.) never throw —
they fall through to a permissive bypass policy so orchestration
cannot be taken down by a policy-derivation bug. All failures are
logged.
