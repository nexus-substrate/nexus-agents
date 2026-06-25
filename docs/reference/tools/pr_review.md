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

| Parameter | Type | Required | Constraints | Description |
| --------- | ---- | -------- | ----------- | ----------- |
| `prTitle` | string | yes | minLength 1; maxLength 500 | PR title |
| `prDescription` | string | no | maxLength 10000 | PR body / description |
| `prDiff` | string | yes | minLength 1; maxLength 50000 | Unified diff text (max 50000 chars; truncate before calling) |
| `repoContext` | string | no | maxLength 2000 | Optional one-paragraph repo context (architecture, conventions) |
| `baseRef` | string | no | maxLength 200 | Base branch ref (e.g. main) |
| `headRef` | string | no | maxLength 200 | Head branch ref |
| `prNumber` | integer | no | max 9007199254740991; > 0 | PR number — with baseSha, enables Option-C audit-record persistence (#4031) |
| `baseSha` | string | no | pattern `^[0-9a-f]{40}$` | 40-hex base commit sha the reviewed diff was computed from (Option-C binding, #4031) |
| `simulate` | boolean | no | default false | Use simulated voters (testing only; never ship live with this true) |
| `dispatch` | enum | no | one of: sync \| async; default sync | Dispatch mode (#3731). 'sync' (default): run inline. 'async': return a jobId immediately + run the panel in background (poll get_job_result). |
