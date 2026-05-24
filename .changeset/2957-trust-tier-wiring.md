---
'nexus-agents': minor
---

**feat(security):** wire `RequestContext.trustTier` end-to-end into V2 pipelines and access-policy derivation. Closes #2957, #2993, #2994.

Three coupled security gaps converged on one missing wire — the caller's trust tier never reached the gates that needed it. This PR plumbs the value through:

### Producers

- `pipeline/v2-orchestrate.ts:orchestrateInputToTaskContract` and `pipeline/v2-delegate.ts:delegateInputToTaskContract` both gained an `opts.trustTier?: string` parameter that, when provided, writes `metadata.trustTier` onto the constructed `TaskContract`. Pre-fix, neither producer wrote this field, so the V2 policy engine's only built-in rule (`trust-tier`) could not gate anything — it silently allowed every execute stage regardless of caller (#2994).

### Callers

- `mcp/tools/orchestrate.ts`: `createOrchestrateHandler` now threads `ctx.requestContext.trustTier` through `runOrchestratePipeline` → `executeOrchestrationWithDeadline` → `executeOrchestration` → `deriveOrchestratePolicy` and into `instrumentV2Orchestrate` → `orchestrateInputToTaskContract`.
- `mcp/tools/delegate-to-model.ts`: similar — `createDelegateHandler` passes `ctx.requestContext.trustTier` into `instrumentV2Pipeline` → `delegateInputToTaskContract`.
- `mcp/tools/execute-expert.ts`: runs through MCP's native task handler (not the `ContextAwareHandler` chain), so `RequestContext` is not directly available there. `deriveExpertAccessPolicy` now takes the trustTier as an explicit param; the call site currently passes `undefined`, which defaults to `'4'` (untrusted) — defensive default until proper end-to-end wiring lands as a follow-up.

### Gates

- `mcp/tools/orchestrate.ts:deriveOrchestratePolicy` and `mcp/tools/execute-expert.ts:deriveExpertAccessPolicy`: the hardcoded `trustTier: '1'` (#2993) is replaced with the threaded value, defaulting to `'4'` when missing. Pre-fix, every untrusted caller's input was treated as fully trusted by the LLM derivation, which would consistently produce a permissive policy regardless of actual caller risk.
- `pipeline/policy-engine.ts:trustTierRule`: missing or non-numeric `pipelineState.trustTier` now defaults to `4` (untrusted) instead of the prior fail-open `undefined → allow`. With producer wiring in place, the only paths that hit the default are buggy producers or test fixtures — both should fail closed.

### Tests

- `pipeline/policy-engine.test.ts`: updated the two "allows when trustTier is missing/invalid" tests to assert blocks-execute behavior; added "still allows non-execute stages" to confirm the default doesn't break planning paths.
- 137 tests pass across the 6 affected test files (policy-engine, v2-orchestrate, v2-delegate, orchestrate, execute-expert, delegate-to-model). `tsc + eslint` clean.

### Migration / behavior change

- Operators running V2 pipelines (`NEXUS_V2_ORCHESTRATE=true`, `NEXUS_V2_DELEGATE=true`, etc.) previously had no policy enforcement at all (the bug). Post-fix: legitimate callers via `orchestrate` and `delegate_to_model` get their real trust tier and pass through; programmatic callers that bypass `secure-handler` (or test fixtures that don't populate `pipelineState.trustTier`) now block at execute stages. This is the correct new behavior — the rule is finally doing its job.
- The hardcoded `trustTier: '1'` removal means LLM-derived access policies may now be more restrictive for the same input under tier `'4'`. This is a real behavioral change but matches the documented intent of the trust-classification system.

### Follow-ups

- Properly thread `RequestContext` (or equivalent caller info) into `execute-expert`'s background task handler path so its `trustTier` isn't always defaulted to `'4'`.
- Audit producers other than orchestrate/delegate (none in current production code paths, but defensive coverage).
