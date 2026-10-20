---
title: 'MCP Tool: query_trace'
description: 'Query execution traces for observability'
diataxis: reference
audience: user
tier: 2
keywords: [mcp, tool, reference, query_trace]
---

# `query_trace`

> Auto-generated from the registered MCP tool descriptions and input
> schemas. Do not edit by hand — run `pnpm docs:tools` to regenerate.

Query execution traces by run ID. Returns agent and model attribution for pipeline runs including decision paths, error taxonomy, timing and snapshot-bound attribution counts. run_related is logical session participation only: reused/concurrent invocations are indistinguishable; no attempt, worker or settlement proof.

## Parameters

| Parameter | Type | Required | Constraints | Description |
| --------- | ---- | -------- | ----------- | ----------- |
| `runId` | string | yes | minLength 1; maxLength 128; pattern `^[a-zA-Z0-9_-]+$` | Run ID to query traces for |
| `eventType` | string | no | maxLength 100; pattern `^[a-zA-Z0-9._-]+$` | Filter by event type |
| `limit` | number | no | min 1; max 500 | Max events to return (default: 100) |
