---
'nexus-agents': patch
---

Paper quality scoring no longer counts a missing citation count as citations. A registry entry with `citation_count: null` (or a non-numeric value) used to score 1 citation point, and NaN scored 3. Both now score 0, the same as an absent count, when a paper is added to the research registry. A venue with no letters in it, such as a bare year or whitespace, is also classified as no venue (tier 0) instead of tier 1.

`scripts/backfill-research-quality.ts` now scores papers with the package's own quality scorer instead of a separately maintained copy, so backfilled scores and evidence tiers match the ones assigned when a paper is added. Its Semantic Scholar lookups, `--dry-run` and write-back behave as before. The documented `--limit N` form now works; it used to be ignored and the script processed every paper (only `--limit=N` took effect).
