---
'nexus-agents': patch
---

stop the research recency score saturating at two years

`scoreRecency` used `Math.max(0, 1 - daysSince / 730)`, so every source older
than two years scored exactly `0.0`. A 2024 paper and a 2015 paper were
indistinguishable, and `rankDiscoveredItems` sorts on the composite alone with
no age tie-break — so with relevance and impact equal, `Array.prototype.sort`
order decided which one entered the top-5 slice that `executeReview` files
GitHub issues from, and which side of the `0.8` P1 boundary it landed on. The
saturation was reachable in ordinary use: the review path never passes
`sinceDate`, and Semantic Scholar stamps year-only dates as `${year}-01-01`, so
anything from 2024 or earlier was already floored.

Decay is now exponential with a one-year half-life, which approaches zero
without reaching it. The half-life was picked so the curve still passes through
`0.5` at one year, the point the old linear curve passed through — the `0.6`
review gate and the `0.8` P1 boundary keep the calibration they were tuned
against, and only the saturated tail moves.

Also clamps the top. `Math.max(0, …)` bounded the floor and left the ceiling
open, so a publication date one year in the future scored `1.5` and outranked
anything actually published; year-only stamping makes that a real input, not a
hypothetical.
