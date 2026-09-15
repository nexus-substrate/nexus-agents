---
'nexus-agents': patch
---

Remove the last four `NEXUS_*` variables from the #4939 census that nothing
read: `NEXUS_TIMEOUT_CLI`, `NEXUS_TIMEOUT_API`, `NEXUS_TIMEOUT_WORKFLOW` and
`NEXUS_TIMEOUT_MCP`. Their only reader was `getTimeout()`, which had zero
production callers, and `config get TIMEOUT_DEFAULTS.cliMs` reported a set
variable as `Source: (env)` for a value nothing consumed; `config set` told
operators to set one "to persist this value". `getTimeout` and the
`getEnvVarDocumentation` generator (whose only remaining rows were these four)
are gone with them. Same treatment as #2977, #4180 and #5903. An operator still
setting one now gets the unrecognized-variable report with a typo suggestion.
The live timeout knobs are unchanged: `NEXUS_VOTE_TIMEOUT_MS`,
`NEXUS_EXPERT_TIMEOUT_MS`, `NEXUS_WORKER_TIMEOUT_MS`, `NEXUS_TIMEOUT_MULTIPLIER`
and the `NEXUS_TIMEOUT_CLASS_*_MS` family.
