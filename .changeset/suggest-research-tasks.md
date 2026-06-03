---
'nexus-agents': minor
---

Add SUGGEST-ONLY `suggest_research_tasks` MCP tool (#1715 / #1711).

Thin wrapper over `checkForResearchTriggers` that returns CANDIDATE
`PipelineTask[]` derived from `research_discover` findings for a
human/orchestrator to review. Ratified by consensus_vote (5/0, Option A):
it creates no GitHub issues, executes nothing, and mutates nothing. The
candidate text is externally discovered (T3, untrusted) and is framed as
data/suggestions in the response, never as instructions. Input: `topic`,
`qualityThreshold` (0-10), `maxTriggers` (≥1), `existingTaskIds` (→Set for
dedup) — all optional, all passed straight into the engine's existing
guardrails. Read-only annotations (`readOnlyHint: true`,
`openWorldHint: true`). Tool count 43 → 44.
