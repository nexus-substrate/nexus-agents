---
'nexus-agents': patch
---

Rewrite the 8 MCP tool-description pairs flagged by the #2650 distinctness lint ([#2677](https://github.com/williamzujkowski/nexus-agents/issues/2677)).

LLM callers reading `list_experts` vs `list_workflows`, `run_workflow` vs `run_graph_workflow`, `extract_symbols` vs `search_codebase`, `delegate_to_model` vs `registry_import`, `research_add` vs `research_add_source`, and `execute_expert` vs `list_experts` previously got near-identical "List/Execute/Add available X" sentences. Each description now leads with the distinguishing concept (`ROLES` vs `TEMPLATES`; `LINEAR` vs `DAG`; `SINGLE file AST` vs `cross-file ripgrep`; `pick existing` vs `draft new`; `PAPER-only` vs `NON-PAPER`; `PREVIOUSLY-created expert`) and explicitly cross-references the sibling tool so a caller can pick the right one.

Two pairs dropped below the lint threshold entirely (`list_experts ↔ list_workflows`, `delegate_to_model ↔ registry_import`). The other five remain in the baseline at slightly higher similarity scores — the cross-references intentionally re-introduce the sibling tool's name into the text, raising the lexical-overlap metric while improving the actual goal (LLM decision-distinctness). One new pair, `research_add ↔ research_discover`, joined the baseline as a similar trade.

Updated: long + README short descriptions in `scripts/tool-descriptions-data.ts`, live `server.registerTool` `description:` fields across 11 tool files, the distinctness baseline at `docs/ops/tool-distinctness-baseline.json`, and the v1 report at `docs/research/mcp-tool-distinctness-v1.md`.

No `research_add → research_add_paper` rename — that's a breaking MCP-surface change tagged "Decision needed" in #2677 and would need a separate unanimous vote. Clarification suffices for the cross-adapter distinguishability gain.
