---
'nexus-agents': patch
---

fix(routing): distinguish an unreadable scoring input from an empty one (#5329)

Two routing-score stages read the outcome store inside a `try/catch` that
returned the same empty `Map` a healthy-but-empty store returns. The router then
ranked on "no adjustment" when the truth was "no reading", and nothing in the
decision could tell the two apart.

The performance floor is the consequential one. An empty map disables the floor
penalty entirely — `composite-router-helpers.ts` gates on
`performanceData.size > 0` — and makes `applyLinUCBFloorOverride` a no-op. So a
CLI that is chronically below the floor keeps its full quality score and keeps
being selected, on the strength of a measurement that never happened.

Both reads now report whether they happened, and the caller writes
`perf-floor-unmeasured` / `weather-unmeasured` into `stagesExecuted`, which
becomes `RoutingDecision.decisionPath`. Previously that array was byte-identical
either way, so the record could not disclose what the decision was missing.

Two distinctions the fix is careful about:

- **An unknown task category is not a failure.** The read happened and found no
  applicable history, so it reports measured. Over-reporting is the
  mirror-image defect — a decision labelled "no reading" when the reading was
  merely not applicable teaches a reader to ignore the label. There is a test
  for it, and it caught a surviving mutant.
- **The weather swallow was one level down from where #5329 named it.** The
  `catch` in `composite-router-stages.ts` only ever saw `detectTaskCategory`
  throwing; the real store read is inside `getWeatherBonusScores`
  (`weather-bonus-stage.ts`), which had a bare `catch` with no error captured.
  A fix at the line the issue named would have changed nothing.

Logging moved `debug` → `warn` at both sites. #2952 replaced a bare `catch {}`
with a debug log here; the next step is that logging is not recording — the
decision record itself now carries the coverage.

Vocabulary reused from `routing/stages/capacity-stage.ts`, which already
carries `'unmeasured'`, an `unmeasuredCount`, and the comment this change is an
instance of: "absence of a reading is not a reading."
