---
'nexus-agents': patch
---

Vestigial routing/decay vocabulary: one deletion, two deprecations (#5097 findings 3 and 5).

- The internal `DecayStrategy` type in `mcp/tools/memory-decay.ts` is removed. A repo-wide grep returned exactly one occurrence — its declaration — and it was never reachable from the package entry point, so nothing outside the module can observe the change.
- `TaskSignals.qualityRequirement` and the `QualityRequirement` union are marked `@deprecated`. No routing rule reads the field: a caller setting it (including through `meta-orchestrator.ts` `select()`) has it silently dropped, and a new test pins that the routing decision is identical with and without it. Both stay on the public surface because removing them is a breaking change; removal is tracked in #5097.
- `TimeConstraint`'s `'relaxed'` member is documented as unproduced: the inference emits only `'urgent'` or `'normal'`, and the sole consumer tests only `'urgent'`, so `'relaxed'` routes exactly like `'normal'`. A test pins that vocabulary.
