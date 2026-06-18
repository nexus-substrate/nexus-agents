---
title: 'MCP Tool: run_pipeline'
description: 'Execute a pipeline plugin by name with typed input'
tier: 2
keywords: [mcp, tool, reference, run_pipeline]
---

# `run_pipeline`

> Auto-generated from the registered MCP tool descriptions and input
> schemas. Do not edit by hand — run `pnpm docs:tools` to regenerate.

Single unified entry point for all pipeline templates (dev/research/audit/greenfield/general). Auto-detects template from task content or accepts an explicit override.

## Parameters

| Parameter | Type | Required | Constraints | Description |
| --------- | ---- | -------- | ----------- | ----------- |
| `task` | string | yes | minLength 5; maxLength 10000 | Task description — pipeline template auto-selected based on content |
| `specFile` | string | no | maxLength 500 | Path to a spec file — content prepended to task for greenfield projects |
| `template` | string | no | maxLength 50 | Pipeline template override. Available: dev, audit, greenfield, general |
| `votingStrategy` | enum | no | one of: simple_majority \| supermajority \| unanimous \| higher_order \| proof_of_learning \| opinion_wise | Voting strategy for plan approval. simple_majority (default), supermajority (67%), unanimous, higher_order (Bayesian), proof_of_learning, opinion_wise |
| `quickMode` | boolean | no | default false | Use 3 agents instead of 6 for faster consensus voting |
| `timeoutMs` | integer | no | min 30000; max 600000 | Max time per stage in ms (30000-600000). Default: varies by stage complexity |
| `dryRun` | boolean | no | default false | Stop after vote stage (no implementation) |
| `dispatch` | enum | no | one of: sync \| async; default sync | Dispatch mode (#3730). 'sync' (default): run inline. 'async': return a jobId immediately + run in background (poll get_job_result). Ignored for dryRun. |
| `simulateVotes` | boolean | no | default false | TESTS ONLY — random output, must not be used for real decisions (#2319) |
