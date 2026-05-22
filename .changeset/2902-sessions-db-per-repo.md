---
'nexus-agents': patch
---

**fix(config):** route `sessions.db` per-repo, with a one-time legacy migration. Closes #2902.

The session database resolved via `nexusDataPath('sessions.db')`. Because the data-dir router (epic #2872) keys on the first path segment and `sessions.db` is not in `PER_REPO_SUBDIRS`, the DB landed cross-repo at `~/.nexus-agents/sessions.db` — while the session journals directory `sessions/` correctly routed per-repo. A session DB started in repo A was visible when working in repo B.

Resolved per consensus vote on #2902 (approved 3/3): the session DB is per-repo episodic data and belongs in the `sessions/` bucket alongside the journals (vote #2876 categorized `sessions/` as per-repo). New canonical `sessionsDbPath()` in `config/nexus-data-dir.ts` resolves `nexusDataPath('sessions', 'sessions.db')`; both `getDefaultDbPath()` helpers delegate to it.

On first resolution per process, a guarded one-time migration relocates any pre-existing legacy DB (and its SQLite sidecars) from the old cross-repo path to the new per-repo path — so existing session history is preserved, not silently orphaned (the gating condition all three voters flagged). The move is best-effort: cross-filesystem moves fall back to copy+unlink, and any failure leaves the legacy DB untouched for manual recovery. `NEXUS_DATA_DIR` / `NEXUS_REPO_PREFERRED` / `NEXUS_SESSIONS_DB` overrides are unaffected.
