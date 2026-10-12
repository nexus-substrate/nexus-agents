---
'nexus-agents': minor
---

feat(context): graduate NEXUS_CONTEXT_RANKED to default-on (#3236)

Changes `NEXUS_CONTEXT_RANKED` from default-off to default-on via `parseBoolEnv(CONTEXT_RANKED_FLAG, true)`. Context summaries now render unified cross-ranked memory blocks by default, scoring recency, importance, and relevance across all memory sources. Operators can opt out by setting `NEXUS_CONTEXT_RANKED=0`.
