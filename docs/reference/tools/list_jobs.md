---
title: 'MCP Tool: list_jobs'
description: 'List async-mode jobs across all tools — cross-session discovery (#3046 / #2631)'
tier: 2
keywords: [mcp, tool, reference, list_jobs]
---

# `list_jobs`

> Auto-generated from the registered MCP tool descriptions and input
> schemas. Do not edit by hand — run `pnpm docs:tools` to regenerate.

List async-mode jobs across all tools (#3046 / epic #2631 Stage 5). Cross-session discovery — returns summaries (jobId/toolName/status/timestamps) sorted newest-first. Optional filters: toolName (exact match), status (pending|complete|failed|cancelled), limit (1-200). Result payloads excluded — fetch full records via get_job_result(jobId).

## Parameters

| Parameter | Type | Required | Description |
| --------- | ---- | -------- | ----------- |
| `toolName` | string | no | Filter to one tool (exact match). |
| `status` | JobStatusSchema | no | Filter to pending \| complete \| failed \| cancelled. Omit for all. |
| `limit` | number | no | Max summaries to return (1- , newest first). |
