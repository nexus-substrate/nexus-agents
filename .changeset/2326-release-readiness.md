---
'nexus-agents': patch
---

Release-readiness doc audit fixes (#2326).

- `server.json` is now auto-synced by `scripts/inject-governance.ts` — top-level `version`, every `packages[*].version`, and the `description`'s "N MCP tools" count all track `package.json` and the canonical tool registry. Drifted to 2.53.0 (10 minor versions stale) before the sync; `governance:check` now fails on regression.
- Root `CHANGELOG.md` replaced with a one-line redirect to `packages/nexus-agents/CHANGELOG.md` (the changesets-managed source of truth).
- `README.md` updated: removed the false "Devin / Factory adapters in flight" claim, reframed the pr_review benchmark line with the source citation and headline numbers (100% bug-catch, 50% raw FP, n=10), clarified `consensus_vote` default panel size (7 voters; pr_review uses 5), replaced "9-stage CompositeRouter" with "multi-stage".
- `packages/nexus-agents/README.md` and `llms-install.md` no longer hardcode tool/expert/stage counts that drift; they reference `docs/ENTRYPOINTS.md` for the canonical list.
