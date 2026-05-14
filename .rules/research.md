---
paths: ['packages/**/cli/research-*.ts', 'packages/**/mcp/tools/research-*.ts', 'docs/research/**']
description: Research synthesis provenance invariants — every merged claim stays attributed to its source
---

# Research Provenance Rules

Synthesis merges multiple papers into voter-facing output. The risk: when
two sources disagree, a synthesizer can pick one without flagging the
conflict — voters then can't tell "the literature says X" from "Source A
claims X, Source B disputes it." Issue #2663 makes provenance a structural
invariant, not a hope.

## Invariants

1. **No unattributed claim.** Every synthesized insight carries
   `sourcePaperIds` with **at least one** id. Enforced structurally by
   `AttributedInsightSchema` (`research-helpers-synthesize.ts`) — a Zod
   `.min(1)` on `sourcePaperIds`, parsed at construction. A documentation
   rule alone is fragile; the schema makes it a validated guarantee.

2. **Contradictions are representable, not collapsed.** When two papers
   assert the same finding, **both** ids land in `sourcePaperIds` — the
   output structure can express "two sources, possibly disagreeing"
   rather than silently picking one. `attributeFindings` keys findings by
   normalized text and unions the source ids; it never drops a source.

3. **Provenance flows from the registry, untruncated.** The registry
   (`docs/research/registry/papers.yaml`) carries `arxiv_id`, `url`,
   `publication_date`. `extractPapers` threads these onto `SynthesisPaper`
   (`sourceUri`, `publicationDate`); `SynthesisPaperRef` carries them into
   cluster output. Do not extract a paper into a synthesis path while
   dropping its source URI.

## When adding or changing a synthesis path

A "synthesis path" is any code that merges 2+ research sources into one
output (today: `research_synthesize` / `research-helpers-synthesize.ts`).
`research_catalog_review` is a review-queue manager (no merge) and
`pr_review` aggregation already preserves per-finding `role`/`location` —
neither is a synthesis path.

If you add one: the merged output type must carry source ids per claim,
validated by a `.min(1)` schema. If you cannot attribute a merged claim
to a source, that is a bug in the path, not an acceptable output.
