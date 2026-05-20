---
'nexus-agents': patch
---

**fix(config):** route per-repo subdir writes through `nexusDataPath()` so the epic-#2872 state-split actually fires. Closes #2889 (epic #2887).

Two callers joined a per-repo subdir directly under `getNexusDataDir()` instead of going through `nexusDataPath()`. The manual join bypassed the per-repo routing — so the state landed in homedir even with `NEXUS_REPO_PREFERRED` ON, partly defeating the consolidation epic #2872 shipped.

- **`pipeline-runner.ts` — `getDefaultRunsDir()`** did `join(getNexusDataDir(), 'runs')`. `runs` is a per-repo subdir, so pipeline trace output went to `~/.nexus-agents/runs/` instead of `<repo>/.nexus-agents/runs/`. Now `nexusDataPath('runs')`.
- **`setup-data-dir.ts` — `initDataDirectories()`** did `join(NEXUS_DATA_DIR, subdir)` for every subdir in `DATA_SUBDIRECTORIES`, pre-creating `sessions/`, `checkpoints/`, `audit/` (all per-repo) in homedir. Now each subdir routes through `nexusDataPath(...subdir.split('/'))` so per-repo subdirs land in `<repo>/.nexus-agents/` and cross-repo subdirs in homedir.

No behavior change when `NEXUS_DATA_DIR` is explicitly set or `NEXUS_REPO_PREFERRED=0` — both paths still resolve identically. The fix only matters when the repo-preferred default is active, which is where it was silently not working.

Tests: a per-repo-routing test added to each of `pipeline-runner.test.ts` and `setup-data-dir.test.ts`; existing homedir-path tests fenced with `NEXUS_REPO_PREFERRED=0` to keep testing the homedir branch explicitly.
