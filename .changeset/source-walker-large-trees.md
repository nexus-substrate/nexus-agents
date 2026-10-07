---
'nexus-agents': patch
---

`search_codebase` and `search_usages` no longer fail with "Maximum call stack size exceeded" when run at a repository root. The shared source-file walker now appends files one at a time instead of spreading each subdirectory's results into a single call, which threw a RangeError once a subtree held more than about 120k files. It also no longer descends into dot-directories such as `.git` and `.nexus-agents`, in addition to `node_modules` and `dist`. A walk rooted at a dot-directory is still allowed.
