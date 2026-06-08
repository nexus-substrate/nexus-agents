---
title: 'MCP Tool: pr_review'
description: 'Multi-voter PR review with verification gate (experimental)'
tier: 2
keywords: [mcp, tool, reference, pr_review]
---

# `pr_review`

> Auto-generated from the registered MCP tool descriptions and input
> schemas. Do not edit by hand — run `pnpm docs:tools` to regenerate.

Run multi-voter consensus review on a PR diff (#2233). 5 voters (architect, security, devex, catfish, scope_steward) each emit approve/request_changes/abstain with reasoning and citations. Reuses consensus_vote infra; experimental.

## Parameters

| Parameter | Type | Required | Description |
| --------- | ---- | -------- | ----------- |
| `prTitle` | string | yes | PR title |
| `prDescription` | string | no | PR body / description |
| `prDiff` | string | yes | Unified diff text (max chars; truncate before calling) |
| `repoContext` | string | no | Optional one-paragraph repo context (architecture, conventions) |
| `baseRef` | string | no | Base branch ref (e.g. main) |
| `headRef` | string | no | Head branch ref |
| `simulate` | boolean | no | Use simulated voters (testing only; never ship live with this true) |
| `dispatch` | enum: sync \| async | no | Dispatch mode (#3731). 'sync' (default): run inline. 'async': return a jobId immediately + run the panel in background (poll get_job_result). |
