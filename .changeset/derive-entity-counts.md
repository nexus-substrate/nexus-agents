---
'nexus-agents': patch
---

chore(test): derive governance-entity counts from canonical sources

Removes hardcoded count literals from the test suite for built-in experts (12), evaluation tasks (15), and failure categories, deriving them from their canonical sources (`BuiltInExpertTypeSchema.options.length`, `EVALUATION_TASKS.length`, `OutcomeFailureCategorySchema.options.length`) so adding/removing one no longer requires bumping a number across multiple files. The canonical lists' own count assertions are replaced with structural invariants (non-empty, unique ids); consumer/registry assertions cross-check against the canonical length. Also couples the supply-chain `FULL_PANEL` to the voter-role count and fixes a stale "10 built-in experts" comment. Tier A of the evergreen DRY epic (#3568).
