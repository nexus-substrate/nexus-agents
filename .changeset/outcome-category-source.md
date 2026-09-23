---
'nexus-agents': minor
---

Outcome records now say when their task category was not detected. `TaskOutcome` gains an optional `categorySource` field (`'detected' | 'defaulted'`). When no category keyword matches, the `orchestrate` tool, worker dispatch and `execute_expert` still store `'exploration'` in the required `category` field, but now mark the row `categorySource: 'defaulted'`. Before this change such rows could not be told apart from measured exploration work.

Per-category readers skip defaulted rows: `OutcomeStore` category filters and `summarize().byCategory`, the weather report's per-CLI category breakdown and routing accuracy, `improvement_review`'s cli×category floor, `doctor --deep` category coverage, and distilled-rule training. Whole-population totals still count them.

The `orchestrate` CLI's routed-outcome writer now records runs whose category was not detected, marked `defaulted`, instead of writing no row. The routed population and `doctor`'s routed count therefore include them.

Rows written before this change carry no `categorySource` and are read as before. `TaskCategory` is unchanged.
