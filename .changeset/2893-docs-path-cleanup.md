---
'nexus-agents': patch
---

**docs:** align documentation + source docstrings with the post-#2872 data-directory split. Closes #2893 (epic #2887).

After epics #2872 / #2887 flipped the default to a per-repo data directory, 15 user-facing doc references and several source docstrings still claimed everything lives under `~/.nexus-agents/`. This corrects them:

- **`docs/getting-started/INSTALLATION.md`** — the Data Storage section now has a per-repo / cross-repo scope column and explains the `NEXUS_DATA_DIR` / `NEXUS_REPO_PREFERRED` / sandbox-fallback behavior.
- **`docs/guides/SANDBOXED-USAGE.md`** — the "forcing the behavior you want" table updated; `NEXUS_REPO_PREFERRED=0` documented as the pre-#2872 opt-out.
- **`docs/architecture/SECURITY.md`** — audit-log paths corrected to `<repo>/.nexus-agents/audit/` (`audit/` is per-repo); `auth/` paths left as-is (correctly cross-repo).
- **`docs/getting-started/CONFIGURATION.md`, `docs/getting-started/FIRST_TASK.md`, `docs/TROUBLESHOOTING.md`, `CLAUDE.md`** — per-repo vs cross-repo paths corrected and contextualized.
- **Source docstrings** in `doctor.ts`, `setup-data-dir.ts`, `verify-command.ts`, `pipeline-checkpoint.ts`, `wave-checkpoint-persistence.ts`, `wave-checkpoint-types.ts` — corrected to reflect the split.
- **`handler-utils.test.ts`** — added a clarifying comment: `sessions.db` (a top-level file) resolves cross-repo, distinct from the per-repo `sessions/` directory. The test was already correct — the audit's "misleading" flag was a false positive.

No behavior change — documentation + comments only.
