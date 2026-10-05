---
'nexus-agents': major
---

Remove the reserved `DistilledRule.tainted` field from the public type, generated rules, and persisted rule schema. Stop reading or supplying it; use `status` for lifecycle filtering and `category` for task matching. The flag never represented an enforced security check.

Older snapshots remain readable: their extra field is discarded. Downgrading after saving with this release can make an older version reject the rules cache; `PersistentStrategyDistiller` rebuilds it from `OutcomeStore` on the next distillation cycle.
