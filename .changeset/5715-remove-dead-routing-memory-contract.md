---
'nexus-agents': major
---

Remove the unimplemented asynchronous routing-memory contract in 10.0 ([#5715](https://github.com/nexus-substrate/nexus-agents/issues/5715)). The `IRoutingMemory` exported through the CLI adapters entry now refers to the live synchronous interface in `context/routing-memory.ts`, implemented by `RoutingMemory`. The async, `Promise<Result<...>>`-returning contract ratified in #238 was never implemented by shipped code.

Remove `RoutingMemoryError`, `RoutingMemoryErrorCode`, `TaskProfileSummary`, `RoutingDecisionRecord`, `TaskOutcomeRecord`, `PreferenceSignal`, `PreferenceRecord`, `PreferenceFilter`, `ExperienceStep`, `ExperienceRecord`, `ActionRecord`, and `RoutingMemoryExport`. These declarations have no live replacements. Remove their imports and migrate any custom implementations of the old contract to the live interface. Its `storePreference` accepts a model, task type, and performance metrics and returns `void`; reads return values directly. The old `storeExperience`, `getExperiences`, `storeAction`, `getActions`, `export`, and `import` methods are absent from the live contract.

`RoutingMemoryStats` from the CLI adapters entry now also refers to the live statistics: `totalPreferences`, `totalExperiences`, `cacheHits`, `cacheMisses`, and `recommendationsMade`. The old record-count, timestamp, and storage-size fields are removed.

```diff
 import type { IRoutingMemory } from 'nexus-agents';
-await memory.storePreference(decision, outcome, preference);
-const result = await memory.getPreferences({ taskType: 'code' }, 100);
-if (result.ok) consume(result.value);
+memory.storePreference('claude', 'code', {
+  avgQuality: 0.9,
+  successRate: 1,
+  avgLatencyMs: 1000,
+  avgTokens: 500,
+  observations: 1,
+});
+consume(memory.getPreferences('code'));
```
