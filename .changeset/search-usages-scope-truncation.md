---
'nexus-agents': patch
---

`search_usages` now reports a scan that did not cover its scope. `truncated`
meant match-overflow only, so a walk cut short by `maxDepth` — or a file list
cut by the 5000-file cap — returned "0 usages" with no qualifier, and
`filesScanned`, being the size of the already-truncated set, corroborated the
wrong answer instead of qualifying it. `findSourceFiles` returns `skippedDirs`
as a documented truncation signal and it was destructured away at the point of
production; the sibling `search_codebase` surfaces the same walk's count
(#4243). The output now carries `scopeTruncated`, `skippedDirs`, `omittedFiles`
and a note saying that absence of matches here is not absence of usages.
