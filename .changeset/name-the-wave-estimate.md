---
'nexus-agents': patch
---

docs(agents): say that WaveScheduler's token budget enforces an estimate

`WaveScheduler.maxTotalTokens` aborts the wave loop when a running total exceeds
the configured budget. That total is `Math.ceil(outputChars / 4)` summed per
task, which:

- **omits input entirely** — prompt and context usually dominate an agent task's
  spend, so a large prompt with a terse answer looks nearly free; and
- **records a failed task as `0`**, however long it ran before throwing.

Both errors run in the same direction: the budget believes it has more headroom
than it does. Nothing in this repo is affected — `maxTotalTokens` defaults to `0`
and no in-tree caller sets it — but `WaveScheduler` is public API, so a consumer
who enables the documented budget gets a cap with no signal that the figure is
approximate.

No behaviour change. The estimate stays, because `WaveTaskExecutor` returns a
bare string and real usage never reaches the scheduler. What changes is that it
no longer implies precision: the field and config docs state what is excluded,
and the caller-visible abort reason now reads "Estimated token budget exhausted
… (estimate excludes input and failed tasks)".

Replacing the estimate needs a wider executor contract — a public-type change
tracked in #4761, alongside #4754 and #4743 as the same "measurement does not
reach its consumer" thread.
