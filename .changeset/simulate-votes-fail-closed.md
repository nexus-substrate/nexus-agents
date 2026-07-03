---
'nexus-agents': minor
---

Simulated voting now FAILS CLOSED outside test runners (#4170). The old simulation guard only logged a one-shot warning and proceeded — a caller-supplied simulate flag could resolve a random panel to `outcome: 'approved'` with zero live voters and manufacture a governance approval. All five MCP tools that feed the simulation machinery — `consensus_vote`, `run_pipeline`, `run_dev_pipeline`, `pr_review`, and `supply_chain_tradeoff_panel` — now reject such requests early (sync and async modes identically) with a structured `permission` error naming the explicit opt-in, `NEXUS_ALLOW_SIMULATE=1` (demos only). Opted-in pipeline runs stamp `simulated: true` on their output; the review/panel tools already carry per-vote `source: 'simulation'` provenance. Test-runner behavior (vitest/NODE_ENV=test) is unchanged.
