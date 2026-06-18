---
'nexus-agents': patch
---

feat(cli): expose mode detection for inspection (#3214)

Add a `nexus-agents mode` subcommand that prints the detected invocation mode
(server vs orchestrator), the signals that fed the decision (MCP client, stdin/
stdout TTY, CI platform, container) with their observed values, and the one-line
reasoning. Previously the detection in `mode-detector.ts` was only reachable
internally, so users had no way to see _why_ a given mode was chosen when
debugging CI/container issues. Supports `--format=json` for scripting and
`--mode=<m>` to report what an explicit override would resolve to.
