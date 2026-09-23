---
'nexus-agents': minor
---

The strategy distiller now runs from the persisted outcome store, and it trains only on outcomes that measure real CLI work.

Before this release, distillation fired only after 50 outcomes inside one process. Short-lived CLI processes never reach 50, so on a typical install `rules.json` was never written and `DistilledRuleStage` had no rules to apply.

- **Trigger.** The first time the distilled-rule stage runs in a process, it distills if the outcome store holds at least `triggerThreshold` (default 50) eligible outcomes newer than the last `rules.json` snapshot. With no snapshot, every eligible outcome counts. The per-process counter still fires for long-running servers. The distiller constructor does not read the store; the check happens on first route.
- **Training population.** Distillation now uses only `source: 'delegate'` outcomes whose `cli` is one of `claude`, `gemini`, `codex` or `opencode` and whose CLI is not a category default. Consensus voter seats, `manual` records (warm-up pings, e2e-eval runs, tool bookkeeping), `cli: 'unknown'` and `api:*` arm ids are excluded. The new `StrategyDistiller.checkPersistedTrigger()` exposes the first-route check.
- **Empty case.** With no snapshot and zero eligible outcomes, the distiller writes a snapshot with 0 rules and a timestamp, so the state reads as "distilled, nothing eligible" and not "never ran".
- **Reporting.** `rules.json` gains an optional `eligibleOutcomes` count, and `DistillerStats` gains an optional `eligibleOutcomesAtLastDistill` field. `nexus-agents doctor` now prints `Distilled rules: N (eligible outcomes: E, last distill: <time|never>)`. The line is informational and does not count as a failure. The old `Distilled rules: N active` line counted every persisted rule, not only active ones, and it has been replaced.
