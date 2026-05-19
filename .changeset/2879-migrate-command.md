---
'nexus-agents': minor
---

**feat(cli):** `nexus-agents migrate` relocates homedir state into `<repo>/.nexus-agents/` for users adopting the repo-preferred resolver. Closes #2879 (epic #2872).

Required companion to #2882 — without this, opting into `NEXUS_REPO_PREFERRED=1` silently orphans users' existing homedir state. Vote #2876 made this an explicit gate (PM + Catfish dissent: "shipping #2882 without migrate orphans existing users' homedir state").

## Behavior

```bash
nexus-agents migrate            # copy per-repo state from ~/.nexus-agents to <repo>/.nexus-agents
nexus-agents migrate --dry-run  # report the plan without writing
nexus-agents migrate --input <path>   # custom source (default: ~/.nexus-agents)
nexus-agents migrate --output <path>  # custom target (default: <repo>/.nexus-agents)
```

Source is never modified (uses `cpSync`, not move). Cross-repo subdirs (`learning`, `voting`, `memory`, `weather`, `research`, `auth`, `usage`) are SKIPPED with an explicit status — they stay homedir-scoped per the #2882 state-split contract. Target subdirs that already contain state are SKIPPED (no merge, no overwrite). Empty source subdirs are SKIPPED.

The per-repo allowlist is read from `getPerRepoSubdirs()` (single source of truth in `nexus-data-dir.ts`) so the migration mirror always matches the resolver.

## Tests

11 tests in `migrate-command.test.ts` covering: empty source (no-op), per-repo copy, cross-repo skip, existing-target skip, empty-source skip, dry-run (writes nothing), missing-repo failure, explicit `--to` override outside a repo, mixed source (copies per-repo and skips every cross-repo subdir), and formatter output for success/dry-run/failure states.
