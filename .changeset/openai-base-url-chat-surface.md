---
'nexus-agents': patch
---

fix(adapters): the direct OpenAI adapter (`OPENAI_API_KEY`) now calls `POST <base>/chat/completions` when `OPENAI_BASE_URL` names a host other than `api.openai.com` (#6654).

The adapter always used the AI SDK's default surface, the Responses API (`POST <base>/responses`). Pointing `OPENAI_BASE_URL` at an OpenAI-compatible gateway that serves only chat completions therefore failed every call with a 404.

`NEXUS_CUSTOM_API_SURFACE=responses` keeps the Responses API for such a host; any value other than `chat` or `responses` is refused with a `ConfigError` when the adapter is built. With `OPENAI_BASE_URL` unset, blank, or naming `api.openai.com`, nothing changes: the adapter sends the same Responses API request as before and does not read `NEXUS_CUSTOM_API_SURFACE`.
