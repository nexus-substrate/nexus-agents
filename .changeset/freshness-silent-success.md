---
'nexus-agents': patch
---

`index freshness` no longer reports `success: true` / "0 documents are fresh" when invoked from outside the nexus-agents source repo (#2720 brainstorm item #5).

Pre-fix `hasIssues = stale > 0 || warning > 0` ignored `summary.unknown`. When run from any directory that doesn't contain the tracked docs (README.md, ARCHITECTURE.md, CLAUDE.md, etc.) — typically because `projectRoot` defaulted to `process.cwd()` — all 7 tracked documents came back `unknown`, `hasIssues` stayed `false`, and the command exited successfully with the misleading message. Same surface-vs-state shape as #2716 (fitness-audit silently passing from outside the repo).

The fix: include `summary.unknown` in `hasIssues`, and when _every_ tracked doc is unknown (`unknown === total`) emit a wrong-CWD hint instead of a generic stale/warning summary. Two regression tests pin both behaviors — verified to fail on pre-fix logic with the expected "expected '0 stale...' to contain 'No tracked documents found'" error.

The dispatcher still translates `success: false` to exit 0 (separate `result.exitCode` plumbing issue, not in scope for this PR); the visible message change is the immediate correctness fix.
