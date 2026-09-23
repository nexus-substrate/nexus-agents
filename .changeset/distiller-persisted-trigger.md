---
'nexus-agents': minor
---

The strategy distiller now runs from the persisted outcome store. It trains only on outcomes that show a CLI actually executed, and it has its own off switch.

Before this release, distillation fired only after 50 outcomes inside one process. Short-lived CLI processes never reach that, so on a typical install `rules.json` was never written and `DistilledRuleStage` had no rules to apply.

- **Trigger.** The first time the distilled-rule stage runs in a process, it first expires any rule past `ruleExpiryMs`, including rules hydrated from `rules.json`. It then distills if the outcome store holds at least `triggerThreshold` (default 50) eligible outcomes newer than the last snapshot. With no snapshot, every eligible outcome counts. The per-process counter still fires for long-running servers. The distiller constructor does not read the store. The new `StrategyDistiller.checkPersistedTrigger()` exposes this check.
- **Training population.** An outcome is eligible only if it has `source: 'delegate'`, `cliSource: 'executed'`, `durationMs > 0`, and a `cli` of `claude`, `gemini`, `codex` or `opencode`. Excluded are consensus voter seats, `manual` records (warm-up pings, e2e-eval runs, tool bookkeeping), `cli: 'unknown'`, `api:*` arm ids, and category-default attributions. Also excluded is any row without an executed marker, which includes legacy orchestrate rows whose CLI and category were defaults. Expect a very small eligible population until writers record a routed-origin tag.
- **Off switch.** `NEXUS_STRATEGY_DISTILLATION=false` (or `0`) disables distillation alone. No distiller is built, and no distilled rule is read or applied. Outcome persistence stays on. The switch defaults on, and it overrides a config that enables `strategyDistillation`.
- **Empty case.** With no snapshot and zero eligible outcomes, the distiller writes a snapshot with 0 rules and a timestamp. The state then reads as "distilled, nothing eligible" rather than "never ran".
- **Unreadable rules file.** If `rules.json` exists but fails to parse or validate, the first-route trigger logs a warning and does not overwrite the file.
- **Reporting.** `rules.json` gains an optional `eligibleOutcomes` count, and `DistillerStats` gains an optional `eligibleOutcomesAtLastDistill` field. `nexus-agents doctor` now prints `Distilled rules: N (A active; trained on E eligible outcomes; last distill: <time|never>)`, plus a separately labelled whole-file eligible count. Both lines are informational. They replace the old `Distilled rules: N active` line, which counted every persisted rule rather than only the active ones.
