---
'nexus-agents': patch
---

Upgrade the OpenAI client to 7.x (`openai` `^7.28.0`) and the optional AI SDK integration to `ai` 7.x and `@ai-sdk/openai` 4.x. Preserve support for system messages in SDK completions and structured output with the new SDK defaults.

Structured output (`responseFormat` `json_object` / `json_schema`) now calls `generateText` with `Output.object` instead of `generateObject`, which ai 7 deprecates. The parsed object is returned as a JSON text block with the same usage, stop reason and served model. Content-filter and empty truncated responses now reach the typed `content_filter` / `reasoning_truncated` errors; ai 6's `generateObject` threw a generic `NoObjectGeneratedError` (surfaced as `MODEL_ERROR`) before the adapter could classify them. `extractAiSdkFunctions` adds an `objectOutput` field (the `Output.object` helper) and throws `missing expected export: 'Output.object'` when the installed `ai` lacks it. The `generateObject` field and the `GenerateObjectResult` type are deprecated, not removed: they are still populated and exported, but the adapter no longer calls `generateObject`.

The optional peer ranges widen to `ai` `^6.0.0 || ^7.0.0` and `@ai-sdk/openai` `^3.0.0 || ^4.0.0`, so an existing ai 6 install keeps resolving.
