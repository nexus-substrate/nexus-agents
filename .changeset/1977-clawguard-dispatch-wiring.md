---
'nexus-agents': minor
---

feat(security): clawguard mcp dispatch wiring (#1977 final piece)

Closes the last structural piece of #1977 — the dispatch-path wiring
that plugs the access-constraint-enforcer into the MCP tool dispatch
chain.

**New module** `security/access-constraint-deriver/mcp-guard.ts`:

- `withAccessPolicy(policy, fn)` — runs `fn` with `policy` available
  via AsyncLocalStorage. Orchestrators (orchestrate, execute_expert)
  derive a policy at task start and wrap downstream work.
- `getActivePolicy()` — reads the ALS-stored policy (undefined if no
  wrapping)
- `guardMcpToolCall(tool, args?)` — pure helper returning an
  AccessDecision; uses the active policy if one is in scope, else
  returns `allow`
- `createAccessPolicyMiddleware({ toolName, logger })` — factory for an
  MCP-middleware-compatible function that:
  - No-ops when no policy is active or policy is in `off` mode
  - Logs warnings and forwards in `audit` mode
  - Returns MCP-format `isError` result in `enforce` mode
- `denyToToolResult(decision, requestId)` — formats a deny as the
  SDK's CallToolResult isError shape

**18 new tests** (total module count now 93):

- ALS propagation across async boundaries
- Nested `withAccessPolicy` (inner wins)
- Middleware pass-through (no policy / off mode)
- Middleware log-and-allow (audit)
- Middleware deny → isError result (enforce)
- Denylist wins over bypass policy + audit mode
- Path extraction from typed args for path denylist
- End-to-end smoke: derive → withAccessPolicy → guardMcpToolCall

**Runtime behavior unchanged**: nothing in the orchestrator layer is
yet calling `withAccessPolicy`. The wiring is complete and ready; the
rollout is a separate operator decision gated on:

1. Orchestrator (`orchestrate`, `execute_expert`) opts in by wrapping
   task execution in `withAccessPolicy(await deriveAccessPolicy(...))`
2. MCP middleware chain adds `createAccessPolicyMiddleware(...)` as a
   stage (likely after validation, before rate-limit)
3. `NEXUS_ACCESS_POLICY_MODE` flipped off → audit
4. Empirical <500ms p95 validation across real traffic (condition 6)
5. Flip audit → enforce after clean telemetry

**All 7 vote conditions now satisfied at the module level:**

1. ✅ LLM call via UnifiedAdapterRegistry-compatible IModelAdapter
2. ✅ Zod types + Result-style decisions
3. ✅ Unbypassable denylist (paths + tools)
4. ✅ Trust-tier gating on objective
5. ✅ Policy cache + LLM timeout
6. 🔧 **Wired and ready**; empirical validation is operator-side
7. ✅ Deterministic tests (93 total across 8 files)

**Total file count for this cycle**: 8 source + 8 test files in
`src/security/access-constraint-deriver/`, 93 tests.

Follow-ups that can ship independently:

- orchestrator opt-in to `withAccessPolicy`
- CLI flag / config for enabling the middleware per-deployment
- Audit log schema for `access-policy: audit violation` / denied events
