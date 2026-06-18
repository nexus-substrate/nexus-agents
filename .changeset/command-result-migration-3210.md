---
'nexus-agents': patch
---

refactor(cli): unify exit handling under CommandResult (#3210)

CLI command handlers in `cli-commands-handlers.ts` and
`cli-commands-handlers-complex.ts` now RETURN a `CliExitResult` (a
`CommandResult` carrying an `exitCode`) instead of calling `process.exit`
inline. The single `process.exit` boundary lives in the dispatcher
(`dispatchCommand` → `exitWith`). Exit codes are identical to before for
every path — this is a behavior-preserving structural refactor, not a
behavior change. Handlers that own the process lifecycle (the MCP stdio
server, the `session` valid-subcommand path) intentionally return
`undefined` so the dispatcher does not force an exit, preserving prior
event-loop-drain behavior.
