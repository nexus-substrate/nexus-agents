---
title: 'MCP Tool: run_dev_pipeline'
description: 'Full dev pipeline: research, plan, vote, implement, QA'
tier: 2
keywords: [mcp, tool, reference, run_dev_pipeline]
---

# `run_dev_pipeline`

> Auto-generated from the registered MCP tool descriptions and input
> schemas. Do not edit by hand — run `pnpm docs:tools` to regenerate.

Run the multi-agent development pipeline. Accepts direct task instructions, a plan file, or a spec file. Supports dry-run (plan+vote only).

## Parameters

| Parameter | Type | Required | Description |
| --------- | ---- | -------- | ----------- |
| `task` | string | no | Direct task instructions (what to build) |
| `planFile` | string | no | Path to a plan/spec file to use as input |
| `dryRun` | boolean | no | If true, stop after plan+vote (no implementation) |
| `maxVoteIterations` | number | no | Max plan→vote iterations |
| `maxQaIterations` | number | no | Max QA review iterations per task |
| `workingDir` | string | no | Working directory (default: cwd) |
| `issueNumber` | number | no | GitHub issue to post progress to |
| `repo` | string | no | GitHub repo for issue tracking (e.g., owner/repo) |
| `trackerBackend` | enum: github \| gitlab \| json | no | Task tracking backend for issue creation |
| `labels` | array | no | Labels for created issues |
| `sessionId` | string | no | Session ID for checkpoint/resume (crash recovery) |
| `simulateVotes` | boolean | no | TESTS ONLY — random output, must not be used for real decisions (#2319) |
| `votingStrategy` | enum: simple_majority \| supermajority \| unanimous \| higher_order \| proof_of_learning \| opinion_wise | no | Voting strategy for plan approval (default: higher_order) |
| `quickMode` | boolean | no | Use 3 agents instead of 6 for faster consensus voting |
| `timeoutMs` | number | no | Max time per stage in ms (30000-600000). Default: varies by stage complexity |
| `mode` | enum: autonomous \| harness | no | 'autonomous': full pipeline. 'harness': stops after decompose, returns tasks for caller to implement. |
| `dispatch` | enum: sync \| async | no | Dispatch mode (#3726). 'sync' (default): run inline. 'async': return a jobId immediately + run in background (poll get_job_result). Ignored for dryRun. |
| `qualityGate` | enum: off \| advisory \| blocking | no | Pre-ship local quality gate. 'off' (default): skip. 'advisory': run + record feedback, never fail. 'blocking': a red gate fails the pipeline. |
| `maxBudgetTokens` | number | no | Per-run token ceiling (#3395). When set, expert calls stop (returning failures) once cumulative usage crosses it — a hard-stop safety cap for unattended/multi-day runs. Omit to disable (default). |
