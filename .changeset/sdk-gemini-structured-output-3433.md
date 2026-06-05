---
'nexus-agents': minor
---

feat(adapters): native structured output for Gemini + SDK adapters (#3433 phases 2+3)

`GeminiAdapter` and `SdkAdapter` now honor `CompletionRequest.responseFormat`
instead of ignoring it:

- **Gemini** sets `responseMimeType: 'application/json'` (json_object/json_schema)
  and `responseSchema` (json_schema) on the generation config; the warn-and-ignore
  is removed.
- **SdkAdapter** routes `json_object`/`json_schema` through the Vercel AI SDK
  `generateObject({schema})` (via `jsonSchema()`), returning the structured object
  as a JSON text block; `text`/absent stays on `generateText` (unchanged), and
  streaming remains text-only. The duck-typed `ai` exports + result shape are
  runtime-validated (clear errors on a missing `generateObject`/`jsonSchema`
  export; no unsafe casts).

With Claude (phase 1) this means all three API adapters now produce native
structured output — the backend for routing consensus voters off brittle regex
extraction (remaining: voter wiring).
