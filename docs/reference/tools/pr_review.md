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
| `prDiff` | string | yes | minLength 1; maxLength 2000000 | Unified diff text (max 2000000 chars). No need to truncate before calling: diffs over 50000 chars are security-prioritized and PARTIALLY reviewed (lowest-priority whole files dropped; coverage reported on the response, and a partial review can block but never verified-approve). |
| `repoContext` | string | no | maxLength 2000 | Optional one-paragraph repo context (architecture, conventions; max 2000 chars; trim before calling) |
| `baseRef` | string | no | maxLength 200 | Base branch ref (e.g. main) |
| `headRef` | string | no | maxLength 200 | Head branch ref |
| `prNumber` | integer | no | max 9007199254740991; > 0 | PR number — with baseSha, enables Option-C audit-record persistence (#4031) |
| `baseSha` | string | no | pattern `^[0-9a-f]{40}$` | 40-hex base commit sha the reviewed diff was computed from (Option-C binding, #4031) |
| `repoPath` | string | no | maxLength 1024 | Repo root path for persisting the governance pr-review record (overrides cwd auto-detection). Must contain a .git ancestor — relative paths are resolved against cwd; ignored (falls back to cwd auto-detection) if it is not a real repo root. Env NEXUS_PR_REVIEW_RECORDS_PATH still takes precedence and is unrestricted. |
| `simulate` | boolean | no | default false | Use simulated voters (testing only; never ship live with this true) |
| `errorPolicy` | enum | no | one of: standard \| absolute_quorum; default standard | Error policy (#4132). 'standard' (default): errored voters excluded. 'absolute_quorum': any errored voter — esp. the contrarian — degrades a would-be approve to a recoverable abstain (verified:false); never manufactures a verified approve from an induced error. |
| `dispatch` | enum | no | one of: sync \| async; default sync | Dispatch mode (#3731). 'sync' (default): run inline. 'async': return a jobId immediately + run the panel in background (poll get_job_result). |
