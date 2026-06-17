---
'nexus-agents': patch
---

refactor(eval): PrReviewEvalStore delegates persistence to the shared JsonlStore<T> (#3906)

DRY follow-up to #3848. `PrReviewEvalStore` no longer hand-rolls JSONL
persistence (`readFileSync` + `content.split('\n')` + per-line Zod validate +
corrupt-line skip + `appendFileSync`). It now delegates all file I/O to a
`JsonlStore<VoterEvalVerdict>` instance — the same shared #3762 primitive the
sibling tool-fitness ledger (#3851) builds on — for hydrate-on-construct,
append-on-write, per-line Zod validation, corrupt-line skip, and bounded
oldest-eviction rotation.

Pure internal refactor: the public API (`size`, `append`, `query`,
`reportPrecisionRecall`, constructor signature), the persistence path
(`getPrReviewEvalFile()` under the learning dir), the report surface, and all
existing #3848 tests are unchanged. The store now owns ONLY the eval schema,
query filtering, and report folding; persistence is the primitive's. A generous
default retention cap (`maxRecords`) is added (overridable, mainly for tests) so
the file stays bounded — previously it could grow without limit.
