---
'nexus-agents': minor
---

feat(context): repo-map context provider — pull-shaped, usage-aware, measured (#4254)

Wire the existing module-import graph (`indexer` `ModuleEntry.dependsOn`, built by
`buildIndex`) into context assembly as a ranked, token-budgeted repo-map, gated behind
the new default-off `NEXUS_REPO_MAP` flag (Phase 3 of epic #4251).

- **Pull-shaped / rank-gated:** contributes only when `NEXUS_REPO_MAP=1` AND the task
  plausibly spans multiple modules (`taskNeedsRepoMap`) — never pushed onto every call.
- **PageRank** over the import graph orders entries; the block is budget-clipped
  (reusing the #4253 char/4 `clampToTokenBudget` mechanism).
- **Usage-aware caveat:** every rendered map carries an explicit "import-graph only,
  no call-site data" caveat (call-site edges are #4249-A, not built).
- **Measured:** the emitted token count is recorded in the token ledger tagged
  `contextSource: 'repo-map'`, best-effort/never-throws.
- **Fresh, not persisted:** the default index provider rebuilds from the current source
  tree each call — no stale-map path.

Flag off ⇒ `getContextForTask` output is byte-for-byte unchanged.
