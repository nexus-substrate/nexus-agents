---
'nexus-agents': minor
---

Five `NEXUS_*` boolean flags now share the canonical `parseBoolEnv` accept-set — `true`/`1` and `false`/`0`, case-insensitive — instead of each reading one private literal (#5155): `NEXUS_BUDGET_ENFORCE`, `NEXUS_DYNAMIC_MODELS`, `NEXUS_CONTEXT_RETRIEVER_INJECT` (all three sites), `NEXUS_GITIGNORE_AUTO` and `NEXUS_SUBPROCESS_ENV_ALLOWLIST`. Defaults are unchanged (the last two stay on when unset).

Behaviour change: previously-silent spellings now take effect. An operator who set `NEXUS_BUDGET_ENFORCE=true` was silently unenforced (only `1` was read) and will now be enforced; `NEXUS_DYNAMIC_MODELS=1`, `NEXUS_CONTEXT_RETRIEVER_INJECT=true`, `NEXUS_GITIGNORE_AUTO=false` and `NEXUS_SUBPROCESS_ENV_ALLOWLIST=false` likewise now do what they say. All five are registered in the startup env schema, so `yes`/`no`/`on`/`off` are reported invalid at startup (a warning, not a crash) rather than falling through to the default. `NEXUS_RATE_LIMIT_ENABLED`, already read through the same helper, is now registered with the same accept-set (the schema used to report `1`/`0` invalid although they worked). A test ratchet keeps every `parseBoolEnv`/`parseBoolValue` consumer registered with that shape. `NEXUS_CUSTOM_API_ALLOW_PRIVATE` is deliberately untouched.
