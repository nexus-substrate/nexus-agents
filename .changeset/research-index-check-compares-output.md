---
'nexus-agents': patch
---

`scripts/update-research-index.ts` now writes `docs/research/RESEARCH_INDEX.md` through prettier (the same pass lint-staged applies to the committed file), so `pnpm research:generate` followed by a commit is a genuine no-op instead of a ~180-line column-padding diff that prettier then reverted. When the committed index is byte-identical to a regeneration under its own date stamp, the generator leaves the file and its stamp untouched.

`pnpm research:check` now regenerates the index in memory and compares it against the committed body, reporting the first differing line with the expected and on-disk text, in addition to the existing registry-checksum comparison. Before this, the check answered only "is the index derived from the current registries?" — a hand-edit to the generated body passed CI as long as `papers.yaml` and `techniques.yaml` were unchanged, and was silently discarded on the next unrelated regeneration. The two causes (stale checksum, body differs) are measured and reported independently, and the generation date is not treated as drift.
