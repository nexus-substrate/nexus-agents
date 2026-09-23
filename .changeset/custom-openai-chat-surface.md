---
'nexus-agents': patch
---

fix(adapters): the single-model `custom-openai` adapter now calls `POST <base>/chat/completions` instead of `POST <base>/responses` (#6645).

The adapter used the AI SDK's default OpenAI surface, the Responses API. OpenAI-spec gateways commonly serve only chat completions, so every call through a gateway configured with `NEXUS_OPENAI_COMPAT_URL` (the unpinned default model on a host with no CLI and no vendor key, and the `api:custom-openai` router arm under `NEXUS_BILLING_MODE=api`) failed with a 404.

New `NEXUS_CUSTOM_API_SURFACE=chat|responses` (default `chat`). Set `responses` for an endpoint that serves the Responses API and should keep receiving it. Any other value is refused with a `ConfigError` when the adapter is built. The direct OpenAI adapter (`OPENAI_API_KEY`) is unchanged and still uses the Responses API.
