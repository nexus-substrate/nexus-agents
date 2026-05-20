---
'nexus-agents': patch
---

**feat(cli):** `nexus-agents doctor` reports per-subdir data paths grouped by the state-split. Closes #2892 (epic #2887).

Before, `doctor` reported a single `~/.nexus-agents/` root and `checkDataDirectory()` did `join(getNexusDataDir(), name)` — which (like #2889) bypassed the per-repo router, so the _reported_ paths were wrong after the epic #2872 flip.

`checkDataDirectory()` now resolves each subdir through `nexusDataPath()` (the real location), tags it `per-repo` or `cross-repo`, and exposes `repoRoot`. The doctor output groups accordingly:

```
✓ Data directory layout:
  Per-repo — /repo/.nexus-agents (5/7)
    ✓ sessions     /repo/.nexus-agents/sessions
    ✓ audit        /repo/.nexus-agents/audit
    · pipeline     /repo/.nexus-agents/pipeline  (missing — created on first use)
    …
  Cross-repo — /home/u/.nexus-agents (7/7)
    ✓ learning     /home/u/.nexus-agents/learning
    ✓ auth         /home/u/.nexus-agents/auth
    …
```

`DataSubdirStatus` gains a `scope` field; `DataDirectoryCheck` gains `repoRoot`. Tests added covering scope tagging + the `repoRoot` field.
