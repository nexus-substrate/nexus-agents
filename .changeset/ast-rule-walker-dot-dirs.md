---
'nexus-agents': patch
---

The polyglot AST rule scanner (`runAstQaRules` / `collectAstQaFindings`) no longer descends into dot-directories. Scanning from a repository root used to walk `.nexus-agents/worktrees` and similar copies, so every Python/Go finding was reported once per worktree; `.git` was already skipped and `node_modules`/`dist` still are. The file walk also no longer throws `RangeError: Maximum call stack size exceeded` on trees with more than about 120k Python/Go files. A scan rooted at a dot-directory still scans it.
