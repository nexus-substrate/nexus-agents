---
'nexus-agents': patch
---

Activate dynamic model discovery — Phase 1 (#3404, epic #3403). The `AvailableModelsCache` + the CLI-level routing pre-filter already existed but the cache had **no sources registered**, so it was always empty and the pre-filter was inert. This adds a live **OpenRouter `/api/v1/models`** catalog source (`createOpenRouterModelsSource` — Zod-validated, size/timeout-bounded, fail-open) and a `registerDefaultModelSources()` helper that also wraps any adapter implementing `listModels()` (opencode + SDK adapters) as a CLI-named cache source. `createCompositeRouter` now attaches the populated global cache when dynamic discovery is enabled. Opt-in via `NEXUS_DYNAMIC_MODELS=true` (default OFF; behavior unchanged until set). Fail-open throughout: a failed probe yields `[]` and an empty cache leaves routing using all CLIs, so discovery can never wedge routing. The 429/5xx execution-time cooldown is tracked as a follow-up.
