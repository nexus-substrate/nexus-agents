---
'nexus-agents': patch
---

fix(release): auto-regen plugin.json + repo-index + TypeDoc during version bump (#1879)

Every release left main with stale `.claude-plugin/plugin.json`, `artifacts/repo-index.json`, `docs/reference/capabilities.md`, and TypeDoc HTML — which then failed Governance Drift / Repository Index Verification / TypeDoc Verification checks on every subsequent PR until someone manually pushed a regen commit.

Extended `pnpm changeset:version` to chain the regen scripts after the version bump. `changesets/action` runs this script when opening the version-bump PR, so the regenerated artifacts land in the same PR as the version bump and main stays in sync after merge. Future PRs no longer trigger drift failures.
