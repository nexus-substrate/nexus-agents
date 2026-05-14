---
'nexus-agents': minor
---

Source provenance through research synthesis ([#2663](https://github.com/williamzujkowski/nexus-agents/issues/2663), Epic E).

`research_synthesize` previously dropped source attribution at the merge: `extractPapers` pulled `id`/`title`/`summary`/`keyFindings` but not `url`/`arxiv_id`/`publication_date`, and `keyInsights` was a flat string array — a voter couldn't trace any synthesized claim back to a paper.

Research scoped this to the single leaking path — `research_catalog_review` is a review-queue manager (no merge) and `pr_review` aggregation already preserves per-finding attribution, so neither is touched.

- `SynthesisPaper` carries `sourceUri` + `publicationDate`; `SynthesisPaperRef` carries them into `ClusterSynthesis.papers` (now `{id, title, sourceUri}` refs, not bare titles).
- `keyInsights` is now `AttributedInsight[]` — `{insight, sourcePaperIds}`. When two papers assert the same finding, **both** ids survive, so a contradiction is _representable_ rather than silently collapsed into one source's claim.
- Structural enforcement, not just a doc rule: `AttributedInsightSchema` (Zod `.min(1)` on `sourcePaperIds`) is parsed at construction — every merged claim is a validated-attributed claim.
- New `.rules/research.md` documents the provenance invariants.
