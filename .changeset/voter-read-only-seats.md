---
'nexus-agents': minor
---

Voter and reviewer CLI seats now run in a read-only analysis mode. Every `consensus_vote`, `pr_review` and supply-chain panel seat sends `accessMode: 'read-only-analysis'`, and each CLI adapter maps it to that CLI's own enforcement:

- claude: `--permission-mode default --disallowedTools Bash,Edit,Write,NotebookEdit,WebFetch`
- opencode: `OPENCODE_PERMISSION={"bash":"deny","edit":"deny","webfetch":"deny"}` in the child environment
- gemini (agy): `--mode plan --sandbox`
- codex: the `-s read-only` sandbox it already used, now the declared guarantee; codex over MCP refuses a read-only task that continues a session, because a reply carries no sandbox setting

An adapter that cannot enforce the mode refuses the seat instead of running with its defaults, and the panel's error policy counts that seat as errored. Implement and orchestrate tasks are unchanged.

New public API, all additive: the `ExecutionAccessMode` type, an optional `accessMode` on `CompletionRequest` and `CliTask`, an optional `enforcesReadOnlyAnalysis` on `ICliAdapter` (false on `BaseCliAdapter`, true on the four built-in CLI adapters), and an optional `env` on `CommandConfig`. A custom `ICliAdapter` used for voter seats must set `enforcesReadOnlyAnalysis: true` and apply the mode itself, or its seats will be refused.
