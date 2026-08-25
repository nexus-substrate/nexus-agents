---
'nexus-agents': minor
---

score research recency on the publication date, not the discovery date

`scoreRecency` read `item.discoveredAt` — when _we_ found the source. Every one
of the five producers stamps that with `getToday()`, so `daysSince` was always
≈0, the documented 730-day decay was unreachable, and 20% of every composite
score was the constant 1.0. A 2019 paper and a 2026 preprint scored identically.

`DiscoveredSource` gains an optional `publishedAt`, and recency is scored from
it. Three of the four producers already had the data and were discarding it:

- **OpenAlex** — `publication_date` was in the zod schema and dropped at the mapper.
- **Semantic Scholar** — `year` only; mapped to Jan 1, which never scores a paper
  fresher than it is.
- **arXiv** — `<published>` is on every entry and `extractTag` already existed;
  it was simply never called for that tag.
- **GitHub** — needed a schema field. Uses `pushed_at`, not `created_at`: for a
  repository the recency signal is last activity, not project age.

`QualityScore` gains `recencyMeasured`. When no publication date is available
recency is the neutral 0.5 rather than 1.0 — an unknown age is not evidence of
freshness, which is how this term became a constant in the first place.

**Composite scores will move**, and downward for older items. That shifts which
items clear the `>= 0.6` gate for `--create-issues` and the `>= 0.8` P1
threshold. The previous uniform +0.2 was inflation, so this is the correction
rather than a regression.

Fixes #4841.
