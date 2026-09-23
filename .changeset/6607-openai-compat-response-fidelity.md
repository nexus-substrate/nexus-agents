---
'nexus-agents': patch
---

OpenAI adapter (direct and OpenAI-compatible gateways): responses that are not answers now return an error instead of a successful empty reply.

- A `content_filter` finish, on `complete()` or a stream, returns a `MODEL_ERROR` with `context.reason: 'content_filter'`. Partial text cut off by the filter is not returned as an answer.
- An empty `choices` array returns a `MODEL_ERROR` with `context.reason: 'no_choices'`.
- A reasoning model (o-series, gpt-5, codex, or any reply that reports reasoning tokens) that returns empty text with finish `length` returns a `MODEL_ERROR` with `context.reason: 'reasoning_truncated'` and `context.reasoningTokens` when the vendor reported them. On a non-reasoning model, an empty `length` finish is still an ordinary `max_tokens` truncation.
- When a request sets no `maxTokens`, reasoning models now get a default `max_completion_tokens` of 25,000, following OpenAI's guidance to reserve at least that much for reasoning and output. Other models keep 4,096. The value is a ceiling, not a spend.
- A user message with several `tool_result` blocks now sends one `tool` message per result. Before, only the first was sent, and strict gateways rejected the request with a 400.
- Streamed tool calls now keep their arguments. Each call is emitted once, complete, when the choice finishes. Before, it was emitted on its first fragment with `input: {}`.

Voter seats, experts and orchestrate already treat an adapter error as a failure, so a refusal now counts as an errored seat or a failed task, not as a vote or a success.
