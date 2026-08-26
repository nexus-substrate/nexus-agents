---
'nexus-agents': minor
---

say on the job record whether a cancel can reach the tool

`cancel_job` writes a `cancelled` record whether or not the tool can act on the
signal. `cancel-job-tool.ts` is explicit that a tool ignoring the signal "still
runs to completion… but its record stays `cancelled`" — and no adopter of
`runAsJob` accepts the signal today, so every cancelled record has claimed more
than was known, with the caveat visible only in source.

The record now carries `signalAccepted`, derived from the run callback's arity.
It is a structural fact, not a behavioural one: `true` means cancellation can
reach the tool, not that the work stopped, and absent means the writer did not
report it rather than `false`. That is the honest limit of what arity proves —
and it makes signal adoption measurable instead of assumed.
