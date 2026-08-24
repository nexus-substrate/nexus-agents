---
'nexus-agents': minor
---

fix(agents): carry measurement provenance onto trinity phases and expert observations

Since #4744 a step whose adapter reported no usage carries `tokensUsed: 0` with
`tokensMeasured: false`. Consumers that copied only the number turned a
"nothing was reported" into an indistinguishable "the model spent zero".

`TrinityPhaseResult` and `ExpertContextObservation` now carry `tokensMeasured`
alongside `tokensUsed`, and `trinity-coordinator` threads it through all three
phases — a phase whose agent call FAILED records `false` rather than an
unqualified `0`, because a failed call produced no measurement at all.

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
