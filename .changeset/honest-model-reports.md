---
'nexus-agents': patch
---

Separate explicitly reported model identity from operational model selection. Both adapter bridges preserve the optional `reportedModel`; consensus records populate `servedModel` only from validated reporting evidence while retaining configured, assigned, fallback, and resolved selection identities.

Seats without a model report retain their token counts but now have unknown, unpriced serving cost and use the unknown-model cost grouping. Historical `servedModel` values may contain configured fallbacks; existing ledger records are not rewritten.

AI SDK reporting uses explicit raw response evidence for Anthropic and OpenAI chat/Responses. Google generateContent and unsupported response shapes remain unmeasured. AI SDK 6 is uncharacterized. Transport reports do not constitute independent provider identity attestation.
