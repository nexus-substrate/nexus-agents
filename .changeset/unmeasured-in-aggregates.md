---
'nexus-agents': minor
---

fix(agents): aggregate token totals no longer absorb unmeasured contributors

`AggregationMetadata.totalTokensUsed` summed `metadata.tokensUsed` across every
contributor. Since #4744 a contributor whose adapter reported no usage carries a
placeholder `0` with `tokensMeasured: false`, so those zeros were added in
silently and the total read as a complete figure when it was a lower bound.

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
