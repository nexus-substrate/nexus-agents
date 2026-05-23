---
'nexus-agents': patch
---

**docs(config):** rewrite the env-var contract in `docs/getting-started/CONFIGURATION.md`. Closes #2954.

The env-var section had drifted from production. Three classes of bug:

- **Default mismatches (operator-impacting).** `NEXUS_VOTE_TIMEOUT_MS` was documented as `60000` but `VOTE_TIMEOUTS.defaultMs` is `300_000` (raised in #1640 — architecture/security experts averaged 315s). An operator setting "the default" got 1/5 the real budget. `NEXUS_EXPERT_TIMEOUT_MS` was documented as `120000` but the system uses tiered `standardMs=300_000` / `complexMs=600_000` (the `120_000` value is only the `execute_expert`-specific floor).
- **Fictional vars (silent no-ops).** Removed 8 entries with zero production references: `NEXUS_API_ENABLED`, `NEXUS_API_KEY`, `NEXUS_API_PORT`, `NEXUS_BUDGET_TOKENS`, `NEXUS_BUDGET_COST_USD`, `NEXUS_ROUTING_ALPHA`, `NEXUS_LOG_FORMAT`, `NEXUS_SANDBOX_MODE` (was a typo for `NEXUS_SANDBOX`). Also removed the matching fictional REST-API YAML block (`api:` config) from the sample `nexus-agents.yaml`.
- **Undocumented user-facing vars.** Added 11 real vars: `NEXUS_CONSOLE`, `NEXUS_DATA_DIR`, `NEXUS_REPO_PREFERRED`, `NEXUS_PORTABLE_MODE`, `NEXUS_GITIGNORE_AUTO`, `NEXUS_NO_SCAFFOLD`, `NEXUS_CONTEXT_RETRIEVER_INJECT`, `NEXUS_OPENAI_COMPAT_URL`, `NEXUS_OPENAI_COMPAT_KEY`, `NEXUS_OPENCODE_CONFIG`, plus the `GEMINI_API_KEY` alias for `GOOGLE_AI_API_KEY`. The `NEXUS_OPENAI_COMPAT_*` pair configures an entire adapter route (epic #2500); operators had no way to discover it.

Single-file change. Doc-only — no code/behavior change.
