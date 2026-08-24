---
'nexus-agents': minor
---

fix(agents): carry measurement provenance onto trinity phases and expert observations

Since #4744 a step whose adapter reported no usage carries `tokensUsed: 0` with
`tokensMeasured: false`. Consumers that copied only the number turned a
"nothing was reported" into an indistinguishable "the model spent zero".

`TrinityPhaseResult` and `ExpertContextObservation` now carry `tokensMeasured`
alongside `tokensUsed`, and `trinity-coordinator` threads it through all three
phases.

An earlier draft of this note claimed a FAILED phase records `false`. It did not:
each phase returns `err` before pushing to history, so a failed phase never
becomes a `TrinityPhaseResult` and that branch was unreachable. The failure IS
observable through `protocol.trinity.phase_completed`, which fires either way —
so the flag is carried on that event instead, which is where the failed phase's
`0` was actually visible.

`createPhaseResult` takes a single `usage: { tokensUsed, tokensMeasured? }`.
Passing a count and its provenance as separate positional arguments is what let
them drift apart.

Additive and optional throughout: absent means the producer predates the
distinction, which is unknown rather than measured. The #4749 surface gate
confirms exactly one public change —
`TrinityPhaseResult > readonly tokensMeasured?: boolean | undefined`.

This corrects a stale claim on #4743 that these consumers were blocked because
`TrinityPhaseResult` is public. That applied to _widening_ `tokensUsed`, not to
adding an optional sibling.

`sica-agent`, `puppeteer-helpers` and `aegean-protocol` still read `tokensUsed`
alone; they are unblocked, just separate decisions.
