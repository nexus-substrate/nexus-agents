---
'nexus-agents': patch
---

fix(experts): stop pointing the research and infrastructure experts at a removed subsystem

Both expert prompts cited `docs/architecture/RESEARCH_PIPELINE.md` as a reference
implementation — the research expert called it "the template for new research
workflows". That subsystem (`research-pipeline.ts`, `runResearchPipeline`, the
`nexus:research-pipeline` plugin) was deleted in #3492 / PR #3590, so the prompts
were sending agents to a spec for code that no longer exists.

The research expert now points at the live research-loop tools
(`research_discover` → `research_analyze` → `research_synthesize` →
`research_query`) plus `.rules/research.md` for the provenance invariants; the
infrastructure expert now cites `ORCHESTRATOR_WORKFLOW_ENGINE.md` for staged data
flow. Adds a regression test asserting no expert prompt cites the removed doc.
