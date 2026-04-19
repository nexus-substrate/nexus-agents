---
'nexus-agents': minor
---

feat(security): wire ClawGuard access-policy enforcer into MCP middleware chain (#1977)

Activates the access-constraint-deriver runtime guard so every tool
call in the standard MCP middleware chain now passes through the
ClawGuard enforcer.

- Adds `createAccessPolicyChainMiddleware(toolName)` that bridges the
  existing ALS-backed guard (`mcp-guard.ts`) to the strongly-typed
  `Middleware` contract consumed by `buildMiddlewareStack`.
- Adds `accessPolicy?: boolean` to `MiddlewareSkipConfig` for explicit
  opt-out.
- The new middleware is **always mounted** but behaves as a no-op
  pass-through unless an orchestrator has wrapped the call with
  `withAccessPolicy(...)` — so runtime behavior is unchanged for
  callers that haven't set up a per-task policy.

Closes the #1977 "activation" gap: the deriver + enforcer + smoke
tests were already landed, but no production code path ran them.
This is the final wiring that makes the research-backed runtime
defense actually effective, with a 7-test integration suite
covering allow/deny/audit/off paths and the hardcoded unbypassable
tool + path denylists.

Also widens the return type of `denyToToolResult` from readonly
arrays to the `{isError; content: Array<…>}` shape that matches the
middleware chain's `ToolResult` contract.
