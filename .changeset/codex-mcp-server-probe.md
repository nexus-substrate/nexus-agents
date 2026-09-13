---
'nexus-agents': patch
---

The codex transport is now chosen by probing the installed codex for the `mcp-server` subcommand, and codex voter seats work again on codex-cli 0.154 (#6119).

codex-cli 0.154.0 removed `codex mcp-server`: `codex --help` lists only `mcp` (manage external MCP servers), and `codex mcp-server` forwards to the interactive CLI, which exits with `stdin is not a terminal` under a pipe. The default codex transport spawned exactly that, so every codex-assigned voter seat errored, and `nexus-agents doctor` kept printing `MCP Client mode: Ready (Codex mcp-server)` because readiness was inferred from the install rather than measured.

Three changes:

- A probe, `codexMcpServerAvailable`, runs `codex mcp-server --help` with stdin closed and a short timeout, and reports the subcommand available only when the process exits 0 and its stdout names `mcp-server` (on 0.154 the forwarded `--help` exits 0 with the top-level help, which never does). The verdict is cached per process.
- When no codex transport is configured, `createCliAdapter` and `createAllAdapters` use the MCP transport only if the probe passes and otherwise the subprocess transport (`codex exec --json -s read-only`, which already carries the legacy-landlock flag from #6093 and the stderr capture from #6101). An explicit `transport: 'mcp'` on a codex without the subcommand throws `CodexMcpServerUnavailableError` at construction instead of spawning a process that dies. `createAllAdapters` no longer defaults its transport argument to `'mcp'`, and `orchestrate` leaves it unset outside puppeteer mode.
- `doctor` prints `MCP Client mode: Ready (Codex mcp-server)` only when the probe passes; with codex installed but the subcommand absent it prints `MCP Client mode: unavailable — codex-cli ≥0.154 has no mcp-server subcommand; using codex exec`.

Separately, a `ResilientAdapter` pinned to a CLI now identifies as `cli-<name>` before detection instead of the generic `resilient-proxy`. The voter fallover (#3587) keys seats by that id and skips a seat whose key equals the fallback's; an undetected codex seat and the undetected default adapter both read as `resilient-proxy`, so the seat errored with "No model adapter available" and never fell over. It now retries once on the fallback adapter, and a seat that is the fallback still does not retry on itself.
