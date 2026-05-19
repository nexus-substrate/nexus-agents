---
'nexus-agents': minor
---

**feat(config):** opt-in repo-preferred data dir with state-category split (`NEXUS_REPO_PREFERRED=1`). Closes #2882 (epic #2872, ratified by vote #2876).

When `NEXUS_REPO_PREFERRED=1` is set and the caller is inside a git repo, runtime state splits across two locations per its sharing semantics:

| Category       | Subdirs                                                                                        | Location                              |
| -------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------- |
| **Per-repo**   | `sessions/`, `checkpoints/`, `traces/`, `runs/`, `audit/`, `pipeline/`, `tasks/`               | `<repo-root>/.nexus-agents/<subdir>/` |
| **Cross-repo** | `learning/`, `voting/`, `memory/`, `weather/`, `research/`, `auth/`, `usage/`, models manifest | `~/.nexus-agents/<subdir>/`           |

The split preserves the cross-project learning loop (#1389 / #1407) — outcomes, routing memory, weather, and model registry stay homedir-scoped so routing quality on low-sample repos isn't degraded. Per-repo work goes per-repo. The state-category split was a hard condition surfaced in vote #2876 by Architect, DevEx, PM, Scope Steward, and Catfish.

**Behavior is opt-in this release** so users with months of homedir state aren't silently orphaned. The follow-up minor will flip the default to ON after #2879 (`nexus-agents migrate`) lands.

Mechanism: new `getNexusRepoDir()` helper detects the ancestor `.git` (walks upward, handles git worktrees where `.git` is a file, stops at filesystem boundaries, realpath defense). `nexusDataPath(subdir, ...)` checks the first segment against the per-repo allowlist and routes accordingly — existing callsites don't need to change. New `nexusSharedPath(...)` helper for code that wants a hard homedir guarantee. New `repo-root-detection.ts` module is testable in isolation.

Resolution order (final):

1. `NEXUS_DATA_DIR` env (explicit override — wins for both categories)
2. Sandbox mode (`NEXUS_SANDBOX` — unchanged)
3. **NEW:** `NEXUS_REPO_PREFERRED=1` + `.git` ancestor → per-repo for allowlisted subdirs, homedir for everything else
4. Homedir fallback for both categories when not opted in

Tests: 11 new in `nexus-data-dir.test.ts` (env-gated routing, state-split regression guards, walk-upward), 8 new in `repo-root-detection.test.ts` (worktrees, nested repos, symlinks, no-`.git` fallback).
