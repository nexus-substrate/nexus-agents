---
title: 'MCP Tool: query_trace'
description: 'Query execution traces for observability'
tier: 2
keywords: [mcp, tool, reference, query_trace]
---

# `query_trace`

> Auto-generated from the registered MCP tool descriptions and input
> schemas. Do not edit by hand — run `pnpm docs:tools` to regenerate.

Query execution traces by run ID (reads the trace JSONL files from disk). Returns agent and model attribution for pipeline runs — decision paths, error taxonomy, and timing data — with filtering by event type and pagination.

## Parameters

| Parameter | Type | Required | Description |
| --------- | ---- | -------- | ----------- |
| `runId` | string | yes | Run ID to query traces for |
| `eventType` | string | no | Filter by event type |
| `limit` | number | no | Max events to return (default: 100) |
