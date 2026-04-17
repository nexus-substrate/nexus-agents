---
'nexus-agents': minor
---

feat(cli-adapters): add generateObject<T> for typed structured output with retry-with-feedback (#1897)

New `generateObject()` helper wraps CLI adapter execution with:

- Zod schema → JSON Schema instruction appended to prompt
- Automatic JSON extraction from LLM response (object or array)
- Zod validation of extracted data
- On validation failure: retry once with the validation error fed back
  to the LLM ("Your previous response failed JSON validation: ...")
- Returns `Result<GenerateObjectResult<T>, GenerateObjectError>`

This replaces the manual `extractJsonObject → JSON.parse → Zod.parse`
pattern scattered across consensus-plan, triangulated-review, security
fix-generator, and finding-triage. Inspired by vercel/ai's
`generateObject` and pydantic-ai's parse-retry-with-feedback pattern
(surfaced in #1892 research).
