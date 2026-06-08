---
title: 'MCP Tool: query_task_state'
description: 'Query the structured task-state log for a task ID'
tier: 2
keywords: [mcp, tool, reference, query_task_state]
---

# `query_task_state`

> Auto-generated from the registered MCP tool descriptions and input
> schemas. Do not edit by hand — run `pnpm docs:tools` to regenerate.

Read the structured task-state log for a task ID and return the current snapshot. Requires NEXUS_TASK_STATE_ENABLED=1 during the originating orchestrate call.

## Parameters

| Parameter | Type | Required | Description |
| --------- | ---- | -------- | ----------- |
| `taskId` | string | yes | Task ID whose structured state log should be read |
