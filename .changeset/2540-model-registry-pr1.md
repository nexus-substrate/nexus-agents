---
'nexus-agents': minor
---

Add unified `ModelRegistry` (#2540 PR 1 of 8). Single source of truth for per-model metadata — combines what was previously split between `model-capabilities.ts` (canonical hardcoded `MODEL_IDS`) and `model-behavior-profile.ts` (vendor-pattern-matched profiles).

`ModelEntry` carries both capability + behaviour fields. Resolution chain: operator manifest > in-tree authoritative > models.dev snapshot > derived defaults (vendor → family → universal). Always returns something — unknown models get derived entries with sensible defaults so routing decisions don't hard-miss.

Public API:

- `ModelRegistry` class + `getEntry(modelId, hints?)` lookup
- `ModelEntry` / `ModelRegistryOptions` / `EntrySource` types
- `deriveEntry(modelId, identity)` for consumers building entries from resolved identity
- `getDefaultRegistry()` / `setDefaultRegistry()` for the lazy global singleton
- `DEFAULT_ENTRY` for the universal fallback shape

`model-behavior-profile.ts` is `@deprecated` — will be deleted in PR 2 of the #2540 plan once `AgenticAdapter` migrates to the unified registry. `model-capabilities.ts` callers migrate in PR 3.

Also extends `model-identity.ts`'s `dated` quirk regex to catch ISO-style date suffixes (`2024-08-06`, `2024-08`) in addition to compact-8-digit formats.
