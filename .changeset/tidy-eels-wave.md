---
'nexus-agents': minor
---

Preserve token-usage absence end to end instead of fabricating zeros (#4439)

Four producers synthesised `0/0/0` when a vendor reported no usage — `cli-to-model-adapter`, `openai-mappers` (non-streaming and streaming), `gemini-adapter`, and the reverse `model-to-cli` bridge. A synthesised zero is indistinguishable downstream from a real zero-token call, which silently defeated the measured-voter gate (#4436) on every live vote and discarded the cache fields (#4438) that #4435 needs.

`CompletionResponse.usage` is now optional, and producers omit it rather than zero-filling. The response-side `TokenUsage` also carries optional `cachedInputTokens` / `cacheCreationInputTokens`, so cache figures survive the crossing. Decided 7/0 via `higher_order`.

Verified end to end: a CLI reporting no usage now yields `usage: undefined`, and that voter rolls up as `unmeasured: true, measuredVoters: 0`. The same probe before this change returned `unmeasured: false, measuredVoters: 1`.

Leaf display totals (`TaskResult.metadata.tokensUsed` and similar required-number fields) still coerce unknown to `0` — they are aggregates, not measurements, and the decision-cost path no longer reads through them.
