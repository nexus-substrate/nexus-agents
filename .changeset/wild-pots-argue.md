---
'nexus-agents': minor
---

Route scratch files to a repo-local gitignored directory instead of the shared `/tmp` (#4412)

Throwaway git worktrees, generated MCP configs, and system-prompt files were written straight into `os.tmpdir()`. That is a shared space with no owner and no budget — when an unrelated tool filled it, this repo's test suite failed to _collect_ ~1,100 files while reporting zero assertion failures, a disk fault that presents as a code fault.

Scratch now resolves through `getNexusTmpDir()`: `NEXUS_TMPDIR` if set, else `<dataDir>/tmp` via the existing data-dir resolution (so it inherits the per-repo, sandbox, and writability logic and lands inside the already-gitignored `.nexus-agents/` tree), else `os.tmpdir()` as a fail-open fallback. Scratch gets its own `tmp/` subdir so it can be reaped without touching sessions, traces, or the audit chain.
