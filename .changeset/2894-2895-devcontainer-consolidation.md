---
'nexus-agents': patch
---

**chore(ci):** `.devcontainer/` for contributor parity + a docker-compose consolidation E2E test. Closes #2894 + #2895 (epic #2887).

## `.devcontainer/devcontainer.json` (#2894)

A Node 22 + pnpm 9.15.0 devcontainer pinned to match CI. Contributors get a one-click CI-identical environment; `pnpm install && pnpm test` works with zero manual setup. No change to CI or anyone's existing local workflow.

## Consolidation E2E test (#2895)

`docker-compose.consolidation-test.yml` + `scripts/consolidation-test.sh` verify the epic-#2872 directory contract against a real filesystem in a clean container — the bug class unit tests can't catch because they mock `fs`. Two modes:

- **normal** — writable homedir. Asserts per-repo subdirs land in `<repo>/.nexus-agents/`, cross-repo subdirs in `$HOME/.nexus-agents/`, `.gitignore` carries the entry, no `runs/`/`logs/`/`.nexus-pipeline/` sprawl, and per-repo subdirs do NOT leak into homedir.
- **sandbox** — read-only homedir mount. Asserts cross-repo subdirs fall back to `<repo>/.nexus-agents/` per #2888.

Wired as a required `consolidation-test` CI job (gates merge via `ci-success`). No new Dockerfile — uses `node:22` directly.

## Bug caught + fixed

Building the test surfaced a real bug: `initDataDirectories()` created the homedir root up-front and aborted the _whole_ operation on EROFS — so a read-only-homedir sandbox got nothing, never reaching the per-repo subdirs (which ARE writable). Fixed: dropped the explicit root `ensureDir` (recursive mkdir of each subdir creates its parent) and made per-subdir failures non-fatal. This is what makes the #2888 sandbox-fallback actually usable from `setup`.
