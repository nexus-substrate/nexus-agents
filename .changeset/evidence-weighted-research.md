---
'nexus-agents': minor
---

feat(context): evidence-weight the `researchInsights` context path (#4287)

Join `TechniqueEntry.source_papers` against `papers.yaml` quality/evidence at
status-read time and carry the resulting `evidenceTier`/`qualityScore` on
`TechniqueStatusSummary`. `selectRelevantResearch` now stable-sorts matched
techniques by evidence tier (high > medium > low > none) before applying the
cap, and the injected "Prior research" section renders the tier when present.

No new persistence — `papers.yaml` stays the single source of truth and the
join is recomputed on every read. Fail-soft throughout: a missing/unparsable
registry or unresolved paper ids simply leave the new fields absent, so output
is byte-identical to before the change.
