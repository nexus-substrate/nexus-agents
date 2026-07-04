---
'nexus-agents': patch
---

feat(cli): did-you-mean suggestions + tracking hint for unknown commands (#3207)

`handleUnimplementedCommand` now, for a recognized-but-unbuilt subcommand,
surfaces the closest _implemented_ sibling by edit distance (reusing the
Levenshtein-backed `suggestCommand` matcher from #3211 — e.g. `workflow lst`
→ `Did you mean: workflow list?`) and points the user at the repo issue
tracker to file or upvote the missing command. Near-miss-only: an unbuilt
command with no close sibling (e.g. `expert create`) stays silent rather than
guessing.
