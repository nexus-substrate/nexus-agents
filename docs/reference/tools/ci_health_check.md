---
title: 'MCP Tool: ci_health_check'
description: 'CI infrastructure health — composes GitHub status + recent-runs activity (#3076)'
tier: 2
keywords: [mcp, tool, reference, ci_health_check]
---

# `ci_health_check`

> Auto-generated from the registered MCP tool descriptions and input
> schemas. Do not edit by hand — run `pnpm docs:tools` to regenerate.

Diagnostic for CI infrastructure health (#3076). Composes GitHub status-page state (githubstatus.com/api/v2/components.json) + the configured repo's recent workflow-runs activity into one verdict { status: healthy|degraded|outage|unknown, signals }. Pessimistic combination — repo-level wedge downgrades a healthy status page. Use BEFORE long auto-merge waits to skip the wedge cycle when CI is broken org-wide. Reads GitHub state only; appends a local CI-health telemetry event per call (no remote state mutated, not strictly idempotent).

## Parameters

| Parameter | Type | Required | Description |
| --------- | ---- | -------- | ----------- |
| `repo` | string | no | GitHub repo (owner/repo) to check for recent CI activity. Optional. |
| `activityWindowMinutes` | number | no | Recent-runs lookback window in minutes (5-180; default 30). |
