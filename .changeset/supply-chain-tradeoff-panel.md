---
'nexus-agents': minor
---

feat(mcp): add `supply_chain_tradeoff_panel` tool for per-axis engineering tradeoff votes (#2294, child of #2293)

Wraps the existing consensus voter infrastructure with a structured per-axis schema for build-vs-buy, dependency adoption, and supply-chain decisions. Default axes: `build_time_determinism` / `supply_chain_risk` / `update_cadence`; custom axes accepted up to 6.

Voters answer EACH axis independently in a single round; the aggregator surfaces per-axis verdicts so legitimate tradeoffs (e.g., "approves on cadence, rejects on supply-chain") aren't masked by a single approve/reject. Final panel decision: `approve` only when all axes approve; `reject` if any axis rejects; `mixed` otherwise.

Reuses the 7-role default panel (or 3-role quickMode); no new external surface area. MCP tool count: 33 → 34.
