---
'nexus-agents': minor
---

feat(orchestration): topological wave assignment for agent plans (#2034)

Adds a DAG-based wave assignment utility to aorchestra. Agent plans
can now declare `dependsOn: string[]` edges; `topologicalWaveAssign`
returns the plan with each entry's wave set to
`max(wave of deps) + 1`, so independent work parallelizes while
dependent work sequences.

- New module `orchestration/aorchestra/topological-wave.ts` with:
  - `topologicalWaveAssign<T extends WaveEntry>(entries)` →
    `Result<entries, CycleError | MissingDependencyError>`
  - `groupByTopologicalWave<T extends WaveEntry>(entries)` →
    `T[][]` grouped by wave, sorted ascending
  - Named distinct from the existing `groupByWave` in
    `worker-dispatcher.ts` to avoid export collision.
- 13 tests cover: empty input, no-deps passthrough, linear chain,
  diamond, disconnected components, direct cycle, self-loop,
  missing dependency, input immutability, and wave grouping.
- NOT yet integrated with the live worker-dispatcher pipeline —
  that's an explicit follow-up so this first PR stays reviewable.

Child of #1574 (SWE-bench Verified prep) via #2030 breakdown.
