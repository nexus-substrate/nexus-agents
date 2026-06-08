---
title: 'MCP Tool: memory_query'
description: 'Query across all memory backends'
tier: 2
keywords: [mcp, tool, reference, memory_query]
---

# `memory_query`

> Auto-generated from the registered MCP tool descriptions and input
> schemas. Do not edit by hand — run `pnpm docs:tools` to regenerate.

Query across all memory backends with unified results and relevance scoring.

## Parameters

| Parameter | Type | Required | Description |
| --------- | ---- | -------- | ----------- |
| `query` | string | yes | Search query to match against memory contents |
| `limit` | number | no | Maximum results to return (default: 10, max: 50) |
| `source` | enum: session \| belief \| agentic \| typed \| adaptive \| all | no | Filter by memory source (default: all) |
