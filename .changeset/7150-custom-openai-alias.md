---
'nexus-agents': minor
---

Make `custom-openai` a thin alias over the shared OpenAI-compatible gateway adapter, retaining `api:custom-openai` attribution, one usage record per eligible `complete()` call and all public `custom-openai` union values. Use the resolved catalogue model when available; otherwise keep the configured/default model and failed-discovery unverified state. Successful completions without token usage remain unrecorded; streaming keeps its existing behavior without usage-log instrumentation.

Keep `NEXUS_CUSTOM_API_SURFACE=responses` scoped to the `custom-openai` alias, including streaming and tool calls. Discovered `api:<endpoint>` arms keep chat completions and their existing model-aware token defaults. The alias omits token-cap fields unless the caller supplies `maxTokens`; its configured URL, model, auth/extra headers, proxy selection and recorded arm remain unchanged. SDK provider initialization refuses `custom-openai`, so a gateway credential cannot reach the direct OpenAI provider.

Remaining intended transport and error differences from the former AI-SDK path:

- The OpenAI client adds `accept: application/json` and `x-stainless-arch`, `x-stainless-lang`, `x-stainless-os`, `x-stainless-package-version`, `x-stainless-retry-count`, `x-stainless-runtime`, and `x-stainless-runtime-version`. The user-agent changes from `ai/<version> ai-sdk/provider-utils/<version> runtime/node.js/<major>` to `OpenAI/JS <version>`.
- Model errors use the `openai/<model>:` prefix rather than `sdk-custom-openai`.
- A caller's `maxTokens` and `tools` are honoured instead of silently dropped: chat sends `max_completion_tokens` and function tools; Responses sends `max_output_tokens` and Responses function tools. Without `maxTokens`, neither alias surface sends a cap.
- The shared DNS/private-host guard bounds each DNS lookup at 5 seconds and refuses that attempt on timeout before sending HTTP; the former alias lookup had no timeout.
- Responses streaming throws on a mid-stream refusal instead of completing over partial output.

The shared client also retains its model-aware temperature omission and non-answer validation. Unsupported Responses stop sequences produce an explicit completion warning. Response parsing now preserves tool-call blocks and available cached-input usage. Update custom-endpoint configuration guides and comments for the URL/key aliases removed in 10.0 (#7144).
