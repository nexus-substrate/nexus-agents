---
'nexus-agents': minor
---

feat(security): clawguard llm deriver + trust-gate + fallback + smoke tests (#1977 near-complete)

Completes most of the vote-approved conditions for the ClawGuard
(access-constraint-deriver) module (#1977). Builds on #1993 (skeleton)
and #1997 (denylist + cache).

**What lands:**

- **LLM deriver** (`llm-deriver.ts`) — uses injected `IModelAdapter`
  to derive a TaskAccessPolicy from the user objective. Structured
  induction prompt per design doc. Zod validation on the LLM's JSON
  output. `Promise.race` timeout bounds the call. Returns a
  `LlmDerivationResult` discriminated-union so callers can distinguish
  success from each failure mode (llm-error / llm-timeout / llm-parse-
  error / llm-exception / llm-empty-response). Condition 1 ✓
- **Regex fallback** (`fallback-regex.ts`) — deterministic keyword-based
  deriver used when the trust gate rejects the LLM path, when the LLM
  fails, or when no adapter is provided. Three keyword groups (read-
  only / read-write / refuse) produce a conservative policy. Ambiguous
  tasks default to read-only. Condition 1 fallback ✓
- **Trust-tier gate** (`trust-gate.ts`) — Tier 1/2 objectives may go to
  the LLM; Tier 3/4 (untrusted/hostile) and missing tiers route
  directly to the regex fallback, never exposing the LLM deriver to
  prompt-injection content. Condition 4 ✓
- **deriveWithTelemetry** — returns policy + latency + source +
  trust-decision + fallback-reason. Enables post-wiring <500ms p95
  validation (condition 6).
- **Backwards-compat `deriveAccessPolicy(str)` signature preserved** —
  existing callers continue to work; new options are optional.

**Smoke test suite** (`smoke.test.ts`, 11 tests):

End-to-end integration with a mocked IModelAdapter exercising:

- Happy path: Tier 1 + successful LLM → LLM-derived policy
- LLM error / timeout / parse garbage → regex fallback
- Tier 3 input never invokes the adapter (spy verified)
- Cache hit on repeat → adapter called once across two derivations
- **Denylist wins over LLM-granted paths** — even when a compromised
  LLM says to allow `~/.ssh/**`, the enforcer denies with
  `matchedRule: 'unbypassable:path'`
- **Denylist wins over LLM-granted tools** — force-push denial holds
  under any policy
- Off-mode short-circuits to bypass without calling LLM
- Telemetry shape validated (latencyMs non-negative, cache-hit signaled)

**Runtime impact: still none** — dispatch is not wired to the
enforcer. That wiring is the final follow-up.

**Condition scorecard:**

- [x] 1. UnifiedAdapterRegistry-compatible LLM call with regex fallback
- [x] 2. Types + Zod validation (earlier)
- [x] 3. Unbypassable denylist (earlier)
- [x] 4. Trust-tier gating on objective input
- [x] 5. Policy cache (earlier) + LLM timeout
- [x] 7. Deterministic tests (86 tests total across the module)
- [ ] 6. Empirical <500ms p95 validation — post-wiring, needs production traffic

**Test summary:**

- 86 unit + smoke tests across 7 files (was 51)
- full `src/security/`: 1698/1698 pass
- typecheck clean
- TypeDoc regenerated
