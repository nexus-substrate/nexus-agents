---
'nexus-agents': patch
---

The GitHub provider now fetches every page of a list endpoint. A bare
`gh api repos/o/r/pulls/N/files` returns GitHub's default first page of 30 and
discards the `Link` cursor, so a PR review saw at most 30 changed files of any
PR and reported `reviewCoverage: 'full'` against that truncated denominator —
"30 of 30 files reviewed" posted on a 120-file PR while 90 files were never
fetched. `listCommentDetails` had the same cap on the 30 OLDEST comments, which
made issue-triage's recent-comment flood signal structurally unable to fire on
any thread past 30 comments.
