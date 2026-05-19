---
'nexus-agents': minor
---

**feat(config):** repo-preferred data directory is now the default behavior — runtime artifacts for per-repo work land in `<repo>/.nexus-agents/` automatically. Final piece of epic #2872 (vote #2876).

When nexus-agents runs inside a git repo, per-repo state (sessions, checkpoints, traces, runs, audit, pipeline, tasks) now lands in `<repo-root>/.nexus-agents/<subdir>/` instead of `~/.nexus-agents/`. Cross-repo state (learning, voting, memory, weather, research, auth, usage) still goes to `~/.nexus-agents/` so the cross-project learning loop from #1389 / #1407 stays intact — vote #2876 made this state-category split a hard condition.

## Auto-gitignore

On first resolution per process per repo, `.nexus-agents/` is auto-appended to `<repo>/.gitignore` (idempotent — won't duplicate). This is the fail-closed behavior required by the security review in vote #2876.

## Escape hatches preserved

- `NEXUS_REPO_PREFERRED=0` — fully opt out; behaves like the previous homedir-default release.
- `NEXUS_DATA_DIR=~/.nexus-agents` — explicit override wins over the tier AND the categorization both. Users with cross-repo workflows can pin to homedir for everything.
- `NEXUS_GITIGNORE_AUTO=0` — silences the auto-gitignore append (useful on CI runners with a frozen working tree).

## Migration

If you have existing state in `~/.nexus-agents/` you want to keep working with, run `nexus-agents migrate` (shipped in the previous release via #2879) **before** running any other nexus-agents command in your repo. The migrate command copies per-repo subdirs from homedir → `<repo>/.nexus-agents/` (source untouched, cross-repo subdirs skipped, destination conflicts skipped).

Users with multi-repo cross-pollination workflows who want to keep the old behavior should add `export NEXUS_DATA_DIR=$HOME/.nexus-agents` to their shell rc.

Closes the final piece of epic #2872. After this lands, running `nexus-agents` in a fresh repo produces one new top-level entry — `.nexus-agents/`, auto-gitignored, containing every per-repo runtime artifact. Removing that one directory fully resets the repo's state.
