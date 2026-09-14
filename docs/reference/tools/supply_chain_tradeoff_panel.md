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

| Parameter | Type | Required | Constraints | Description |
| --------- | ---- | -------- | ----------- | ----------- |
| `proposal` | string | yes | minLength 1; maxLength 4000 | The proposal under tradeoff review (e.g. "Should aegis-boot adopt cargo-nextest?") |
| `axes` | array of string | no | — | Tradeoff axes to evaluate. Default: build_time_determinism, supply_chain_risk, update_cadence. Custom axes accepted; max 6. |
| `context` | string | no | maxLength 4000 | Optional context: relevant repo state, dependency tree, vendor publishing patterns, etc. |
| `quickMode` | boolean | no | default false | Use 3 voters (architect, security, scope_steward) instead of 7 |
| `simulate` | boolean | no | default false | Use simulated voters (testing only) |
| `project` | string | no | pattern `^[A-Za-z0-9._/@-]{1,200}$` | The project the panel is judging (#6110), e.g. `acme/widgets` — it replaces `nexus-agents` in every voter's system prompt, so a consuming repository is not judged against this one's mission and governance files. When omitted the name is DERIVED from the server's working directory (the `origin` remote as `owner/repo`, else the nearest `package.json` name) and falls back to `nexus-agents`; the response discloses which on `project.source`. Letters, digits and `._/@-` only, at most 200 characters. |
| `dispatch` | enum | no | one of: sync \| async; default sync | Async dispatch (#4968). 'sync' (default): run inline and return the result. 'async': return { status: 'pending', jobId } immediately and run in the background; poll get_job_result({ jobId }). |
| `mode` | never | no | — | Not an input of this tool. The async switch is `dispatch`; `mode: 'async'` is rejected (#4968). |
