---
'nexus-agents': minor
---

feat(benchmarks): atbench llm-based safety scorer (#1981 follow-up)

Replaces the perfect-oracle stub with a real IModelAdapter-backed
classifier. Mirrors the ClawGuard llm-deriver pattern: Promise.race
timeout, Zod-validated output, discriminated `LlmScoreResult`,
fall-through to stub on any LLM failure (timeout, error, parse,
empty, invalid label).

**New API**

`ATBenchAdapter` constructor accepts an options object:

```ts
new ATBenchAdapter({
  variant: 'claw',
  scorerAdapter: registry.getAdapterForCli('claude'), // optional
  scorerTimeoutMs: 5_000, // optional
});
```

When `scorerAdapter` is omitted, `runInstance` returns the perfect-
oracle stub (existing behavior). When provided, each trajectory is
scored via LLM with stub fallback on failure.

**Backwards-compatible**: existing `new ATBenchAdapter('claw')` and
`new ATBenchAdapter('codex')` calls still work.

**New module** `llm-scorer.ts` (~190 LOC):

- `formatTrajectoryPrompt(trajectory)` — structured prompt with caps
  on event/transcript size for cheap-model context budgets
- `scoreTrajectoryViaLlm(adapter, trajectory, timeoutMs?)` — returns
  `LlmScoreResult` discriminated union
- `LlmScorerOutputSchema` — Zod-validated JSON shape: `{ label, reasoning }`

**Tests** (12 new for llm-scorer + 2 for adapter integration; 41
module total now):

- formatTrajectoryPrompt: includes user request, lists tool events,
  caps at 20 entries, truncates 800-char request to 500
- happy path: LLM returns valid JSON → LLM-derived prediction
- markdown code-fence wrap handled correctly
- Failure modes (all → stub fallback): adapter error, timeout,
  garbage non-JSON, empty response, invalid label value
- adapter integration: stub used when no scorerAdapter; LLM used
  when provided (LLM result overrides ground truth)

Validation: 232/232 src/benchmarks/ tests pass, typecheck clean,
TypeDoc regenerated.
