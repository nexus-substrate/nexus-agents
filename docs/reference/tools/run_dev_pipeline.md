---
title: 'MCP Tool: run_dev_pipeline'
description: 'Full dev pipeline: research, plan, vote, implement, QA'
tier: 2
keywords: [mcp, tool, reference, run_dev_pipeline]
---

# `run_dev_pipeline`

> Auto-generated from the registered MCP tool descriptions and input
> schemas. Do not edit by hand — run `pnpm docs:tools` to regenerate.

Run the multi-agent development pipeline. Accepts direct task instructions, a plan file, or a spec file. Supports dry-run (plan+vote only). Supports dispatch: 'async' (non-dryRun runs) — returns a jobId immediately; poll get_job_result.

## Parameters

| Parameter | Type | Required | Constraints | Description |
| --------- | ---- | -------- | ----------- | ----------- |
| `task` | string | no | maxLength 10000 | Direct task instructions (what to build) |
| `planFile` | string | no | maxLength 500 | Path to a plan/spec file to use as input |
| `dryRun` | boolean | no | default false | If true, stop after plan+vote (no implementation) |
| `maxVoteIterations` | integer | no | min 1; max 5; default 3 | Max plan→vote iterations |
| `maxQaIterations` | integer | no | min 1; max 5; default 3 | Max QA review iterations per task |
| `workingDir` | string | no | maxLength 500 | Working directory (default: cwd) |
| `issueNumber` | integer | no | max 9007199254740991; > 0 | GitHub issue to post progress to |
| `repo` | string | no | maxLength 200 | GitHub repo for issue tracking (e.g., owner/repo) |
| `trackerBackend` | enum | no | one of: github \| gitlab \| json; default json | Task tracking backend for issue creation |
| `labels` | array of string | no | — | Labels for created issues |
| `sessionId` | string | no | maxLength 128; pattern `^[a-zA-Z0-9_-]+$` | Session ID for checkpoint/resume (crash recovery) |
| `simulateVotes` | boolean | no | default false | TESTS ONLY — random output, must not be used for real decisions (#2319) |
| `votingStrategy` | enum | no | one of: simple_majority \| supermajority \| unanimous \| higher_order \| proof_of_learning \| opinion_wise | Voting strategy for plan approval (default: higher_order) |
| `quickMode` | boolean | no | default false | Use 3 agents instead of 6 for faster consensus voting |
| `timeoutMs` | integer | no | min 30000; max 600000 | Max time per stage in ms (30000-600000). Default: varies by stage complexity |
| `mode` | enum | no | one of: autonomous \| harness; default autonomous | 'autonomous': full pipeline. 'harness': stops after decompose, returns tasks for caller to implement. |
| `dispatch` | enum | no | one of: sync \| async; default sync | Dispatch mode (#3726). 'sync' (default): run inline. 'async': return a jobId immediately + run in background (poll get_job_result). Ignored for dryRun. |
| `qualityGate` | enum | no | one of: off \| advisory \| blocking; default off | Pre-ship local quality gate. 'off' (default): skip. 'advisory': run + record feedback, never fail. 'blocking': a red gate fails the pipeline. |
| `maxBudgetTokens` | integer | no | max 9007199254740991; > 0 | Per-run token ceiling (#3395). When set, expert calls stop (returning failures) once cumulative usage crosses it — a hard-stop safety cap for unattended/multi-day runs. Omit to disable (default). |
