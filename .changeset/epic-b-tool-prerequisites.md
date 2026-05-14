---
'nexus-agents': minor
---

Programmatic prerequisite gates for sensitive MCP tools ([#2652](https://github.com/williamzujkowski/nexus-agents/issues/2652), Epic B).

A guarded MCP tool now declares a **call-time world-state predicate** that must hold before it runs. `withPrerequisite()` (`src/mcp/middleware/tool-prerequisites.ts`) evaluates it on every invocation and, on failure, returns a structured `permission` error envelope carrying the failed prerequisite name + a remediation hint in `detail` — so the caller knows how to recover.

Prerequisites are **world-state predicates**, not session-ordering ("call X first" is the tool's own internal responsibility, never a gate). Three tools are guarded: `improvement_review` (`gh-cli-available`), `memory_write` and `registry_import` (`data-dir-writable`). The `check:tool-prerequisites` CI gate requires every non-read-only tool to appear in either `TOOL_PREREQUISITES` or `NO_PREREQUISITE` (with a reason), so a new sensitive tool can't ship ungated by omission. Graph documented in `.rules/tool-prerequisites.md`.
