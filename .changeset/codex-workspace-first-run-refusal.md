---
'nexus-agents': patch
---

Read-only codex runs now refuse an account codex would fetch cloud-managed config for, even before that config is cached (#6977). Cloud config was previously detected only through codex's cached `cloud-config-bundle-cache.json`, so on a workspace account's first run a cloud-defined MCP server could start outside the read-only sandbox. codex-cli 0.160.0 has no option to turn that fetch off. Instead, the plan is read from the `id_token` in `$CODEX_HOME/auth.json`. A read-only run continues only for a personal plan (free, go, plus, pro, prolite, promax), or when no ChatGPT login is stored (API-key and Bedrock auth). Other cases are refused: team, business, enterprise and education plans, unknown plans, auth modes that keep the plan outside auth.json, and a `cli_auth_credentials_store` other than `file`. Runs that are not read-only are unaffected. Refusal messages name the plan and never include token material.
