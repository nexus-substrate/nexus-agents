---
'nexus-agents': minor
---

feat(tune): shadow-soak demotion telemetry for the self-tuning loop (#3323)

Adds inspectable per-CLI demotion counters to `TuneAdjustmentStore` — `applied`
(demotions that biased routing in enforce mode) and `intended` (demotions the
loop WOULD have applied while shadow). The new `recordIntended()` increments the
shadow counter WITHOUT touching routing, so an operator can observe what enabling
the loop would do during a soak while `effectiveMultiplier` stays 1.0. Counters
survive decay/eviction (bounded by CLI cardinality; reason capped at 512 chars).
TuneStage records intended demotions in shadow mode; the `health` command now
surfaces a "Self-Tuning Demotions" section (table + JSON). A default-on exit
criterion for #3323.
