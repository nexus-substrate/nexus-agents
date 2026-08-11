---
'nexus-agents': minor
---

Remove the model-not-found substitution machinery (#4408 step 1)

`withModelNotFoundFallback` / `wrapResilientWithFallback` wrapped every adapter so a `MODEL_NOT_FOUND` error would refresh the available-models cache, pick a same-family sibling, and retry. Decided 6/1 (`higher_order`) to delete it rather than wire it.

The objection is alignment, not cost: the wrapper deliberately preserved the wrapped adapter's `providerId`/`modelId` so telemetry saw no schema change — which means a substituted call recorded the substitute's outcome **under the retired model's id**, corrupting LinUCB reward attribution and the outcome→distillation loop. In a substrate whose product is auditable decisions, the caller's model choice is itself an audited decision.

It was dormant twice over: `enableMissingModelFallback` defaulted `false` and was never set anywhere in production, and even enabled, its fallback search returned null because the default cache has no sources.

Removed: `adapters/model-not-found-fallback.ts` and its test (906 lines), the `enableMissingModelFallback` / `missingModelFallbackOptions` config, `withDefaultOnRetirement`, the `maybeWrap` call path, and the barrel exports. `MODEL_NOT_FOUND` now surfaces to the caller unchanged, with its structured error code intact.

`AvailableModelsCache`, `openrouter-models-source`, and `register-model-sources` are deliberately kept — they are the live path behind the shipped `list_available_models` MCP tool.
