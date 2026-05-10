---
'nexus-agents': minor
---

Migrate `AgenticAdapter` to the unified `ModelRegistry` (#2540 PR 2 of 8).

`AgenticAdapter` now consumes `ModelEntry` from the registry instead of `ModelBehaviorProfile` from the deprecated `model-behavior-profile.ts`. Behaviour is unchanged — the registry's derived-fallback chain matches the prior `lookupModelProfile` semantics field-for-field.

`AgenticAdapterOptions` gains an optional `registry: ModelRegistry` field for dependency injection (tests + multi-tenant deployments). Default is the lazy global registry.

`forceProfile` now accepts a `ModelEntry` instead of `ModelBehaviorProfile` — minor breaking change for tests that constructed the profile inline. Tests updated.

**Deletes** `model-behavior-profile.ts` + its tests. The behaviour fields, defaults, and lookup-with-vendor/family-fallback logic moved into `model-registry.ts` in PR 1. No code paths reference the deleted module.
