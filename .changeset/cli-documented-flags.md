---
'nexus-agents': patch
---

Register documented CLI flags rejected by strict parser (#6693).

- Register `--limit`, `--markdown`, `--since`, `--until`, `--task-type`, and `--min-sample` in `PARSE_ARGS_CONFIG.options` in `cli-types.ts`.
- Forward `taskType` and `minSample` in `validation-dashboard-command.ts`.
- Forward `limit` and `markdown` in `session-commands.ts`.
- Update `usage-command.ts` to read `--since` and `--until` from typed CLI options.
- Extract `buildOptions` helpers into `cli/cli-options-builders.ts` to keep `cli.ts` within complexity and module line limits.
- Add comprehensive test coverage in `cli-parser-global-flags.test.ts` for all documented flags.
