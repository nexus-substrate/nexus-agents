---
'nexus-agents': patch
---

fix(docops): escape backslashes before pipes in the ENTRYPOINTS table generator

Resolves a HIGH `js/incomplete-sanitization` CodeQL alert in
`entrypointsToolDescription` (#3334): it escaped `|` for markdown-table safety but
not backslashes first, so a description containing a backslash could smuggle a
half-escaped pipe past the escaping. Now escapes `\` → `\\` before `|` → `\|`.
Behavior-preserving (the curated tool descriptions contain no backslashes;
inject output is unchanged).
