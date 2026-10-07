---
'nexus-agents': patch
---

Upgrade the OpenAI client to 7.x (`openai` `^7.28.0`) and the optional AI SDK integration to `ai` 7.x and `@ai-sdk/openai` 4.x. Preserve support for system messages in SDK completions and structured output with the new SDK defaults.

Structured output (`responseFormat` `json_object` / `json_schema`) now calls `generateText` with `Output.object` instead of `generateObject`, which ai 7 deprecates. Results are unchanged: the parsed object is returned as a JSON text block with the same usage, stop reason and served model, and content-filter or empty truncated responses still fail with the same typed errors. `extractAiSdkFunctions` adds an `objectOutput` field (the `Output.object` helper) and throws `missing expected export: 'Output.object'` when the installed `ai` lacks it. The `generateObject` field and the `GenerateObjectResult` type are deprecated, not removed: they are still populated and exported, but the adapter no longer calls `generateObject`.
