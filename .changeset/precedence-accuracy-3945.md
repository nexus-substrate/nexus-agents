---
'nexus-agents': patch
---

docs: correct the Configuration Precedence section to match the loader (#3945)

The section claimed a 4-level merge (env → project → user → default) with a user
config at `~/.config/nexus-agents/config.yaml`. The loader (`config-loader.ts`)
actually selects ONE file (first match wins: `NEXUS_CONFIG_PATH` → project
`./.nexus-agents/nexus-agents.yaml`/`./nexus-agents.yaml` → user
`~/.nexus-agents/nexus-agents.yaml`), layered over defaults, with env vars
overlaying per-setting at consumption time — not a multi-file merge, and not the
`~/.config/...` path. Corrected to the real behavior; consistent with the
"Configuration for Reusable Pipelines" section (#3253).
