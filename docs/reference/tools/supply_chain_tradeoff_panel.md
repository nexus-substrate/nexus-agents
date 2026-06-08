---
title: 'MCP Tool: supply_chain_tradeoff_panel'
description: 'Per-axis tradeoff vote for build-vs-buy / supply-chain decisions'
tier: 2
keywords: [mcp, tool, reference, supply_chain_tradeoff_panel]
---

# `supply_chain_tradeoff_panel`

> Auto-generated from the registered MCP tool descriptions and input
> schemas. Do not edit by hand — run `pnpm docs:tools` to regenerate.

Run a structured per-axis tradeoff vote on an engineering proposal (#2294, child of #2293). Default axes: build_time_determinism / supply_chain_risk / update_cadence; custom axes accepted. Voters answer EACH axis independently and the aggregator surfaces per-axis verdicts so legitimate tradeoffs are not masked by a single approve/reject. Use for build-vs-buy, dependency adoption, and supply-chain decisions.

## Parameters

| Parameter | Type | Required | Description |
| --------- | ---- | -------- | ----------- |
| `proposal` | string | yes | The proposal under tradeoff review (e.g. "Should aegis-boot adopt cargo-nextest?") |
| `axes` | array | no | Tradeoff axes to evaluate. Default: . Custom axes accepted; max . |
| `context` | string | no | Optional context: relevant repo state, dependency tree, vendor publishing patterns, etc. |
| `quickMode` | boolean | no | Use 3 voters (architect, security, scope_steward) instead of 7 |
| `simulate` | boolean | no | Use simulated voters (testing only) |
| `dispatch` | enum: sync \| async | no | Dispatch mode (#3731). 'sync' (default): run inline. 'async': return a jobId immediately + run the panel in background (poll get_job_result). |
