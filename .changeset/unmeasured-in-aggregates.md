---
'nexus-agents': minor
---

fix(agents): aggregate token totals no longer absorb unmeasured contributors

`AggregationMetadata` reported a token total with no way to say how much of it
was actually measured. Since #4744 a contributor whose adapter reported no usage
carries `tokensUsed: 0` with `tokensMeasured: false`, and the aggregate could not
distinguish that from a contributor that genuinely spent nothing.

To be precise about what changed arithmetically: **nothing**. Every producer that
sets `tokensMeasured: false` pairs it with `0`, so excluding those from the sum is
a no-op today. The filter is there so the sum stays correct if a producer ever
reports a number it cannot vouch for. The real delivery is the new count.

The two aggregation sites (`result-aggregator.ts`, `session-helpers.ts`) now sum
measured contributors only and report `unmeasuredResults` beside the total. The
field is additive and optional — absent means the aggregate predates the
distinction, which is unknown rather than zero.

Confirmed non-breaking by the #4749 surface gate, which reported exactly one
public change: `AggregationMetadata > unmeasuredResults?: number | undefined`.
That is the first time a change here has been checked against the real API
surface rather than a grep.

Part of #4743. The propagating consumers (trinity, execute-expert, sica,
puppeteer, aegean) still read `tokensUsed` alone and are unchanged.
