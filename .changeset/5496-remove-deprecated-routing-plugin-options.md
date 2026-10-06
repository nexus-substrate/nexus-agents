---
'nexus-agents': major
---

Remove deprecated plugin gate options and the unused workflow quality hint in 10.0 ([#5496](https://github.com/nexus-substrate/nexus-agents/issues/5496)).

- Remove `PluginRegistryOptions.experimentalEnabled` and `experimentalAllow`, deprecated in 8.9.3 ([#5492](https://github.com/nexus-substrate/nexus-agents/pull/5492)). Production registries never set these options and load only core plugins before freezing. The experimental registration gate is removed entirely: direct registration now applies ordinary manifest and configuration validation to experimental plugins too. There is no replacement toggle or allowlist. Use `new PluginRegistry()` and remove both options; the empty `PluginRegistryOptions` type remains exported for compatibility.
- Remove `TaskSignals.qualityRequirement` and the exported `QualityRequirement` type, deprecated in 8.9.1 ([#5482](https://github.com/nexus-substrate/nexus-agents/pull/5482)). No routing rule read this hint, so it never affected routing. Remove the field and type imports; nothing replaces them. Other routing signals continue to work.

```diff
-const registry = new PluginRegistry({ experimentalEnabled: true, experimentalAllow: ['nexus:example'] });
+const registry = new PluginRegistry();
-const signals: TaskSignals = { description: 'Review code', qualityRequirement: 'high' };
+const signals: TaskSignals = { description: 'Review code' };
```
