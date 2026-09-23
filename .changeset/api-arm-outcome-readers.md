---
'nexus-agents': minor
---

Outcome rows recorded under an API arm (`api:anthropic`, `api:openai`, `api:google`, `api:custom-openai`) count again in the weather report and `doctor --deep` (#6574). Since 8.89 a routed API run records its arm instead of its CLI slot, and these readers only looked at CLI slots, so those runs counted toward nothing.

- Adaptive bonuses (`getAdaptiveBonus`, which `delegate_to_model` uses, and `adaptiveBonuses`) and `recommendedMappings` add each API arm's rows to its CLI slot. For example, `api:anthropic` rows count toward `claude`.
- `learningInsights`, the adaptation-speed metric and `doctor --deep` data sufficiency keep each API arm separate from its slot, the same way routing accuracy already does. `cliWeather` lists an API arm once it has rows. `doctor --deep` lists arms with no rows as unmeasured and no longer prints them as "0 tasks".
- `computeAdaptiveThresholds` now accepts any routing arm id (`RoutingArmId`), not just a CLI name. This widens the accepted input, so existing callers still work.
