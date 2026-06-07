---
'nexus-agents': minor
---

feat(pipeline): surface recurring capability gaps as suggested tasks

Adds `checkForCapabilityGapTriggers()` to `research-trigger.ts` (extends, not forks): it reads the capability-gap ledger (`getGapLedger().summarize()`, fed by live routing traffic) and turns gaps that recur at/above a threshold (default 3) into candidate `PipelineTask`s — deduped against known ids and capped, most-frequent first. The `suggest_research_tasks` tool now returns these as a distinct `gapCandidates` list alongside the research-derived `candidates`. Suggest-only: builds task objects in memory, files/executes nothing — the human-gated front of "gap → MetaOrchestrator" (#3540). Increment 3 of the capability-gap-ledger epic (#3555).
