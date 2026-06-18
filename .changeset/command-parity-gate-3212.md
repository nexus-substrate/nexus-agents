---
'nexus-agents': patch
---

test(cli): command-metadata parity gate to prevent dispatch/catalog drift (#3212)

Add `command-parity.test.ts` asserting the real invariant between the three
parallel command-name structures — the dispatch tables (`cli-commands.ts`),
`COMMAND_CATALOG` (`cli-command-catalog.ts`), and `VALID_COMMANDS`
(`cli-types.ts`) — so drift (e.g. #3713's `auto-remediate` silent
MCP-server fallthrough) fails CI with the offending command named.

The gate asserts: dispatch ⊆ catalog, catalog ⊆ dispatch, and
`VALID_COMMANDS` == dispatchable, with a small documented `ALLOWED_ASYMMETRY`
allowlist (`(default)` catalog pseudo-entry; special-cased `help`/`version`).
Adds a minimal `listDispatchableCommands()` export to `cli-commands.ts` and
exports the existing `VALID_COMMANDS` const so the test derives sets from the
real dispatch tables rather than re-listing names. No dispatch refactor, no
unified registry, no new CLI command or MCP tool.
