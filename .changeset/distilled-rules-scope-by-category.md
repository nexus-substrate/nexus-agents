---
'nexus-agents': minor
---

scope distilled routing rules to the category they were learned for

Increment 3 of #4866. Distilled rules are grouped and fingerprinted by
`(cli, category)` — a rule means "penalize claude ON code_generation" — but the
category filter never narrowed, so every CLI-matching rule applied to every
task. Rules learned for `code_generation` were being applied to `documentation`.

`DistilledRuleStage.extractCategory` read two signals. `task-category:` had no
producer anywhere. `capability:type=` was assumed to be a typo for the existing
`capability:task-` producer — it is not. That producer emits `reasoning | code |
creative | general`, which shares **no values** with the `TASK_CATEGORIES` a rule
carries. Renaming it would have matched no rule ever and taken the whole
distillation loop dark while looking like a fix.

The parser is deleted rather than corrected. The category now arrives as a typed
argument from `detectTaskCategory` — the producer that speaks the right
vocabulary, already used by `BudgetRouter` — validated at the boundary with
`TaskCategorySchema`, so an off-vocabulary value is `unknown` rather than a
category that silently matches nothing.

When no category is detected, rules still apply unscoped as before, but the
context now carries `distilled-rule:category-unknown` so an unscoped
application is not mistaken for a scoped one.

Removes the `task-category:` and `capability:type=` entries from the
`signal-contract` ratchet's `KNOWN_BROKEN` map.

Fixes #4832.
