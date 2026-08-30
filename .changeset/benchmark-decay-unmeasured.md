---
'nexus-agents': patch
---

fix(testing): memory-benchmark no longer reports 100% decay consistency for a failed measurement (#5260)

`measureDecayConsistency` returned `{ consistencyScore: 1.0, itemsChecked: 0 }`
when the backend search **failed** — on the line directly below a log reading
`'Cannot measure decay consistency - search failed'`. `itemsChecked: 0` was the
honest disclosure and was discarded at the result boundary, so
`Decay consistency: 100.0%` reached the CLI and the CSV.

A benchmark reporting 100% on backend failure is worse than one that crashes: a
broken memory backend produced output identical to a perfectly consistent one,
and the rows were indistinguishable in a time series.

Two changes, and the second is the sharper one:

- `decayConsistencyScore` is now `number | null`, `null` meaning UNMEASURED —
  a failed search or an empty store, never zero. `decayItemsChecked` is carried
  onto the result so the denominator travels with the score, and the renderer
  prints `unmeasured (no items checked)`.
- **An unmeasured value no longer clears a threshold.** `checkThreshold` fed
  that fabricated `1.0` into `minDecayConsistencyScore`, so a configured
  minimum *passed on a broken backend* — a gate that could not fail for the
  reason it exists. It now reports the failure and names it, matching the #4585
  fix in the same function.

Internal only: `MemoryBenchmarkResult` is not on the published API surface.
