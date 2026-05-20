---
'nexus-agents': patch
---

**feat(cli):** `nexus-agents setup` auto-gitignores `.nexus-agents/` + prints a data-layout hint. Closes #2891 (epic #2887).

The auto-gitignore landed in `getNexusRepoDir()` (epic #2872) but only fired lazily on the first resolver call — a user who ran `setup` and read its output had no idea where state would live. Setup now, at the end of a successful run:

- Calls `ensureGitignored(repoRoot, '.nexus-agents/')` explicitly so the entry is present immediately (idempotent — won't duplicate).
- Prints a "Data layout" section explaining per-repo (`.nexus-agents/`) vs cross-project (`~/.nexus-agents/`) state and pointing at `nexus-agents doctor` for the full picture.

Skipped on `--dry-run` (nothing was installed) and when not inside a git repo. Both the interactive and non-interactive setup paths are covered.

4 tests in `setup-command.test.ts`: appends the entry, idempotent on an existing entry, no-op on dry-run, no-op outside a repo.
