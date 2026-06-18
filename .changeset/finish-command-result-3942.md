---
'nexus-agents': patch
---

refactor(cli): finish CommandResult migration + explicit lifecycle sentinel (#3942, completes #3210)

Completes the #3210 migration started in #3941. Every CLI command handler
dispatched from `cli-commands.ts` now RETURNS its exit code instead of calling
`process.exit` inline; the single `process.exit` lives at the dispatcher
boundary in `exitWith()`. Migrated behavior-preservingly (exit codes
byte-identical): auth, login, usage, release-notes/validate/announce, scaffold,
visualize, capabilities, mode, scenario, validate, migrate, memory-benchmark,
status, health, improvement-review, auto-remediate, remediation-review.

Adds an explicit `LIFECYCLE_DELEGATED` sentinel (+ `LifecycleDelegated` type and
`isLifecycleDelegated` guard) to `cli-types.ts`. Lifecycle-owning handlers (the
MCP stdio server, the session valid-subcommand path) now RETURN the sentinel
instead of a bare `undefined`/`void`. Every handler is typed
`CliExitResult | LifecycleDelegated` (`CliHandlerResult`) with no `undefined`/
`void` member, so a dropped return is a compile error (TS2366) rather than a
silently-swallowed exit code. `exitWith` handles the union exhaustively. The two
`eslint-disable @typescript-eslint/no-invalid-void-type` suppressions are
removed.
