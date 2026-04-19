---
'nexus-agents': minor
---

feat(security): add access-constraint-deriver skeleton (#1977 partial)

Lands the skeleton module for ClawGuard-style per-task tool access
policies (arxiv-2604.11790). Current state is **skeleton only** —
off/audit/enforce modes all return a bypass (allow-all) policy.

**New exports from `nexus-agents/security`:**

- `deriveAccessPolicy(objective): Promise<TaskAccessPolicy>` — returns a bypass policy in all modes today
- `checkAccess(toolName, policy): AccessDecision` — enforcer; passes through under bypass
- `resolveAccessPolicyMode(env?): 'off' | 'audit' | 'enforce'` — reads `NEXUS_ACCESS_POLICY_MODE`
- `TaskAccessPolicy`, `AccessDecision`, `AccessPolicyMode`, `AccessOperation` types + Zod schemas

**Runtime behavior: unchanged.** Default `NEXUS_ACCESS_POLICY_MODE=off` is a no-op. Dispatch path is NOT yet wired to the enforcer; that lands when the full LLM-derivation implementation arrives (follow-up commit).

**Why land the skeleton separately:**

Design was vote-approved in #1977 with 7 mandatory PR conditions. This PR covers conditions that can land without the LLM integration:

- ✅ Types + Zod validation (condition 2)
- ✅ Result-style `AccessDecision` discriminated union (condition 2)
- ✅ Deterministic tests for the skeleton surface (condition 7)
- ⏳ UnifiedAdapterRegistry LLM call (condition 1) — deferred
- ⏳ Hardcoded unbypassable denylist (condition 3) — deferred
- ⏳ Trust-tier gating on objective (condition 4) — deferred
- ⏳ Timeout + cache (condition 5) — deferred
- ⏳ <500ms p95 validation (condition 6) — deferred

17 tests cover mode resolution, objective hashing, skeleton derivation,
and enforcer contract (allow/deny/log-and-allow).

Full security suite passes (1640/1640).
