---
'nexus-agents': patch
---

feat(ci): MCP tool description-drift gate (#3528)

Adds `scripts/check-mcp-description-drift.ts` (wired into docs-check CI): for each
tool in TOOL_MANIFEST it statically extracts the runtime `registerTool`
description from the tool source and compares it to the `TOOL_DESCRIPTIONS`
doc-table source via an overlap-coefficient similarity threshold — catching the
#3527 class where the two long-form sources silently disagree about a tool's
behavior. Per the consensus_vote (Option B): static/deterministic parsing (no
eval), FAIL-LOUD on any unparseable runtime description (never silently skip),
and a similarity metric that tolerates intentional emphasis differences. The
deliberate short-form `README_TOOL_DESCRIPTIONS` is out of scope. Aligns the one
pre-existing drift (`query_trace`) so the gate passes clean at 46/46 tools.
