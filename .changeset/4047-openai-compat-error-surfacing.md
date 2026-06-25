---
'nexus-agents': patch
---

Surface the real HTTP status + body for OpenAI / OpenAI-compatible gateway errors ([#4047](https://github.com/nexus-substrate/nexus-agents/issues/4047))

When a request to OpenAI or a custom OpenAI-compatible (litellm-style) gateway failed, the
adapter discarded the OpenAI SDK `APIError`'s `status`/`type`/`code`/`param`/body and kept
only the SDK's `.message` — which for an unparseable error body collapses to the useless
`"400 status code (no body)"`. `OpenAIAdapter.transformError` now surfaces the real HTTP
status and the gateway's response body (while preserving the fields the error classifier
keys on), so a gateway rejection is diagnosable instead of opaque.

This also corrects a mis-diagnosis: the `<provider>/<model>` seen in such errors is the
error **format** (`providerId`/`modelId`), not a transport prefix injected into the request
`model` field — the request already sends the bare model id. (A "strip the prefix" change
would have been wrong and would break gateways that require `provider/model`, e.g. OpenRouter.)
