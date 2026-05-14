---
'nexus-agents': patch
---

Tool-output consistency lint + hook-layering guide ([#2653](https://github.com/williamzujkowski/nexus-agents/issues/2653), Epic B).

#2653 originally proposed a runtime PostToolUse normalization layer. Codebase research refuted the premise — the 38 MCP tools already return uniform shapes (memory backends use `Date` objects, no conflicting status taxonomies, no pagination envelopes). So #2653 ships as a **preventive** lint, not a corrective runtime layer that would only mask future drift.

- `.rules/hooks.md` documents the hook-vs-voter-rule-vs-prompt-rule layering decision, the output-consistency contract, and when a runtime normalization boundary _would_ be justified (the gateway proxying untrusted external MCP servers).
- `check:tool-output-consistency` (`scripts/check-tool-output-consistency.ts`, wired into `governance:check`) scans each MCP tool's output surface — `outputSchema` blocks and `*Response` types, scoped by brace depth so internal cache types are exempt — and fails when a timestamp-named field (`*At`/`*Date`/`timestamp`) is typed as a bare `number`. A voter once compared an epoch-ms number to an ISO date as the same type; this catches the next one at source.
