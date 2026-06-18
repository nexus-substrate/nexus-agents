---
'nexus-agents': patch
---

docs: add "Configuration for Reusable Pipelines" section to CONFIGURATION.md (#3253)

Documents configuration composition and the project-level vs user-level split:
how billing mode, data dir / repo-preferred, and model tiers / sandbox affect a
composed pipeline; which settings belong in a committed project config vs
per-user environment overrides; and how the loader resolves them (single-file
selection, first match wins, with env vars overlaying per-setting). Claims
verified against `config-loader.ts`, `nexus-data-dir.ts`, and
`decision-cost-recording.ts`.
