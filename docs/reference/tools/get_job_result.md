---
title: 'MCP Tool: get_job_result'
description: 'Read result of an async-mode dispatch by jobId (#3042 / #2631)'
tier: 2
keywords: [mcp, tool, reference, get_job_result]
---

# `get_job_result`

> Auto-generated from the registered MCP tool descriptions and input
> schemas. Do not edit by hand — run `pnpm docs:tools` to regenerate.

Read the result of an async-mode tool invocation by jobId (#3042 / epic #2631). Returns the structured record (status, result | error, timestamps). Poll until status !== "pending". Stage 1 of the async-mode pattern — Stage 2 will fold this into query_task_state once StructuredTaskState gains the result field.

## Parameters

| Parameter | Type | Required | Constraints | Description |
| --------- | ---- | -------- | ----------- | ----------- |
| `jobId` | string | yes | minLength 1; maxLength 128 | Job ID returned by orchestrate({ mode: "async" }) |
