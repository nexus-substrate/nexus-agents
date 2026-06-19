---
'nexus-agents': patch
---

fix(governance): canonicalize vote-record hash + resolve NEXUS_VOTE_RECORDS_PATH to absolute (#3962, #3963)

- #3962 (MEDIUM): `computeVoteRecordHash` now rebuilds the nested `voteCounts`
  object field-by-field in schema order (`approve, reject, abstain, total`)
  before hashing, matching how `voters[]` elements are already rebuilt. Previously
  `voteCounts` was passed straight to `JSON.stringify`, so the self-hash depended
  on key insertion order — a formatter / `jq -S` / merge tool that reordered
  `voteCounts` keys flipped a legitimate committed record to `hash_mismatch`,
  defeating the merge-safety premise of the record-set model. The hash of a
  record whose keys are already in canonical order is unchanged, so existing
  writer-produced records still verify without a rewrite.
- #3963 (LOW): `resolveVoteRecordsPath` now resolves a relative
  `NEXUS_VOTE_RECORDS_PATH` override to an absolute path against `process.cwd()`
  instead of returning it verbatim, honoring the documented absolute-path
  contract and removing a silent cwd-dependent write. Absolute values are
  returned unchanged; whitespace-only values still fall through to repo-root
  detection. JSDoc updated to match.
