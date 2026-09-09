---
'nexus-agents': patch
---

weather_report: distinguish an unmeasured routing metric from a perfect one

`weeklyRegret` and `adaptationSpeed` are both lower-is-better, so the value they took when nothing was measured — `0` — rendered as the _best possible_ score. `nexus-agents health` printed `Adaptation Speed: 0 tasks` for a workspace whose learning loop had produced zero confident thresholds.

`observedCategories` was also the regret denominator, so a category that cleared `ROUTING_MIN_SAMPLES` but could not be analysed still counted, inflating the denominator and systematically understating regret. That is reachable rather than theoretical: `OutcomeCliSchema` admits `api:anthropic`, `api:openai`, `api:google`, `api:custom-openai` and `unknown`, none of which appear in weather-report's local `CLI_NAMES`, so a workspace routing through API arms hits it on every category.

Adds `analyzedCategories` (the real regret denominator) and `adaptationSpeedCategories`, both required. The CLI prints `unmeasured` instead of a number when the corresponding count is zero, and shows `Observed Categories: N (M analysed)` so the gap is visible. A _measured_ zero still prints as `0.000` — the point is not to hide zeros.

The higher-is-better metrics are deliberately unchanged: their unmeasured `0` reads as unhealthy, which is the safe direction.
