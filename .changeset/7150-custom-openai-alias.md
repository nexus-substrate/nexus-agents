---
'nexus-agents': minor
---

Make `custom-openai` a thin alias over the shared OpenAI-compatible gateway adapter, retaining `api:custom-openai` attribution, one usage record per eligible `complete()` call and all public `custom-openai` union values. Use the resolved catalogue adapter when available; otherwise keep the configured/default model and failed-discovery unverified state. Successful completions without token usage remain unrecorded; streaming keeps its existing behavior without usage-log instrumentation.

Add Responses API completion, streaming and tool-call support to gateway clients through `NEXUS_CUSTOM_API_SURFACE=responses`; chat completions remain the default. Update custom-endpoint configuration guides and comments for the URL/key aliases removed in 10.0 (#7144).

Intended behavior differences: the Responses setting now reaches discovered per-model gateway clients; custom-openai inherits the shared gateway request options, response parsing and tool handling, plus the canonical bounded DNS/private-host guard instead of its separate SDK path. When `maxTokens` is absent, the alias now uses B's model-aware output cap (4,096 ordinary tokens or 25,000 reasoning tokens) instead of omitting it. Model-aware temperature omission and non-answer validation also follow B. Stop sequences on the Responses surface are omitted with an explicit completion warning because that API does not support them. Transport-generated SDK headers follow the shared OpenAI client; the configured URL, model, API surface, auth/extra headers and recorded arm remain unchanged.
