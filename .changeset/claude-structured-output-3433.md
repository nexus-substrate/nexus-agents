---
'nexus-agents': minor
---

feat(claude): honor responseFormat via forced tool_use (#3433 Phases 0+1)

`ClaudeAdapter` now honors `CompletionRequest.responseFormat` instead of
warn-and-ignoring it (#470). A `json_object`/`json_schema` request injects a
forced synthetic `respond` tool (`tool_choice` pinned to it, `input_schema` =
the requested schema), and the tool's input is surfaced as a JSON text block so
existing parsers work unchanged. Caller-supplied tools are merged, never
clobbered; the `text`/absent path is unchanged.

Adds a hand-authored `VOTE_JSON_SCHEMA` (the single source of truth for the vote
shape, mirroring the Zod `VoteResponseSchema`) with a drift contract test
covering top-level AND nested (`findings`/`gate`) fields — no new dependency.
Foundation for routing consensus voters through native structured output
(#3433 remaining phases: Gemini, SdkAdapter, voter wiring).
