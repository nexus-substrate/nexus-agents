---
'nexus-agents': major
---

Remove the deprecated strategy-distiller promotion channel in 10.0 ([#5467](https://github.com/nexus-substrate/nexus-agents/issues/5467)). `StrategyDistiller.promote()` and its internal `ruleToPerformance` conversion are removed, along with `DistillerConfig.promotionConfidence` and its default. `RuleStatus` no longer includes `'promoted'`, and `DistillerStats.ruleCountByStatus` no longer carries a `promoted` count.

There is no replacement promotion API or confidence setting. `DistilledRuleStage` remains the canonical channel for applying active distilled rules to routing scores. Remove calls to `promote()` and the `promotionConfidence` option:

```diff
-const distiller = new StrategyDistiller(store, logger, { promotionConfidence: 0.7 });
-distiller.promote(routingMemory);
+const distiller = new StrategyDistiller(store, logger);
+distiller.distill();
```

Existing persisted stores still load without throwing or dropping rules. The persisted schema retains `'promoted'` as a read-only legacy alias; both `PersistentStrategyDistiller` and `loadPersistedRules()` map it to `'active'` on load. These rules can participate in routing and expire normally. Subsequent snapshot writes use the current statuses and never emit `'promoted'`.
