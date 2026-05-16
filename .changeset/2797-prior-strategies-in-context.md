---
'nexus-agents': minor
---

**Closes #2797. Phase 5 of #2792 (cross-cutting memory access).**

Populates `UnifiedContext.priorStrategies` by reading the persisted distilled-rules snapshot. The learning loop now closes end-to-end: outcomes → `StrategyDistiller` → `rules.json` → `ContextRetriever.priorStrategies` → every entry point that consults the unified context.

### What was already done

Phase 5 turned out to be much smaller than estimated. The infrastructure was already in place from earlier work:

- ✅ `PersistentStrategyDistiller` writes rules to `~/.nexus-agents/learning/rules.json` (atomic write + Zod-validated hydration)
- ✅ `DistilledRuleStage` consumes rules in `CompositeRouter` at priority 45 (penalize -5 / boost +5 / avoid -10 score adjustments)
- ✅ `StrategyDistiller.getRules('active')` reader exists

What was missing: nothing read the rules outside of the live `CompositeRouter` instance, so `UnifiedContext.priorStrategies` was hardcoded `[]`.

### What this PR adds

- **`loadPersistedRules(filePath?): readonly DistilledRule[]`** — process-wide reader for `~/.nexus-agents/learning/rules.json`. No singleton required; consumers in any scope can see the same rules the router applies. Tolerates missing file / corrupt JSON / schema mismatch (returns `[]`, never throws).
- **`ContextRetriever.getContextForTask` populates `priorStrategies`** by loading persisted rules and filtering to (a) `status === 'active'`, (b) `tainted === false` (security gate), (c) category matches the task's category or a global rule.
- 5 new tests on `loadPersistedRules` + 5 new tests on `priorStrategies` in `ContextRetriever`.

### Deferred to follow-ups

The Phase 5 issue also called for surfacing distilled rules in `weather_report` (observability). That's nice-to-have and not strictly necessary for closing the learning loop — filed implicitly via the issue's open checkboxes if needed.

Phase 6 (#2798) audits per-instance backends for promotion paths into the shared substrate.
