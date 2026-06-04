---
'nexus-agents': patch
---

Expose the per-run token budget via the `run_dev_pipeline` MCP tool (#3395 follow-up). A new optional `maxBudgetTokens` input threads through to the dev-pipeline's `BudgetGuard`: when set, expert calls stop once cumulative token usage crosses the ceiling — a hard-stop safety cap for unattended/multi-day runs. Omitted by default (enforcement off). This makes the budget mechanism (shipped in 2.102.6) reachable by MCP clients rather than programmatic-only.
