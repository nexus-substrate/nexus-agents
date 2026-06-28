---
'nexus-agents': minor
---

Add an offline meta-strategy accuracy eval (#4095, epic #4094) — the first,
deterministic increment of the audit→enforce evidence work. It produces the
"learned vs rules" routing-accuracy number that the #3552 learned-selection
enforce flip is blocked on, fully offline (no soak server, no cost-gated live
run), and doubles as a routing-accuracy regression guard with standalone value.

`evaluateMetaStrategy(corpus)` runs the rule MetaOrchestrator and a FRESH (never the
process singleton) LinUCB learned selector over a labeled `goal→ExecutionStrategy`
corpus using a stratified, deterministic train/test split: it trains the learned arm
on synthesized oracle rewards over the train split, then scores both arms on the
held-out test split. Ships with a 40-entry starter corpus (5/strategy, labeled by
each strategy's documented purpose, blind to either arm) and a growth target toward
≥80 for the readiness-gate volume.

Honest first finding: on the starter corpus the learned arm sits near chance
(rules ≈ 0.63, learned ≈ 0.13) — a contextual bandit over 8 strategies is badly
under-trained at this volume, which is itself evidence pointing AWAY from the enforce
flip. The training reward is a proxy for real run outcomes, so the learned number is
directional; `rulesAccuracy` is the load-bearing regression-guard metric.
