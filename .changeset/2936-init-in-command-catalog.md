---
'nexus-agents': patch
---

**fix(catalog):** add `init` to `COMMAND_CATALOG` so it appears in `nexus-agents --help`.

`init` is a real CLI command — in the `CliCommand` type union, in `VALID_COMMANDS`, and dispatched via `ASYNC_COMMAND_HANDLERS` — but it had no entry in `COMMAND_CATALOG`, so `nexus-agents --help` and `nexus-agents --help --all` both omitted it and the catalog-driven extractors (`repo-index` + `entrypoints.yaml`) under-reported the command surface. Added an `advanced`-audience entry covering the `--portable`/`--install`/`--uninstall`/`--mcp-config`/`--opencode` flag set introduced across #2305 / #2308 / #2311 / #2504. Closes #2936.
