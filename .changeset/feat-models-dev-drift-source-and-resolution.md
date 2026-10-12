---
'nexus-agents': minor
---

feat(models): models.dev live discovery source and catalog resolution in model delegation

Supports newly released frontier models and resolves authentic capabilities across discovery and delegation (#6625):

- Extracts shared HTTP fetcher with SSRF validation, payload ceiling, and schema parsing into `src/config/models-dev-client.ts`, shared between `scripts/sync-models-dev.ts` and discovery probes.
- Adds `models-dev` as an unauthenticated live discovery source in `model-drift-sources.ts`, allowing scheduled model drift detection to discover newly released models across frontier vendors with true context windows, pricing, and release timestamps.
- Implements `resolveCapabilityProfile(modelName)` in `delegate-to-model-types.ts`, querying the live `ModelRegistry` when models are not in the static in-tree matrix.
- Updates `selectModel` and `buildDelegateOutput` in `delegate-to-model-helpers.ts` to honor model hints for catalog-admitted models (such as 1M+ context models) rather than silently dropping them.
- Updates `delegate-to-model-router.ts` to resolve authentic context windows and scores from `ModelRegistry` rather than falling back to arbitrary static defaults.
