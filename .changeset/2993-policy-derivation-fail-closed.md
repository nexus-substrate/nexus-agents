---
'nexus-agents': minor
---

**fix(security):** access-policy derivation failures now fail closed under active enforcement. Partial fix for #2993.

Pre-fix: in both `mcp/tools/orchestrate.ts` (`deriveOrchestratePolicy`) and `mcp/tools/execute-expert.ts` (`deriveExpertAccessPolicy`), the `catch (error)` branch fell back to a wildcard policy with `mode: 'off'`. Any exception in LLM derivation — a transient API failure, a Zod schema drift, an adapter bug — converted to a security bypass. Even operators running `NEXUS_ACCESS_POLICY_MODE=enforce` ended up with `allowedTools: '*'` and `allowedOperations: '*'` enforcement disabled, contradicting their explicit configuration.

Fix: the fallback now preserves the operator's configured mode in the returned policy and restricts to empty allow-lists (`allowedTools: []`, `allowedOperations: []`, `allowedPathPatterns: []`) when the mode is `confirm_risky` or `enforce`. For `off` and `audit` modes the permissive fallback is preserved (operators in those modes have either opted out entirely or accepted log-only semantics, both of which would be surprised by a sudden block). The warn log now includes `failClosed: boolean` so the operator can correlate.

68 tests pass across the two changed files. `tsc + eslint` clean.

**Still open** (the multi-file half of #2993): the hardcoded `trustTier: '1'` in the same two functions. Threading `requestContext.trustTier` from `secure-handler` through both tools' deps needs careful audit of the entire call graph — deferred to a follow-up so this fail-closed half ships immediately.
