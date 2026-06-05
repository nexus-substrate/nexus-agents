---
'nexus-agents': patch
---

chore(pipeline): retire the unrunnable `research` pipeline template (#3488)

Per the #3488 consensus vote (5-0), the `research` template — whose
`investigate`/`synthesize` stages were never implemented and whose stage order
was incoherent — has been removed along with its orphaned `SYNTHESIS`/
`DELIVERABLES` graph state keys. Research-classified tasks now route to the
`general` pipeline (research → plan → vote → implement → qa → security) via an
explicit retired-template alias, instead of failing or emitting an "unknown
template" warning. The unwired `runResearchPipeline` subsystem (#1711) is tracked
separately in #3492.
