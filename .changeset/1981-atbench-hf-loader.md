---
'nexus-agents': minor
---

feat(benchmarks): atbench huggingface dataset loader (#1981 follow-up)

Adds the HuggingFace Datasets API loader for the ATBench adapter
(#1981). Mirrors the swe-bench `dataset-loader.ts` pattern: native
fetch, no auth needed for public datasets, paginated up to 100 rows
per request, 30s timeout.

**Behavior change:** `ATBenchAdapter.loadInstances()` now falls back
to HuggingFace when no `fixturePath` is provided. Existing fixture-
based tests still work unchanged. Production callers can omit
`fixturePath` and get the live dataset:

```ts
const adapter = new ATBenchAdapter('claw');
const instances = await adapter.loadInstances({
  variant: 'claw',
  maxInstances: 50, // optional cap for smoke runs
});
```

**Tests** (12 new, ATBench module total now 27):

- fetchPage: 2xx happy path, URL encoding, 4xx errors, missing-rows[],
  network-failure
- fetchAtbenchFromHf: single-page success, pagination short-return
  termination, drop-invalid-rows count, all-rows-invalid error,
  empty-upstream OK, codex variant URL, network-failure surface
- adapter: HF fallback when no fixturePath (verifies error path)

Resilience: invalid rows are DROPPED with a count rather than failing
the whole load, so upstream HF schema drift produces a partial result

- telemetry rather than a crash.

Validation: 218/218 benchmark tests pass, typecheck clean, TypeDoc
regenerated.
