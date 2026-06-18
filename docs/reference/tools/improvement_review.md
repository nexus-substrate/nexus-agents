---
title: 'MCP Tool: improvement_review'
description: 'Threshold-gated observability loop — surfaces routing/tech-debt/bug/security signals from outcome+fitness data; files candidate issues'
tier: 2
keywords: [mcp, tool, reference, improvement_review]
---

# `improvement_review`

> Auto-generated from the registered MCP tool descriptions and input
> schemas. Do not edit by hand — run `pnpm docs:tools` to regenerate.

Periodic threshold-gated observability-driven improvement loop (#2402). Reads OutcomeStore, fitness-audit, and recent failure patterns; surfaces signals that cross documented thresholds (CLI success rate < 60% with ≥5 samples, fitness score below floor, failure-category concentration > 50%). When fileIssues=true, files candidate GitHub issues via gh CLI (rate-limited to 5 per run, deduped against open issues). Never auto-merges. Replaces the deleted self-development engine.

## Parameters

| Parameter | Type | Required | Constraints | Description |
| --------- | ---- | -------- | ----------- | ----------- |
| `lookbackDays` | integer | no | min 1; max 90; default 7 | Lookback window for outcome data, in days. Default 7. |
| `fileIssues` | boolean | no | default false | When true, file candidate issues via `gh issue create` for crossed thresholds (rate-limited to 5 per run, deduped against open issues). When false (default), return signals only. |
| `minSampleSize` | integer | no | min 1; max 1000; default 5 | Minimum sample size before a CLI/category signal can fire. |
| `fitnessFloor` | integer | no | min 0; max 100; default 90 | Fitness score below this threshold triggers a tech-debt signal. |
| `selfEvalReportPath` | string | no | — | Optional path to a self-eval JSON report (from `self-eval --json`). When set, high-confidence unanimous deprecate/refactor findings are surfaced as tech-debt signals through the same deduped/rate-limited issue path (#3224). Unreadable/malformed reports are skipped (no signal). Absent → no self-eval signals. |
