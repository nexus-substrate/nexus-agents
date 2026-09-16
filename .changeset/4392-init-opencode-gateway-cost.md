---
'nexus-agents': patch
---

`nexus-agents init --opencode` now writes `NEXUS_GATEWAY_COST=openai-compat=free` into the `mcp.nexus-agents.environment` block it generates, so the OpenCode gateway it configures is a declared arm from the first run instead of an undeclared one that the cost ceiling and per-task budget exclude and `doctor` warns about (#4392). The declaration is scoped to the `openai-compat` endpoint (the `providers.openai-compat` block the bridge reads), never a bare `free`, and `free` rather than `local` because init cannot know whether the proxy is on-box. A value you hand-edit in that block — `openai-compat=priced:<in>,<out>` for a metered proxy — survives a re-run, and `--dry-run` shows the line before anything is written.
