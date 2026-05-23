---
'nexus-agents': patch
---

**fix(research):** `PaperEntry` now mirrors `ResearchPaper`'s rigor fields; drops the unsafe cast. Closes #2943.

`research-helpers-registry.ts` cast each `PaperEntry` to `ResearchPaper` via `as unknown as ResearchPaper` before scoring — but `PaperEntry` was a strict subset, missing `rigor_tags`, `citation_count`, `has_code`, `code_url`, `quality_notes`, `last_quality_check`. `computeEvidenceTier`'s high-tier branch reads `rigor_tags`, so at runtime `new Set(undefined)` produced an empty set and the path was unreachable for anything flowing through that cast.

`PaperEntry` now carries the rigor fields as optional. A typed `paperEntryToResearchPaper` helper replaces the cast, copying the readonly arrays to mutable ones (Zod-inferred shape). Behavior is unchanged for arXiv ingest (which still leaves rigor empty), but the high-evidence-tier path is now reachable when a maintainer populates `rigor_tags` on a paper — and the type system enforces it instead of silently stripping the field.
