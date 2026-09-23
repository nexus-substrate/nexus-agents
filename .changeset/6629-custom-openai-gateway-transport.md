---
'nexus-agents': patch
---

The single-model `custom-openai` path (`NEXUS_OPENAI_COMPAT_URL` / `_KEY`, or the deprecated `NEXUS_CUSTOM_API_*` names) now uses the same transport options as the discovery gateway. `NEXUS_OPENAI_COMPAT_AUTH_HEADER` sends the key in the named header instead of `Authorization: Bearer`. `NEXUS_OPENAI_COMPAT_EXTRA_HEADERS` adds static headers. `HTTPS_PROXY` / `HTTP_PROXY` / `NO_PROXY` route requests through an explicit proxy agent, so `NODE_USE_ENV_PROXY=1` is not needed. Before this change, that path always sent a bearer token, sent no extra headers, and connected directly. When none of these variables is set, behaviour is unchanged (#6629).
