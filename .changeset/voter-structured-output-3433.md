---
'nexus-agents': minor
---

feat(consensus): voters request native structured output (#3433 phase 4)

`executeSingleVoteAttempt` now sets `responseFormat: {type:'json_schema', schema:
VOTE_JSON_SCHEMA}` on the vote request, so voters backed by Claude (tool_use),
OpenAI/SDK (generateObject), or Gemini (json mode) return a schema-valid vote
object natively instead of prose-wrapped JSON — the brittle regex extraction that
caused intermittent voter parse failures. Adapters that don't honor
responseFormat ignore it and the existing `extractTextFromResponse` +
`parseVoteResponse` (regex + Zod) path is the unchanged fallback, so no backend
regresses. Completes #3433 (epic #3317 finding #5).
