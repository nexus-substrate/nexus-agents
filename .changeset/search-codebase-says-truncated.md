---
'nexus-agents': patch
---

`search_codebase` now says when `limit` cut its result set short. The header read
`"20 results for ..."` whether 20 or 340 symbols matched, so a caller searching a
common name took a capped set for the complete one. `CodebaseIndex` gains
`searchWithTotal`, which reports the pre-limit match count, and the tool appends
the omitted count with an explicit "this is not the complete match set". The
sibling `search_usages` has carried `truncated`/`omittedMatches`/`limit` since it
was written; this closes the gap.
