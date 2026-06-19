---
'nexus-agents': patch
---

refactor(cli): single-source command descriptions from COMMAND_CATALOG (#3209)

The one-line description of each top-level command was copied across three
files and had DRIFTED: `vote` read "Run consensus vote on a proposal (5-6
agents)" in `cli-command-catalog.ts`, "Run consensus vote on a proposal (6
agents)" in the hardcoded `HELP_TEXT` command list, and "Run multi-agent
consensus vote on a proposal (6 agents by default)." in `COMMAND_HELP` — all
three wrong (the panel is 7 roles by default, 3 with `--quick`, per
`getVoterRoles` in `mcp/tools/consensus-vote.ts`).

`COMMAND_CATALOG` is now the single source of each command's one-line
description:

- The hardcoded COMMANDS list was removed from `HELP_TEXT`; `renderHelp` now
  fills a single placeholder in the static frame with
  `renderCommandsSection(showAll)` for BOTH the default (`--help`) and full
  (`--help --all`) views — previously only the default view derived from the
  catalog while `--all` returned the drifted hardcoded list.
- `CommandHelpEntry.description` was dropped; `formatCommandHelp` /
  `formatAllCommandsHelp` look the one-liner up from the catalog via the new
  `getCommandDescription`. The richer per-command help (flags, examples,
  API-key requirements) stays in `COMMAND_HELP`.
- A drift gate in `cli-command-catalog.test.ts` asserts the rendered `--help`
  command list and every `COMMAND_HELP` command agree with the catalog, and
  that `vote` reflects the real 7-agent default.

The catalog `vote` description was corrected to "Run consensus vote on a
proposal (7 agents; --quick uses 3)". Per the 7-0 vote in #3212, no unified
registry / dispatch refactor was done — this only consolidates the
description into the existing catalog. `--help` output is unchanged except the
corrected vote count and `--all` now using the same catalog-grouped layout as
the default view.
